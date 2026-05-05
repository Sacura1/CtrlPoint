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
type PackageManager = 'npm' | 'pnpm' | 'yarn'

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
  const missing = [
    ['GITHUB_APP_ID', cfg.githubAppId],
    ['GITHUB_APP_PRIVATE_KEY', cfg.githubAppPrivateKey],
  ].filter(([, value]) => !value).map(([key]) => key)
  if (missing.length > 0) throw new Error(`GitHub App is not configured. Missing: ${missing.join(', ')}`)
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

async function fileExists(filePath: string): Promise<boolean> {
  return fs.access(filePath).then(() => true).catch(() => false)
}

async function readJson<T = any>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8')) as T
  } catch {
    return null
  }
}

async function detectPackageManager(repoDir: string): Promise<PackageManager> {
  if (await fileExists(path.join(repoDir, 'pnpm-lock.yaml'))) return 'pnpm'
  if (await fileExists(path.join(repoDir, 'yarn.lock'))) return 'yarn'
  return 'npm'
}

async function runCommand(command: string, args: string[], cwd: string, timeout: number) {
  try {
    return await exec(command, args, { cwd, timeout })
  } catch (err: any) {
    const detail = String(err?.stderr || err?.stdout || err?.message || '').trim()
    throw new Error(detail.slice(0, 900) || `${command} ${args.join(' ')} failed.`)
  }
}

async function ensureCorepack(repoDir: string, pm: PackageManager) {
  if (pm === 'npm') return
  await runCommand('corepack', ['enable'], repoDir, 60_000).catch(() => {})
}

async function installDependencies(repoDir: string, label: string): Promise<PackageManager> {
  const pm = await detectPackageManager(repoDir)
  await ensureCorepack(repoDir, pm)

  if (pm === 'pnpm') {
    log(label, 'Installing dependencies with pnpm...')
    await runCommand('pnpm', ['install', '--frozen-lockfile'], repoDir, 240_000)
    return pm
  }

  if (pm === 'yarn') {
    log(label, 'Installing dependencies with yarn...')
    await runCommand('yarn', ['install', '--frozen-lockfile'], repoDir, 240_000)
    return pm
  }

  if (await fileExists(path.join(repoDir, 'package-lock.json'))) {
    log(label, 'Installing dependencies with npm ci...')
    await runCommand('npm', ['ci', '--prefer-offline', '--no-audit'], repoDir, 240_000)
  } else {
    log(label, 'Installing dependencies with npm install...')
    await runCommand('npm', ['install', '--prefer-offline', '--no-audit'], repoDir, 240_000)
  }
  return pm
}

function normalizeBuildCommand(buildCommand: string, pm: PackageManager): string[] {
  const trimmed = (buildCommand || 'npm run build').trim()
  if (trimmed === 'npm run build' && pm === 'pnpm') return ['pnpm', 'run', 'build']
  if (trimmed === 'npm run build' && pm === 'yarn') return ['yarn', 'build']
  return trimmed.split(/\s+/)
}

async function runBuild(repoDir: string, buildCommand: string, pm: PackageManager, label: string) {
  const [cmd, ...args] = normalizeBuildCommand(buildCommand, pm)
  log(label, `Running build command: ${[cmd, ...args].join(' ')}`)
  await runCommand(cmd, args, repoDir, 420_000)
}

async function resolveBuildDir(repoDir: string, configuredOutputDir: string): Promise<string> {
  const configured = path.join(repoDir, configuredOutputDir || 'dist')
  if (await fileExists(path.join(configured, 'index.html'))) return configured

  const candidates = ['dist', 'build', 'out']
  for (const candidate of candidates) {
    const dir = path.join(repoDir, candidate)
    if (dir !== configured && await fileExists(path.join(dir, 'index.html'))) return dir
  }

  return configured
}

