import { Router, Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { requireAuth } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { AuthRequest } from '../types'
import { signToken } from '../middleware/auth'
import { cfg } from '../config'
import { encrypt, decrypt } from '../utils/encryption'
import { applyDailyFreeCredits } from '../services/credits'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'

const router = Router()
const prisma = new PrismaClient()

function authErrorRedirect(res: Response, message: string) {
  const params = new URLSearchParams({ error: message })
  res.redirect(`${cfg.clientUrl}/auth?${params}`)
}

async function githubFetch(url: string, token: string) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`)
  return res.json()
}

function ensureGitHubAppConfigured() {
  const missing = [
    ['GITHUB_APP_NAME', cfg.githubAppName],
    ['GITHUB_APP_ID', cfg.githubAppId],
    ['GITHUB_APP_PRIVATE_KEY', cfg.githubAppPrivateKey],
  ].filter(([, value]) => !value).map(([key]) => key)

  if (missing.length > 0) {
    const suffix = cfg.nodeEnv === 'production' ? '' : ` Missing: ${missing.join(', ')}.`
    throw new AppError(503, `GitHub App is not configured yet.${suffix}`)
  }
}

function githubAppJwt() {
  ensureGitHubAppConfigured()
  const now = Math.floor(Date.now() / 1000)
  return jwt.sign(
    { iat: now - 60, exp: now + 9 * 60, iss: cfg.githubAppId },
    cfg.githubAppPrivateKey,
    { algorithm: 'RS256' }
  )
}

async function githubAppFetch(url: string) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${githubAppJwt()}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })
  if (!res.ok) throw new Error(`GitHub App API error: ${res.status}`)
  return res.json()
}

export async function createInstallationToken(installationId: string): Promise<string> {
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

async function listInstallationRepos(installationId: string) {
  const token = await createInstallationToken(installationId)
  const data = await githubFetch('https://api.github.com/installation/repositories?per_page=100', token) as any
  return data.repositories as any[]
}

async function resolveRepoInstallation(
  userId: string,
  repoOwner: string,
  repoName: string,
  requestedInstallationId?: string
): Promise<string> {
  const installations = await prisma.gitHubInstallation.findMany({
    where: {
      userId,
      ...(requestedInstallationId ? { installationId: requestedInstallationId } : {}),
    },
  })

  for (const installation of installations) {
    const repos = await listInstallationRepos(installation.installationId)
    if (repos.some(r => r.owner?.login === repoOwner && r.name === repoName)) {
      return installation.installationId
    }
  }

  throw new AppError(403, 'That repository is not available to the installed GitHub App. Reinstall the app and select this repository.')
}

function encryptToken(token: string) {
  return encrypt(token)
}

export function decryptGitHubToken(user: { githubToken: string | null; githubTokenIv?: string | null }): string | null {
  if (!user.githubToken || !user.githubTokenIv) return null
  try { return decrypt(user.githubToken, user.githubTokenIv) } catch { return null }
}

// OAuth login is identity-only. Repo access is handled by the GitHub App install flow.
router.get('/auth', (req: Request, res: Response) => {
  if (!cfg.githubClientId) {
    authErrorRedirect(res, 'GitHub login is not configured yet. Please use email or Google sign-in.')
    return
  }
  const params = new URLSearchParams({
    client_id: cfg.githubClientId,
    redirect_uri: cfg.githubCallbackUrl,
    scope: 'read:user user:email',
  })
  res.redirect(`https://github.com/login/oauth/authorize?${params}`)
})

