import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { PrismaClient } from '@prisma/client'
import { uploadSite, uploadDirectory } from './massa'
import { registerMns } from './mns'
import { cfg } from '../config'
import jwt from 'jsonwebtoken'

const exec = promisify(execFile)
const prisma = new PrismaClient()

const log = (label: string, msg: string) => console.log(`[github-deploy:${label}] ${msg}`)

async function githubFetch(url: string, token: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
  })
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${url}`)
  return res.json()
}

async function fetchGithubFile(repoOwner: string, repoName: string, branch: string, filePath: string, token: string): Promise<string | null> {
  try {
    const data = await githubFetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePath.replace(/^\//, '')}?ref=${branch}`,
      token
    ) as any
    return Buffer.from(data.content, 'base64').toString('utf8')
  } catch {
    return null
  }
}

async function inlineGithubAssets(html: string, repoOwner: string, repoName: string, branch: string, token: string): Promise<string> {
  const cssRe = /<link[^>]+(?:rel=["']stylesheet["'][^>]*href=["']([^"']+)["']|href=["']([^"']+)["'][^>]*rel=["']stylesheet["'])[^>]*\/?>/gi
  const jsRe  = /<script([^>]*)\bsrc=["']([^"']+)["']([^>]*)><\/script>/gi

  const cssMatches = [...html.matchAll(cssRe)]
  for (const m of cssMatches) {
    const href = m[1] || m[2]
    if (!href || href.startsWith('http') || href.startsWith('//') || href.startsWith('data:')) continue
    const content = await fetchGithubFile(repoOwner, repoName, branch, href, token)
    if (content) html = html.replace(m[0], `<style>${content}</style>`)
  }

  const jsMatches = [...html.matchAll(jsRe)]
  for (const m of jsMatches) {
    const src = m[2]
    if (!src || src.startsWith('http') || src.startsWith('//') || src.startsWith('data:')) continue
    const content = await fetchGithubFile(repoOwner, repoName, branch, src, token)
    if (content) html = html.replace(m[0], `<script>${content}</script>`)
  }

  return html
}

function githubAppJwt() {
  if (!cfg.githubAppId || !cfg.githubAppPrivateKey) throw new Error('GitHub App is not configured.')
  const now = Math.floor(Date.now() / 1000)
  return jwt.sign(
    { iat: now - 60, exp: now + 9 * 60, iss: cfg.githubAppId },
    cfg.githubAppPrivateKey,
    { algorithm: 'RS256' }
  )
}

async function createInstallationToken(installationId: string): Promise<string> {
  const res = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${githubAppJwt()}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  if (!res.ok) throw new Error(`Could not create GitHub installation token: ${res.status}`)
  const data = await res.json() as any
  return data.token
}

export async function deployGitHubSite(connection: any, sha: string) {
  const { site, user, repoOwner, repoName, branch, projectType, buildCommand, outputDir, githubInstallationId } = connection
  const label = `${repoOwner}/${repoName}`
  const isInitialDeploy = !site.scAddress

  if (!githubInstallationId) {
    log(label, 'No GitHub App installation id - skipping deploy')
    return
  }

  const token = await createInstallationToken(githubInstallationId)

  // Deduct 1 credit (same as a manual update)
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { credits: { decrement: 1 } },
  })
  if (updated.credits < 0) {
    await prisma.user.update({ where: { id: user.id }, data: { credits: { increment: 1 } } })
    log(label, 'Insufficient credits — skipping deploy')
    return
  }

  // Create deployment record for activity feed
  const deployment = await prisma.deployment.create({
    data: {
      siteId: site.id,
      type: isInitialDeploy ? 'INITIAL' : 'UPDATE',
      status: 'UPLOADING',
      source: isInitialDeploy ? 'github_new' : 'github_push',
      commitSha: sha !== 'initial' ? sha.slice(0, 7) : undefined,
      step: 'Uploading to Massa chain...',
    },
  })

  await prisma.site.update({ where: { id: site.id }, data: { status: isInitialDeploy ? 'DEPLOYING' : 'UPDATING' } })

  let tmpDir: string | null = null
  try {
    if (projectType === 'static') {
      // Fetch index.html then inline any linked CSS/JS so the site is self-contained
      log(label, 'Fetching index.html from GitHub...')
      const fileData = await githubFetch(
        `https://api.github.com/repos/${repoOwner}/${repoName}/contents/index.html?ref=${branch}`,
        token
      ) as any
      const rawHtml = Buffer.from(fileData.content, 'base64').toString('utf8')

      log(label, 'Inlining linked CSS/JS assets...')
      const html = await inlineGithubAssets(rawHtml, repoOwner, repoName, branch, token)

      const { scAddress } = await uploadSite(html, site.title, site.description, site.scAddress || undefined,
        (s) => log(label, s))

      await finalizeDeploy(site, scAddress, sha, html, deployment.id)
    } else {
      // Framework build: clone → install → build → upload
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ctrlpoint-gh-'))
      log(label, `Cloning ${repoOwner}/${repoName}@${branch} into ${tmpDir}...`)

      const cloneUrl = `https://x-access-token:${token}@github.com/${repoOwner}/${repoName}.git`
      await exec('git', ['clone', '--depth=1', `--branch=${branch}`, cloneUrl, tmpDir], { timeout: 120_000 })

      log(label, 'Running npm install...')
      await exec('npm', ['install', '--prefer-offline', '--no-audit'], { cwd: tmpDir, timeout: 180_000 })

      log(label, `Running build command: ${buildCommand}`)
      const [cmd, ...args] = buildCommand.split(' ')
      await exec(cmd, args, { cwd: tmpDir, timeout: 300_000 })

      const buildDir = path.join(tmpDir, outputDir)
      const indexExists = await fs.access(path.join(buildDir, 'index.html')).then(() => true).catch(() => false)
      if (!indexExists) throw new Error(`Build output directory "${outputDir}" has no index.html. Check your build command and output directory setting.`)

      log(label, `Uploading ${buildDir} to DeWeb...`)
      const { scAddress } = await uploadDirectory(buildDir, site.title, site.description, site.scAddress || undefined,
        (s) => log(label, s))

      await finalizeDeploy(site, scAddress, sha, undefined, deployment.id)
    }

    log(label, 'Deploy complete')
    await prisma.deployment.update({ where: { id: deployment.id }, data: { status: 'COMPLETE', step: 'Live!' } })
  } catch (err: any) {
    log(label, `Deploy failed: ${err.message}`)
    await prisma.site.update({ where: { id: site.id }, data: { status: 'ERROR' } }).catch(() => {})
    await prisma.deployment.update({ where: { id: deployment.id }, data: { status: 'FAILED', step: 'Failed', errorMsg: err.message } }).catch(() => {})
    // Refund credit on failure
    await prisma.user.update({ where: { id: user.id }, data: { credits: { increment: 1 } } })
    throw err
  } finally {
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}

async function finalizeDeploy(site: any, scAddress: string, sha: string, html?: string, deploymentId?: string) {
  const isInitial = !site.scAddress

  if (isInitial) {
    if (deploymentId) await prisma.deployment.update({ where: { id: deploymentId }, data: { status: 'MNS_REGISTERING', step: 'Registering domain...' } })
    await registerMns(site.mnsName, scAddress)
  }

  await prisma.site.update({
    where: { id: site.id },
    data: {
      status: 'LIVE',
      scAddress,
      needsDeploy: false,
      ...(html ? { previousCode: site.generatedCode, generatedCode: html } : {}),
      updatedAt: new Date(),
    },
  })

  await prisma.gitHubConnection.update({
    where: { siteId: site.id },
    data: { lastDeployedSha: sha },
  })
}