async function explainMissingIndex(repoDir: string, outputDir: string): Promise<string> {
  const pkg = await readJson<{ dependencies?: Record<string, string>; devDependencies?: Record<string, string> }>(path.join(repoDir, 'package.json'))
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) }
  const hasNext = Boolean(deps.next || await fileExists(path.join(repoDir, 'next.config.js')) || await fileExists(path.join(repoDir, 'next.config.mjs')))

  if (hasNext) {
    return 'Build finished, but no static index.html was found. Next.js apps must be configured for static export and usually use output directory "out". CtrlPoint cannot deploy SSR, API routes, or server actions.'
  }

  return `Build finished, but "${outputDir}/index.html" was not found. Set Output Dir to the folder your build creates, commonly "dist" for Vite, "build" for Create React App, or "out" for static Next.js export.`
}

export async function deployGitHubSite(connection: any, sha: string, deploymentId: string) {
  const { site, user, repoOwner, repoName, branch, projectType, buildCommand, outputDir, githubInstallationId } = connection
  const label = `${repoOwner}/${repoName}`
  const isInitialDeploy = !site.scAddress

  if (!githubInstallationId) {
    log(label, 'No GitHub App installation id - skipping deploy')
    return
  }

  const token = await createInstallationToken(githubInstallationId)

  await prisma.site.update({ where: { id: site.id }, data: { status: isInitialDeploy ? 'DEPLOYING' : 'UPDATING' } })

  let tmpDir: string | null = null
  try {
    if (projectType === 'static') {
      await prisma.deployment.update({
        where: { id: deploymentId },
        data: { status: 'UPLOADING', step: 'Fetching static site from GitHub...' },
      })
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
        (s) => {
          log(label, s)
          prisma.deployment.update({ where: { id: deploymentId }, data: { status: 'UPLOADING', step: s, updatedAt: new Date() } }).catch(() => {})
        })

      await finalizeDeploy(site, scAddress, sha, html, deploymentId)
    } else {
      await prisma.deployment.update({
        where: { id: deploymentId },
        data: { status: 'BUILDING', step: 'Building project...' },
      })
      // Framework build: clone -> install -> build -> upload
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ctrlpoint-gh-'))
      log(label, `Cloning ${repoOwner}/${repoName}@${branch} into ${tmpDir}...`)

      const cloneUrl = `https://x-access-token:${token}@github.com/${repoOwner}/${repoName}.git`
      await runCommand('git', ['clone', '--depth=1', `--branch=${branch}`, cloneUrl, tmpDir], process.cwd(), 120_000)

      const pm = await installDependencies(tmpDir, label)
      await runBuild(tmpDir, buildCommand, pm, label)

      const buildDir = await resolveBuildDir(tmpDir, outputDir)
      const indexExists = await fileExists(path.join(buildDir, 'index.html'))
      if (!indexExists) throw new Error(await explainMissingIndex(tmpDir, outputDir))

      log(label, `Uploading ${buildDir} to DeWeb...`)
      await prisma.deployment.update({ where: { id: deploymentId }, data: { status: 'UPLOADING', step: 'Uploading build output to DeWeb...' } })
      const { scAddress } = await uploadDirectory(buildDir, site.title, site.description, site.scAddress || undefined,
        (s) => {
          log(label, s)
          prisma.deployment.update({ where: { id: deploymentId }, data: { status: 'UPLOADING', step: s, updatedAt: new Date() } }).catch(() => {})
        })

      await finalizeDeploy(site, scAddress, sha, undefined, deploymentId)
    }

    log(label, 'Deploy complete')
    await prisma.deployment.update({ where: { id: deploymentId }, data: { status: 'COMPLETE', step: 'Live!' } })
  } catch (err: any) {
    log(label, `Deploy failed: ${err.message}`)
    await prisma.site.update({ where: { id: site.id }, data: { status: 'ERROR' } }).catch(() => {})
    await prisma.deployment.update({ where: { id: deploymentId }, data: { status: 'FAILED', step: 'Failed', errorMsg: err.message } }).catch(() => {})
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
