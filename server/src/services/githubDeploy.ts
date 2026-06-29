import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import prisma from '../lib/prisma'
import { uploadSite, uploadDirectory } from './massa'
import { registerMns } from './mns'
import { cfg } from '../config'
import jwt from 'jsonwebtoken'

const exec = promisify(execFile)

const log = (label: string, msg: string) => console.log(`[github-deploy:${label}] ${msg}`)
type PackageManager = 'npm' | 'pnpm' | 'yarn'
const MAX_BUILD_LOG_CHARS = 60_000

function redactBuildLog(value: string): string {
  return value
    .replace(/https:\/\/x-access-token:[^@\s]+@github\.com/gi, 'https://x-access-token:***@github.com')
    .replace(/(GITHUB_TOKEN|GH_TOKEN|NPM_TOKEN|OPENAI_API_KEY|ANTHROPIC_API_KEY|POLAR_ACCESS_TOKEN|STRIPE_SECRET_KEY)=\S+/gi, '$1=***')
    .replace(/\r/g, '')
}

export async function appendDeploymentBuildLog(deploymentId: string | undefined, chunk: string) {
  if (!deploymentId || !chunk) return
  const clean = redactBuildLog(chunk)
  try {
    const current = await prisma.deployment.findUnique({
      where: { id: deploymentId },
      select: { buildLog: true },
    })
    const next = `${current?.buildLog || ''}${clean}`.slice(-MAX_BUILD_LOG_CHARS)
    await prisma.deployment.update({
      where: { id: deploymentId },
      data: { buildLog: next, updatedAt: new Date() },
    })
  } catch {
    // Build logs are diagnostic only; never fail a deployment because logging failed.
  }
}

async function githubFetch(url: string, token: string) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
  })
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${url}`)
  return res.json()
}

async function fetchGithubFile(repoOwner: string, repoName: string, ref: string, filePath: string, token: string): Promise<string | null> {
  try {
    const data = await githubFetch(
      `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filePath.replace(/^\//, '')}?ref=${ref}`,
      token
    ) as any
    return Buffer.from(data.content, 'base64').toString('utf8')
  } catch {
    return null
  }
}