router.get('/callback', async (req: Request, res: Response, next) => {
  try {
    const { code } = req.query
    if (!code) throw new AppError(400, 'Missing OAuth code.')

    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: cfg.githubClientId,
        client_secret: cfg.githubClientSecret,
        code,
        redirect_uri: cfg.githubCallbackUrl,
      }),
    })
    const tokenData = await tokenRes.json() as any
    if (tokenData.error) throw new AppError(400, `GitHub OAuth error: ${tokenData.error_description}`)

    const accessToken: string = tokenData.access_token
    const ghUser = await githubFetch('https://api.github.com/user', accessToken) as any

    let email: string = ghUser.email
    if (!email) {
      const emails = await githubFetch('https://api.github.com/user/emails', accessToken) as any[]
      const primary = emails.find(e => e.primary && e.verified)
      if (primary) email = primary.email
    }
    if (!email) email = `github-${ghUser.id}@ctrlpoint.noemail`

    const { encryptedKey, iv } = encryptToken(accessToken)

    let user = await prisma.user.findUnique({ where: { githubId: String(ghUser.id) } })
    if (!user) {
      const existing = await prisma.user.findUnique({ where: { email } })
      if (existing) {
        user = await prisma.user.update({
          where: { id: existing.id },
          data: { githubId: String(ghUser.id), githubToken: encryptedKey, githubTokenIv: iv },
        })
      } else {
        user = await prisma.user.create({
          data: { email, githubId: String(ghUser.id), githubToken: encryptedKey, githubTokenIv: iv, credits: 3 },
        })
      }
    } else {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { githubToken: encryptedKey, githubTokenIv: iv },
      })
    }
    user = await applyDailyFreeCredits(prisma, user.id) ?? user

    const token = signToken({ userId: user.id, email: user.email })
    res.cookie('token', token, {
      httpOnly: true,
      secure: cfg.nodeEnv === 'production',
      sameSite: cfg.nodeEnv === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    })
    res.redirect(`${cfg.clientUrl}/editor`)
  } catch (err: any) {
    authErrorRedirect(res, err?.message || 'GitHub sign-in failed. Please try again or use email instead.')
  }
})

router.get('/install', requireAuth, (req: AuthRequest, res: Response, next) => {
  try {
    ensureGitHubAppConfigured()
    const appSlug = cfg.githubAppName.trim().toLowerCase().replace(/\s+/g, '-')
    res.redirect(`https://github.com/apps/${appSlug}/installations/new`)
  } catch (err) { next(err) }
})

router.get('/setup', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const installationId = String(req.query.installation_id || '')
    if (!installationId) throw new AppError(400, 'Missing GitHub installation id.')

    const installation = await githubAppFetch(`https://api.github.com/app/installations/${installationId}`) as any
    await prisma.gitHubInstallation.upsert({
      where: { installationId },
      create: {
        userId: req.user!.userId,
        installationId,
        accountLogin: installation.account?.login,
        accountType: installation.account?.type,
      },
      update: {
        userId: req.user!.userId,
        accountLogin: installation.account?.login,
        accountType: installation.account?.type,
      },
    })

    res.redirect(`${cfg.clientUrl}/deploy?github=installed`)
  } catch (err) { next(err) }
})

router.get('/repos', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const installations = await prisma.gitHubInstallation.findMany({ where: { userId: req.user!.userId } })
    if (installations.length === 0) throw new AppError(400, 'Install the GitHub App and select repositories first.')

    const reposById = new Map<number, any>()
    for (const installation of installations) {
      const repos = await listInstallationRepos(installation.installationId)
      repos.forEach(r => reposById.set(r.id, { ...r, installationId: installation.installationId }))
    }

    res.json({
      repos: Array.from(reposById.values()).map(r => ({
        id: r.id,
        fullName: r.full_name,
        owner: r.owner.login,
        name: r.name,
        defaultBranch: r.default_branch,
        private: r.private,
        installationId: r.installationId,
      })),
    })
  } catch (err) { next(err) }
})

router.get('/connection/:siteId', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const connection = await prisma.gitHubConnection.findFirst({
      where: { siteId: req.params.siteId as string, userId: req.user!.userId },
      select: {
        githubInstallationId: true,
        repoOwner: true,
        repoName: true,
        branch: true,
        projectType: true,
        buildCommand: true,
        outputDir: true,
        lastDeployedSha: true,
      },
    })
    if (!connection) { res.status(404).json({ connection: null }); return }
    res.json(connection)
  } catch (err) { next(err) }
})

router.get('/status', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const installationCount = await prisma.gitHubInstallation.count({ where: { userId: req.user!.userId } })
    res.json({ connected: installationCount > 0, appInstalled: installationCount > 0 })
  } catch (err) { next(err) }
})

router.delete('/account', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    await prisma.$transaction([
      prisma.gitHubConnection.deleteMany({ where: { userId: req.user!.userId } }),
      prisma.gitHubInstallation.deleteMany({ where: { userId: req.user!.userId } }),
    ])
    res.json({ ok: true })
  } catch (err) { next(err) }
})

router.post('/deploy-new', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const { mnsName, repoOwner, repoName, branch, projectType, buildCommand, outputDir, githubInstallationId } = req.body

    if (!mnsName || !repoOwner || !repoName) throw new AppError(400, 'mnsName, repoOwner and repoName are required.')
    if (!/^[a-z0-9-]{3,32}$/.test(mnsName)) throw new AppError(400, 'MNS name must be 3-32 lowercase letters, numbers or hyphens.')

    const taken = await prisma.site.findUnique({ where: { mnsName } })
    if (taken) throw new AppError(409, 'That MNS name is already in use.')

    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } })
    if (!user) throw new AppError(404, 'User not found.')
    if (!cfg.githubWebhookSecret) throw new AppError(503, 'GitHub webhooks not configured on this server.')

    const branchName = branch || 'main'
    const installationId = await resolveRepoInstallation(req.user!.userId, repoOwner, repoName, githubInstallationId)
    const token = await createInstallationToken(installationId)

    let sha = 'initial'
    try {
      const ref = await githubFetch(`https://api.github.com/repos/${repoOwner}/${repoName}/git/ref/heads/${branchName}`, token) as any
      sha = ref.object?.sha || 'initial'
    } catch {}

    const site = await prisma.site.create({
      data: {
        userId: req.user!.userId,
        mnsName,
        title: `${repoOwner}/${repoName}`,
        description: `Deployed from GitHub: ${repoOwner}/${repoName}@${branchName}`,
        generatedCode: `<!-- GitHub: ${repoOwner}/${repoName}@${branchName} -->`,
        status: 'DEPLOYING',
      },
    })

    const connection = await prisma.gitHubConnection.create({
      data: {
        siteId: site.id,
        userId: req.user!.userId,
        githubInstallationId: installationId,
        repoOwner,
        repoName,
        branch: branchName,
        projectType: projectType || 'static',
        buildCommand: buildCommand || 'npm run build',
        outputDir: outputDir || 'dist',
      },
    })

    const deployment = await prisma.deployment.create({
      data: {
        siteId: site.id,
        type: 'INITIAL',
        status: 'QUEUED',
        source: 'github_new',
        commitSha: sha !== 'initial' ? sha : undefined,
        step: 'Queued',
      },
    })

    res.json({ siteId: site.id, mnsName, deploymentId: deployment.id })
  } catch (err) { next(err) }
})

router.post('/connect', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const { siteId, repoOwner, repoName, branch, projectType, buildCommand, outputDir, githubInstallationId } = req.body

    if (!siteId || !repoOwner || !repoName) throw new AppError(400, 'siteId, repoOwner, repoName are required.')

    const site = await prisma.site.findUnique({ where: { id: siteId } })
    if (!site) throw new AppError(404, 'Site not found.')
    if (site.userId !== req.user!.userId) throw new AppError(403, 'Access denied.')
    if (site.ownershipClaimed) {
      throw new AppError(409, 'This site has claimed ownership. Auto-deploy cannot be enabled because CtrlPoint no longer controls its MNS record.')
    }
    if (!cfg.githubWebhookSecret) throw new AppError(503, 'GitHub webhooks not configured on this server.')

    const installationId = await resolveRepoInstallation(req.user!.userId, repoOwner, repoName, githubInstallationId)

    const connection = await prisma.gitHubConnection.upsert({
      where: { siteId },
      create: {
        siteId,
        userId: req.user!.userId,
        githubInstallationId: installationId,
        repoOwner,
        repoName,
        branch: branch || 'main',
        projectType: projectType || 'static',
        buildCommand: buildCommand || 'npm run build',
        outputDir: outputDir || 'dist',
      },
      update: {
        githubInstallationId: installationId,
        repoOwner,
        repoName,
        branch: branch || 'main',
        projectType: projectType || 'static',
        buildCommand: buildCommand || 'npm run build',
        outputDir: outputDir || 'dist',
      },
    })

    res.json({ connection })
  } catch (err) { next(err) }
})