async function inlineGithubAssets(html: string, repoOwner: string, repoName: string, ref: string, token: string): Promise<string> {
  const cssRe = /<link[^>]+(?:rel=["']stylesheet["'][^>]*href=["']([^"']+)["']|href=["']([^"']+)["'][^>]*rel=["']stylesheet["'])[^>]*\/?>/gi
  const jsRe  = /<script([^>]*)\bsrc=["']([^"']+)["']([^>]*)><\/script>/gi

  const cssMatches = [...html.matchAll(cssRe)]
  for (const m of cssMatches) {
    const href = m[1] || m[2]
    if (!href || href.startsWith('http') || href.startsWith('//') || href.startsWith('data:')) continue
    const content = await fetchGithubFile(repoOwner, repoName, ref, href, token)
    if (content) html = html.replace(m[0], `<style>${content}</style>`)
  }

  const jsMatches = [...html.matchAll(jsRe)]
  for (const m of jsMatches) {
    const src = m[2]
    if (!src || src.startsWith('http') || src.startsWith('//') || src.startsWith('data:')) continue
    const content = await fetchGithubFile(repoOwner, repoName, ref, src, token)
    if (content) html = html.replace(m[0], `<script>${content}</script>`)
  }

  return html
}

async function assertStaticGithubHtmlIsDeployable(html: string, repoOwner: string, repoName: string, ref: string, token: string) {
  const packageJson = await fetchGithubFile(repoOwner, repoName, ref, 'package.json', token)
  const looksLikeSourceApp =
    /<script[^>]+type=["']module["'][^>]+src=["'][^"']*\/src\//i.test(html) ||
    /<script[^>]+src=["'][^"']*\/src\/[^"']*\.(tsx?|jsx?)["']/i.test(html)

  if (looksLikeSourceApp || packageJson) {
    throw new Error('This repository looks like a framework/source app, not a ready static site. Set Project type to Framework, then redeploy or roll back again.')
  }
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

export async function fileExists(filePath: string): Promise<boolean> {
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

async function runCommand(command: string, args: string[], cwd: string, timeout: number, env?: NodeJS.ProcessEnv, deploymentId?: string) {
  const printable = `${command} ${args.join(' ')}`
  await appendDeploymentBuildLog(deploymentId, `\n$ ${redactBuildLog(printable)}\n`)
  try {
    const result = await exec(command, args, { cwd, timeout, env: { ...process.env, ...(env || {}) } })
    if (result.stdout) await appendDeploymentBuildLog(deploymentId, result.stdout)
    if (result.stderr) await appendDeploymentBuildLog(deploymentId, result.stderr)
    return result
  } catch (err: any) {
    const detail = String(err?.stderr || err?.stdout || err?.message || '').trim()
    await appendDeploymentBuildLog(deploymentId, `${detail || err?.message || 'Command failed.'}\n`)
    throw new Error(redactBuildLog(detail).slice(0, 900) || `${command} ${args.join(' ')} failed.`)
  }
}

export function safeSubPath(value: string | undefined, fieldName: string): string {
  const normalized = (value || '').trim().replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '')
  if (!normalized) return ''
  const parts = normalized.split('/')
  if (parts.some(part => !part || part === '.' || part === '..')) {
    throw new Error(`${fieldName} must be a relative path inside the repository.`)
  }
  return normalized
}

export function parseBuildEnv(raw: string | null | undefined): NodeJS.ProcessEnv {
  if (!raw?.trim()) return {}
  const env: NodeJS.ProcessEnv = {}

  const normalized = raw
    .replace(/\\n/g, '\n')
    .replace(/\/n/g, '\n')
    .replace(/--(?=vite_[a-z0-9_]+=)/gi, '\n')
    .replace(/\s+(?=[A-Za-z_][A-Za-z0-9_]*=)/g, '\n')
  for (const line of normalized.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) throw new Error(`Invalid build env line "${trimmed}". Use KEY=value.`)
    const rawKey = trimmed.slice(0, eq).trim()
    const key = /^vite_/i.test(rawKey) ? rawKey.toUpperCase() : rawKey
    const value = trimmed.slice(eq + 1).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error(`Invalid build env key "${key}".`)
    env[key] = value
  }

  return env
}

async function ensureCorepack(repoDir: string, pm: PackageManager, deploymentId?: string) {
  if (pm === 'npm') return
  await runCommand('corepack', ['enable'], repoDir, 60_000, undefined, deploymentId).catch(() => {})
}

export async function installDependencies(repoDir: string, label: string, deploymentId?: string): Promise<PackageManager> {
  const pm = await detectPackageManager(repoDir)
  await ensureCorepack(repoDir, pm, deploymentId)

  if (pm === 'pnpm') {
    log(label, 'Installing dependencies with pnpm...')
    await runCommand('pnpm', ['install', '--frozen-lockfile'], repoDir, 240_000, undefined, deploymentId)
    return pm
  }

  if (pm === 'yarn') {
    log(label, 'Installing dependencies with yarn...')
    await runCommand('yarn', ['install', '--frozen-lockfile'], repoDir, 240_000, undefined, deploymentId)
    return pm
  }

  if (await fileExists(path.join(repoDir, 'package-lock.json'))) {
    log(label, 'Installing dependencies with npm ci...')
    await runCommand('npm', ['ci', '--prefer-offline', '--no-audit'], repoDir, 240_000, undefined, deploymentId)
  } else {
    log(label, 'Installing dependencies with npm install...')
    await runCommand('npm', ['install', '--prefer-offline', '--no-audit'], repoDir, 240_000, undefined, deploymentId)
  }
  return pm
}

function normalizeBuildCommand(buildCommand: string, pm: PackageManager): string[] {
  const trimmed = (buildCommand || 'npm run build').trim()
  if (trimmed === 'npm run build' && pm === 'pnpm') return ['pnpm', 'run', 'build']
  if (trimmed === 'npm run build' && pm === 'yarn') return ['yarn', 'build']
  return splitCommandArgs(trimmed)
}

function splitCommandChain(buildCommand: string): string[] {
  const trimmed = (buildCommand || 'npm run build').trim()
  const commands: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i]
    const next = trimmed[i + 1]

    if (quote) {
      current += ch
      if (ch === quote) quote = null
      continue
    }

    if (ch === '"' || ch === "'") {
      quote = ch
      current += ch
      continue
    }

    if (ch === '&' && next === '&') {
      if (current.trim()) commands.push(current.trim())
      current = ''
      i++
      continue
    }

    if (ch === ';' || ch === '|' || ch === '<' || ch === '>') {
      throw new Error('Build command only supports plain commands separated by &&.')
    }

    current += ch
  }

  if (quote) throw new Error('Build command has an unmatched quote.')
  if (current.trim()) commands.push(current.trim())
  return commands.length ? commands : ['npm run build']
}

function splitCommandArgs(command: string): string[] {
  const args: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null

  for (let i = 0; i < command.length; i++) {
    const ch = command[i]

    if (quote) {
      if (ch === quote) {
        quote = null
      } else {
        current += ch
      }
      continue
    }

    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }

    if (/\s/.test(ch)) {
      if (current) {
        args.push(current)
        current = ''
      }
      continue
    }

    current += ch
  }

  if (quote) throw new Error('Build command has an unmatched quote.')
  if (current) args.push(current)
  if (!args.length) throw new Error('Build command is empty.')
  return args
}

export async function runBuild(repoDir: string, buildCommand: string, pm: PackageManager, label: string, env: NodeJS.ProcessEnv, deploymentId?: string) {
  const commands = splitCommandChain(buildCommand)
  for (const command of commands) {
    const [cmd, ...args] = normalizeBuildCommand(command, pm)
    log(label, `Running build command: ${[cmd, ...args].join(' ')}`)
    await runCommand(cmd, args, repoDir, 420_000, env, deploymentId)
  }
}

export async function resolveBuildDir(repoDir: string, configuredOutputDir: string): Promise<string> {
  const configured = path.join(repoDir, configuredOutputDir || 'dist')
  if (await fileExists(path.join(configured, 'index.html'))) return configured

  const candidates = ['dist', 'build', 'out']
  for (const candidate of candidates) {
    const dir = path.join(repoDir, candidate)
    if (dir !== configured && await fileExists(path.join(dir, 'index.html'))) return dir
  }

  return configured
}

export async function explainMissingIndex(repoDir: string, outputDir: string): Promise<string> {
  const pkg = await readJson<{ dependencies?: Record<string, string>; devDependencies?: Record<string, string> }>(path.join(repoDir, 'package.json'))
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) }
  const hasNext = Boolean(deps.next || await fileExists(path.join(repoDir, 'next.config.js')) || await fileExists(path.join(repoDir, 'next.config.mjs')))

  if (hasNext) {
    return 'Build finished, but no static index.html was found. Next.js apps must be configured for static export and usually use output directory "out". CtrlPoint cannot deploy SSR, API routes, or server actions.'
  }

  return `Build finished, but "${outputDir}/index.html" was not found. Set Output Dir to the folder your build creates, commonly "dist" for Vite, "build" for Create React App, or "out" for static Next.js export.`
}

export async function deployGitHubSite(connection: any, sha: string, deploymentId: string) {
  const { site, user, repoOwner, repoName, branch, projectType, projectRoot, buildCommand, outputDir, buildEnv, githubInstallationId } = connection
  const label = `${repoOwner}/${repoName}`
  const isInitialDeploy = !site.scAddress
  const ref = sha && sha !== 'initial' ? sha : branch

  if (!githubInstallationId) {
    log(label, 'No GitHub App installation id - skipping deploy')
    throw new Error('GitHub App installation is missing for this repository.')
  }

  const token = await createInstallationToken(githubInstallationId)

  await prisma.site.update({ where: { id: site.id }, data: { status: isInitialDeploy ? 'DEPLOYING' : 'UPDATING' } })
  await prisma.deployment.update({ where: { id: deploymentId }, data: { buildLog: '' } }).catch(() => {})
  await appendDeploymentBuildLog(deploymentId, `Deployment started for ${label}@${ref}\nProject type: ${projectType}\n`)

  let tmpDir: string | null = null
  try {
    if (projectType === 'static') {
      await appendDeploymentBuildLog(deploymentId, 'Static deploy selected. No build command is run.\n')
      await prisma.deployment.update({
        where: { id: deploymentId },
        data: { status: 'UPLOADING', step: 'Fetching static site from GitHub...' },
      })
      // Fetch index.html then inline any linked CSS/JS so the site is self-contained
      log(label, 'Fetching index.html from GitHub...')
      const fileData = await githubFetch(
        `https://api.github.com/repos/${repoOwner}/${repoName}/contents/index.html?ref=${ref}`,
        token
      ) as any
      const rawHtml = Buffer.from(fileData.content, 'base64').toString('utf8')
      await assertStaticGithubHtmlIsDeployable(rawHtml, repoOwner, repoName, ref, token)

      log(label, 'Inlining linked CSS/JS assets...')
      const html = await inlineGithubAssets(rawHtml, repoOwner, repoName, ref, token)

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
      await runCommand('git', ['clone', '--depth=1', `--branch=${branch}`, cloneUrl, tmpDir], process.cwd(), 120_000, undefined, deploymentId)
      if (sha && sha !== 'initial') {
        await runCommand('git', ['fetch', '--depth=1', 'origin', sha], tmpDir, 120_000, undefined, deploymentId).catch(() => {})
        await runCommand('git', ['checkout', '--detach', sha], tmpDir, 120_000, undefined, deploymentId)
      }

      const root = safeSubPath(projectRoot, 'Project root')
      const buildCwd = root ? path.join(tmpDir, root) : tmpDir
      const rootPackage = path.join(buildCwd, 'package.json')
      if (!await fileExists(rootPackage)) {
        throw new Error(`Project root "${root || '.'}" does not contain package.json.`)
      }
      const buildEnvVars = parseBuildEnv(buildEnv)
      const envCount = Object.keys(buildEnvVars).length
      log(label, `Using project root: ${root || '.'}${envCount ? ` with ${envCount} build env var(s)` : ''}`)

      const pm = await installDependencies(buildCwd, label, deploymentId)
      await runBuild(buildCwd, buildCommand, pm, label, buildEnvVars, deploymentId)

      const output = safeSubPath(outputDir || 'dist', 'Output dir') || 'dist'
      const buildDir = await resolveBuildDir(buildCwd, output)
      const indexExists = await fileExists(path.join(buildDir, 'index.html'))
      if (!indexExists) {
        const message = await explainMissingIndex(buildCwd, output)
        await appendDeploymentBuildLog(deploymentId, `\n${message}\n`)
        throw new Error(message)
      }

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

  if (deploymentId) {
    await prisma.deployment.updateMany({
      where: { siteId: site.id, id: { not: deploymentId }, status: 'COMPLETE' },
      data: { status: 'SUPERSEDED', step: 'Superseded by a newer deployment.', updatedAt: new Date() },
    })
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