router.delete('/connect/:siteId', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const { siteId } = req.params as { siteId: string }
    const connection = await prisma.gitHubConnection.findUnique({ where: { siteId } })
    if (!connection) throw new AppError(404, 'No GitHub connection found.')
    if (connection.userId !== req.user!.userId) throw new AppError(403, 'Access denied.')

    await prisma.gitHubConnection.delete({ where: { siteId } })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

router.post('/webhook', async (req: Request, res: Response, next) => {
  try {
    const sig = req.headers['x-hub-signature-256'] as string
    if (!sig || !cfg.githubWebhookSecret) { res.status(400).end(); return }

    const rawBody = req.body as Buffer
    const expected = 'sha256=' + crypto.createHmac('sha256', cfg.githubWebhookSecret).update(rawBody).digest('hex')
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      res.status(401).end()
      return
    }

    const event = req.headers['x-github-event']
    if (event !== 'push') { res.status(200).end(); return }

    const payload = JSON.parse(rawBody.toString('utf8'))
    const { ref, after: sha, repository } = payload
    const installationId = payload.installation?.id ? String(payload.installation.id) : undefined
    const branch = (ref as string).replace('refs/heads/', '')
    const repoOwner: string = repository.owner.login
    const repoName: string = repository.name

    const connection = await prisma.gitHubConnection.findFirst({
      where: { repoOwner, repoName, branch, ...(installationId ? { githubInstallationId: installationId } : {}) },
      include: { site: true, user: true },
    })

    if (!connection) { res.status(200).end(); return }
    if (connection.lastDeployedSha === sha) { res.status(200).end(); return }
    if (connection.site.ownershipClaimed) {
      res.status(200).json({ ok: true, skipped: 'ownership_claimed' })
      return
    }

    const active = await prisma.deployment.findFirst({
      where: {
        siteId: connection.siteId,
        status: { in: ['QUEUED', 'BUILDING', 'UPLOADING', 'MNS_REGISTERING'] },
      },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    })

    if (active && active.id) {
      const activeDeployment = await prisma.deployment.findUnique({ where: { id: active.id }, select: { status: true } })
      if (activeDeployment?.status !== 'QUEUED') {
        await prisma.deployment.create({
          data: {
            siteId: connection.siteId,
            type: connection.site.scAddress ? 'UPDATE' : 'INITIAL',
            status: 'QUEUED',
            source: connection.site.scAddress ? 'github_push' : 'github_new',
            commitSha: sha,
            step: 'Queued GitHub push.',
          },
        })
        res.status(200).json({ ok: true, queued: true })
        return
      }
      await prisma.deployment.update({
        where: { id: active.id },
        data: { commitSha: sha, step: 'Queued latest GitHub push.', updatedAt: new Date() },
      }).catch(() => {})
      res.status(200).json({ ok: true, queued: true, coalesced: true })
      return
    }

    await prisma.site.update({
      where: { id: connection.siteId },
      data: { status: connection.site.scAddress ? 'UPDATING' : 'DEPLOYING' },
    }).catch(() => {})

    await prisma.deployment.create({
      data: {
        siteId: connection.siteId,
        type: connection.site.scAddress ? 'UPDATE' : 'INITIAL',
        status: 'QUEUED',
        source: connection.site.scAddress ? 'github_push' : 'github_new',
        commitSha: sha,
        step: 'Queued GitHub push.',
      },
    })

    res.status(200).json({ ok: true, queued: true })
  } catch (err) { next(err) }
})

export default router
