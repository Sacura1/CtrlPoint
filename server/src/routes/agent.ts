import { Router, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import multer from 'multer'
import AdmZip from 'adm-zip'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'
import { requireAgentAuth, requireAuth } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { AgentAuthRequest, AuthRequest } from '../types'
import { createAgentKey, readAgentKeyHeader } from '../services/agentKeys'
import { attachX402AgentUser, requireCirclePayment } from '../services/circleX402'
import {
  beginAgentRequest,
  completeAgentRequest,
  failAgentRequest,
  type AgentRequestRecord,
} from '../services/agentIdempotency'
import {
  checkMnsAvailable,
  mnsRegistrationCreditCost,
  mnsRegistrationMessage,
  MIN_SPONSORED_MNS_NAME_LENGTH,
  registerMns,
  validateMnsName as validateMnsNameRaw,
} from '../services/mns'
import { applyDailyFreeCredits, refundMnsRegistrationCreditsForDeployment } from '../services/credits'
import { uploadDirectory } from '../services/massa'
import {
  explainMissingIndex,
  fileExists,
  installDependencies,
  parseBuildEnv,
  resolveBuildDir,
  runBuild,
  safeSubPath,
} from '../services/githubDeploy'
import { cfg } from '../config'

const router = Router()
const prisma = new PrismaClient()

const ACTIVE_DEPLOY_STATUSES = ['QUEUED', 'BUILDING', 'UPLOADING', 'MNS_REGISTERING']
const MAX_AGENT_UPLOAD_BYTES = 50 * 1024 * 1024
const MAX_AGENT_ZIP_FILES = 3000

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AGENT_UPLOAD_BYTES },
  fileFilter(_, file, cb) {
    const lower = file.originalname.toLowerCase()
    const ok = lower.endsWith('.html') || lower.endsWith('.zip')
    cb(ok ? null : new Error('Only .html and .zip files are supported.') as any, ok)
  },
})

function mnsUrl(name: string) {
  return `https://${name}.${cfg.mnsPublicDomain}`
}

function normalizeMnsName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new AppError(400, 'mnsName is required.')
  const suffix = `.${cfg.mnsPublicDomain}`.toLowerCase()
  const name = value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  return name.endsWith(suffix) ? name.slice(0, -suffix.length) : name
}

async function resolveTargetMnsName(userId: string, siteId: string | undefined, rawMnsName: unknown): Promise<string> {
  const providedName = typeof rawMnsName === 'string' && rawMnsName.trim()
    ? normalizeMnsName(rawMnsName)
    : null

  if (!siteId) {
    if (!providedName) throw new AppError(400, 'mnsName is required for a new deployment.')
    return providedName
  }

  const site = await prisma.site.findUnique({ where: { id: siteId }, select: { userId: true, mnsName: true } })
  if (!site) throw new AppError(404, 'Site not found.')
  if (site.userId !== userId) throw new AppError(403, 'Access denied.')
  if (providedName && providedName !== site.mnsName) {
    throw new AppError(400, `siteId belongs to "${site.mnsName}", but mnsName was "${providedName}".`)
  }
  return site.mnsName
}

function assertMnsName(name: string) {
  const validationError = validateMnsNameRaw(name)
  if (validationError) throw new AppError(400, validationError)
}

function parseTitle(html: string): string {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  return m ? m[1].trim().slice(0, 80) : 'Agent Site'
}

function firstString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function isFrameworkRequest(req: AgentAuthRequest): boolean {
  const projectType = firstString(req.body.projectType)?.toLowerCase()
  return projectType === 'framework'
}

function needsBuild(filename: string): boolean {
  return /\.(jsx|tsx|vue|svelte|ts)$/.test(filename) && !filename.endsWith('.d.ts')
}

function buildFileMap(zip: AdmZip): Record<string, Buffer> {
  const entries = zip.getEntries().filter(e => !e.isDirectory)
  if (entries.length > MAX_AGENT_ZIP_FILES) {
    throw new AppError(400, `Zip contains too many files. Limit is ${MAX_AGENT_ZIP_FILES}.`)
  }

  const names = entries.map(e => e.entryName.replace(/\\/g, '/'))
  const firstSlash = names[0]?.indexOf('/')
  const prefix = firstSlash && firstSlash > 0 ? names[0].slice(0, firstSlash + 1) : ''
  const hasCommonRoot = Boolean(prefix && names.every(n => n.startsWith(prefix)))

  const files: Record<string, Buffer> = {}
  for (const entry of entries) {
    const normalized = entry.entryName.replace(/\\/g, '/')
    const key = hasCommonRoot ? normalized.slice(prefix.length) : normalized
    if (!key || key.includes('\0') || key.startsWith('/') || key.split('/').some(part => part === '..')) {
      throw new AppError(400, 'Zip contains an unsafe file path.')
    }
    files[key] = entry.getData()
  }
  return files
}

function inlineAssets(html: string, files: Record<string, Buffer>, baseDir: string): string {
  html = html.replace(/<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*\/?>/gi, (match, href) => {
    if (href.startsWith('http') || href.startsWith('//') || href.startsWith('data:')) return match
    const filePath = path.posix.join(baseDir, href).replace(/^\//, '')
    const content = files[filePath] ?? files[href.replace(/^\//, '')]
    return content ? `<style>${content.toString('utf8')}</style>` : match
  })

  html = html.replace(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["']stylesheet["'][^>]*\/?>/gi, (match, href) => {
    if (href.startsWith('http') || href.startsWith('//') || href.startsWith('data:')) return match
    const filePath = path.posix.join(baseDir, href).replace(/^\//, '')
    const content = files[filePath] ?? files[href.replace(/^\//, '')]
    return content ? `<style>${content.toString('utf8')}</style>` : match
  })

  html = html.replace(/<script([^>]*)\bsrc=["']([^"']+)["']([^>]*)><\/script>/gi, (match, before, src, after) => {
    if (src.startsWith('http') || src.startsWith('//') || src.startsWith('data:')) return match
    const filePath = path.posix.join(baseDir, src).replace(/^\//, '')
    const content = files[filePath] ?? files[src.replace(/^\//, '')]
    if (!content) return match
    const typeMatch = (before + after).match(/type=["']([^"']+)["']/)
    return `<script${typeMatch ? ` type="${typeMatch[1]}"` : ''}>${content.toString('utf8')}</script>`
  })

  return html
}

function htmlFromStaticZip(buffer: Buffer): { html: string; title: string } {
  let zip: AdmZip
  try { zip = new AdmZip(buffer) } catch {
    throw new AppError(400, 'Could not read zip file. Make sure it is a valid zip archive.')
  }

  const files = buildFileMap(zip)
  const names = Object.keys(files)
  const frameworkFile = names.find(needsBuild)
  if (frameworkFile) {
    throw new AppError(400, `This looks like a framework project because it contains ${frameworkFile}. Send projectType=framework so CtrlPoint can build it.`)
  }

  const indexKey = names.find(n => n === 'index.html' || (n.endsWith('/index.html') && n.split('/').length === 2))
    ?? names.find(n => n.toLowerCase().endsWith('index.html'))
  if (!indexKey) throw new AppError(400, 'No index.html found in zip.')

  const baseDir = path.posix.dirname(indexKey)
  const html = inlineAssets(files[indexKey].toString('utf8'), files, baseDir)
  return { html, title: parseTitle(html) }
}

function htmlFromRequest(req: AgentAuthRequest): { html: string; title: string } {
  const explicitHtml = firstString(req.body.html)
  if (explicitHtml?.trim()) return { html: explicitHtml, title: parseTitle(explicitHtml) }

  const file = req.file
  if (!file) throw new AppError(400, 'Provide html in JSON/form data or upload a .html/.zip file.')

  if (file.originalname.toLowerCase().endsWith('.html') || file.mimetype === 'text/html') {
    const html = file.buffer.toString('utf8')
    if (!html.includes('<!DOCTYPE') && !html.includes('<html')) {
      throw new AppError(400, 'File does not appear to be a valid HTML document.')
    }
    return { html, title: parseTitle(html) }
  }

  if (file.originalname.toLowerCase().endsWith('.zip')) return htmlFromStaticZip(file.buffer)

  throw new AppError(400, 'Unsupported file type.')
}

async function writeZipToDirectory(buffer: Buffer, targetDir: string) {
  let zip: AdmZip
  try { zip = new AdmZip(buffer) } catch {
    throw new AppError(400, 'Could not read zip file. Make sure it is a valid zip archive.')
  }

  const entries = zip.getEntries().filter(e => !e.isDirectory)
  if (entries.length > MAX_AGENT_ZIP_FILES) {
    throw new AppError(400, `Zip contains too many files. Limit is ${MAX_AGENT_ZIP_FILES}.`)
  }

  const names = entries.map(e => e.entryName.replace(/\\/g, '/'))
  const firstSlash = names[0]?.indexOf('/')
  const prefix = firstSlash && firstSlash > 0 ? names[0].slice(0, firstSlash + 1) : ''
  const hasCommonRoot = Boolean(prefix && names.every(n => n.startsWith(prefix)))

  for (const entry of entries) {
    const normalized = entry.entryName.replace(/\\/g, '/')
    const key = hasCommonRoot ? normalized.slice(prefix.length) : normalized
    if (!key || key.includes('\0') || key.startsWith('/') || key.split('/').some(part => part === '..')) {
      throw new AppError(400, 'Zip contains an unsafe file path.')
    }

    const outPath = path.resolve(targetDir, key)
    if (!outPath.startsWith(path.resolve(targetDir) + path.sep)) {
      throw new AppError(400, 'Zip contains an unsafe file path.')
    }
    await fs.mkdir(path.dirname(outPath), { recursive: true })
    await fs.writeFile(outPath, entry.getData())
  }
}

async function assertNoActiveDeployment(siteId: string) {
  const active = await prisma.deployment.findFirst({
    where: { siteId, status: { in: ACTIVE_DEPLOY_STATUSES } },
    select: { id: true },
  })
  if (active) throw new AppError(409, 'A deployment is already running for this site.')
}

async function createOrUpdateSiteAndDeployment(params: {
  userId: string
  mnsName: string
  siteId?: string
  html: string
  title: string
  description: string
  source: string
  initialStep: string
  storeGeneratedCode?: boolean
  billingMode: 'credits' | 'x402'
  mode?: 'deploy_or_update' | 'update_only'
}) {
  const existing = params.siteId
    ? await prisma.site.findUnique({ where: { id: params.siteId } })
    : await prisma.site.findUnique({ where: { mnsName: params.mnsName } })

  if (existing && existing.userId !== params.userId) throw new AppError(403, 'Access denied.')
  if (existing?.ownershipClaimed) {
    throw new AppError(409, 'This site has claimed MNS ownership. CtrlPoint can no longer update it.')
  }
  if (existing) await assertNoActiveDeployment(existing.id)
  if (!existing && params.mode === 'update_only') {
    throw new AppError(404, 'Site not found. Updates require an existing siteId or mnsName owned by this payer.')
  }

  const isUpdate = Boolean(existing?.scAddress)
  if (!existing) {
    assertMnsName(params.mnsName)
    const dbTaken = await prisma.site.findUnique({ where: { mnsName: params.mnsName } })
    if (dbTaken) throw new AppError(409, `The name "${params.mnsName}" is already taken.`)

    const available = await checkMnsAvailable(params.mnsName).catch(() => true)
    if (available === false) throw new AppError(409, `The MNS name "${params.mnsName}" is already registered on Massa.`)
  }

  const deploymentId = uuidv4()
  const mnsCreditCost = !existing ? mnsRegistrationCreditCost(params.mnsName) : 0
  if (params.billingMode === 'x402' && mnsCreditCost > 0) {
    throw new AppError(402, `Wallet-paid agent deploys require ${MIN_SPONSORED_MNS_NAME_LENGTH}+ character MNS names right now. ${mnsRegistrationMessage(params.mnsName)}`)
  }
  const user = mnsCreditCost > 0 ? await applyDailyFreeCredits(prisma, params.userId) : null
  const shouldStoreGeneratedCode = params.storeGeneratedCode !== false || !existing

  return prisma.$transaction(async tx => {
    if (mnsCreditCost > 0) {
      const charged = await tx.user.updateMany({
        where: { id: params.userId, credits: { gte: mnsCreditCost } },
        data: { credits: { decrement: mnsCreditCost } },
      })
      if (charged.count !== 1) {
        throw new AppError(402, `Insufficient credits. ${mnsRegistrationMessage(params.mnsName)} You have ${user?.credits ?? 0}.`)
      }
      await tx.creditTransaction.create({
        data: {
          userId: params.userId,
          amount: -mnsCreditCost,
          type: 'mns_registration',
          note: `MNS registration for ${params.mnsName} (${deploymentId})`,
        },
      })
    }

    const site = existing
      ? await tx.site.update({
          where: { id: existing.id },
          data: {
            ...(shouldStoreGeneratedCode ? {
              previousCode: existing.generatedCode,
              generatedCode: params.html,
            } : {}),
            title: params.title || existing.title,
            description: params.description,
            status: isUpdate ? 'UPDATING' : 'DEPLOYING',
            needsDeploy: true,
            lastPrompt: 'Agent API update',
          },
        })
      : await tx.site.create({
          data: {
            userId: params.userId,
            mnsName: params.mnsName,
            generatedCode: params.html,
            title: params.title || 'Agent Site',
            description: params.description,
            status: 'DEPLOYING',
            lastPrompt: 'Agent API deploy',
          },
        })

    const deployment = await tx.deployment.create({
      data: {
        id: deploymentId,
        siteId: site.id,
        type: isUpdate ? 'UPDATE' : 'INITIAL',
        status: 'QUEUED',
        source: params.source,
        step: params.initialStep,
      },
    })

    return { site, deployment, isUpdate, creditsCharged: mnsCreditCost }
  })
}

async function finalizeSynchronousDeployment(params: {
  site: any
  deploymentId: string
  isUpdate: boolean
  buildDir: string
}) {
  await prisma.deployment.update({
    where: { id: params.deploymentId },
    data: { status: 'UPLOADING', step: 'Uploading build output to DeWeb...' },
  })

  const { scAddress } = await uploadDirectory(
    params.buildDir,
    params.site.title,
    params.site.description,
    params.isUpdate ? params.site.scAddress || undefined : undefined,
    step => prisma.deployment.update({
      where: { id: params.deploymentId },
      data: { status: 'UPLOADING', step, updatedAt: new Date() },
    }).catch(() => {})
  )

  await prisma.deployment.update({
    where: { id: params.deploymentId },
    data: { status: 'UPLOADING', scAddress, step: 'Upload complete.' },
  })
  await prisma.site.update({ where: { id: params.site.id }, data: { scAddress } })

  if (!params.isUpdate) {
    await prisma.deployment.update({
      where: { id: params.deploymentId },
      data: { status: 'MNS_REGISTERING', step: 'Registering domain...' },
    })
    await registerMns(params.site.mnsName, scAddress, undefined, step => prisma.deployment.update({
      where: { id: params.deploymentId },
      data: { status: 'MNS_REGISTERING', step, updatedAt: new Date() },
    }).catch(() => {}))
  }

  await prisma.deployment.update({
    where: { id: params.deploymentId },
    data: { status: 'COMPLETE', scAddress, step: 'Live!' },
  })
  await prisma.site.update({
    where: { id: params.site.id },
    data: { status: 'LIVE', scAddress, needsDeploy: false, updatedAt: new Date() },
  })

  return scAddress
}

async function deployFramework(req: AgentAuthRequest, res: Response, idempotency?: AgentRequestRecord, mode: 'deploy_or_update' | 'update_only' = 'deploy_or_update') {
  const file = req.file
  if (!file || !file.originalname.toLowerCase().endsWith('.zip')) {
    throw new AppError(400, 'Framework deploys require a .zip project archive.')
  }

  const siteId = firstString(req.body.siteId)
  const mnsName = await resolveTargetMnsName(req.user!.userId, siteId, req.body.mnsName)
  const description = firstString(req.body.description) || ''
  const title = firstString(req.body.title) || 'Agent Site'
  const placeholder = `<!-- Agent framework deployment for ${mnsName} -->`

  const prepared = await createOrUpdateSiteAndDeployment({
    userId: req.user!.userId,
    siteId,
    mnsName,
    html: placeholder,
    title,
    description,
    source: req.agentBillingMode === 'x402' ? 'agent_x402_framework' : 'agent_api_framework',
    initialStep: 'Queued framework build.',
    storeGeneratedCode: false,
    billingMode: req.agentBillingMode || 'credits',
    mode,
  })

  let tmpDir: string | null = null
  try {
    await prisma.deployment.update({
      where: { id: prepared.deployment.id },
      data: { status: 'BUILDING', step: 'Preparing framework project...' },
    })

    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ctrlpoint-agent-'))
    await writeZipToDirectory(file.buffer, tmpDir)

    const root = safeSubPath(firstString(req.body.projectRoot), 'Project root')
    const buildCwd = root ? path.join(tmpDir, root) : tmpDir
    if (!await fileExists(path.join(buildCwd, 'package.json'))) {
      throw new AppError(400, `Project root "${root || '.'}" does not contain package.json.`)
    }

    const buildEnv = parseBuildEnv(firstString(req.body.buildEnv))
    const label = `agent:${prepared.site.mnsName}`
    await prisma.deployment.update({
      where: { id: prepared.deployment.id },
      data: { status: 'BUILDING', step: 'Installing dependencies...' },
    })
    const pm = await installDependencies(buildCwd, label)

    await prisma.deployment.update({
      where: { id: prepared.deployment.id },
      data: { status: 'BUILDING', step: 'Running build command...' },
    })
    await runBuild(buildCwd, firstString(req.body.buildCommand) || 'npm run build', pm, label, buildEnv)

    const output = safeSubPath(firstString(req.body.outputDir) || 'dist', 'Output dir') || 'dist'
    const buildDir = await resolveBuildDir(buildCwd, output)
    if (!await fileExists(path.join(buildDir, 'index.html'))) {
      throw new AppError(400, await explainMissingIndex(buildCwd, output))
    }

    const scAddress = await finalizeSynchronousDeployment({
      site: prepared.site,
      deploymentId: prepared.deployment.id,
      isUpdate: prepared.isUpdate,
      buildDir,
    })

    const response = {
      siteId: prepared.site.id,
      deploymentId: prepared.deployment.id,
      status: 'COMPLETE',
      url: mnsUrl(prepared.site.mnsName),
      scAddress,
      creditsCharged: prepared.creditsCharged,
      payment: agentPaymentPayload(req),
      message: prepared.isUpdate ? 'Framework site updated.' : 'Framework site deployed.',
    }
    await completeAgentRequest(idempotency || { id: '', idempotencyKey: '', requestHash: '' }, response, 'COMPLETE', prepared.site.id, prepared.deployment.id)
    res.status(prepared.isUpdate ? 200 : 201).json(response)
  } catch (err) {
    await prisma.deployment.update({
      where: { id: prepared.deployment.id },
      data: { status: 'FAILED', step: 'Failed', errorMsg: err instanceof Error ? err.message : 'Unknown deployment error' },
    }).catch(() => {})
    await prisma.site.update({ where: { id: prepared.site.id }, data: { status: 'ERROR' } }).catch(() => {})
    if (!prepared.isUpdate) {
      await refundMnsRegistrationCreditsForDeployment(prisma, req.user!.userId, prepared.site.mnsName, prepared.deployment.id).catch(() => {})
    }
    throw err
  } finally {
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}

router.get('/capabilities', (_req, res) => {
  const apiBase = cfg.apiPublicUrl.replace(/\/+$/, '')
  const docsBase = cfg.clientUrl.replace(/\/+$/, '')
  res.json({
    name: 'CtrlPoint Agent Deploy API',
    version: 1,
    description: 'Deploy and update static or framework web apps to Massa DeWeb with USDC x402 payments. CtrlPoint pays Massa/MNS operations and returns a live DeWeb URL.',
    discovery: {
      capabilities: apiBase ? `${apiBase}/api/agent/capabilities` : '/api/agent/capabilities',
      manifest: apiBase ? `${apiBase}/api/agent/manifest` : '/api/agent/manifest',
      openapi: apiBase ? `${apiBase}/api/agent/openapi.json` : '/api/agent/openapi.json',
      docs: `${docsBase}/docs/agent-api`,
    },
    auth: {
      primary: 'circle_x402',
      accountless: true,
      identity: 'Circle x402 payer wallet + network',
      fallback: ['Bearer cp_agent_*', 'X-CtrlPoint-Agent-Key'],
    },
    deployment: {
      targets: ['massa_deweb'],
      static: {
        endpoint: 'POST /api/agent/deploy',
        price: cfg.circleX402Prices.staticDeploy,
        accepts: ['json_html', 'html_file', 'static_zip'],
        createsNewSite: true,
        async: true,
      },
      framework: {
        endpoint: 'POST /api/agent/deploy/framework',
        price: cfg.circleX402Prices.frameworkDeploy,
        accepts: ['zip_project_with_package_json'],
        packageManagers: ['npm', 'pnpm', 'yarn'],
        createsNewSite: true,
        async: false,
      },
      staticUpdate: {
        endpoint: 'POST /api/agent/update',
        price: cfg.circleX402Prices.staticUpdate,
        accepts: ['json_html', 'html_file', 'static_zip'],
        requires: ['siteId or mnsName of an existing site'],
        async: true,
      },
      frameworkUpdate: {
        endpoint: 'POST /api/agent/update/framework',
        price: cfg.circleX402Prices.frameworkUpdate,
        accepts: ['zip_project_with_package_json'],
        requires: ['siteId or mnsName of an existing site'],
        packageManagers: ['npm', 'pnpm', 'yarn'],
        async: false,
      },
      status: {
        endpoint: 'GET /api/agent/deployments/{deploymentId}',
        authRequired: false,
      },
      updates: {
        methods: ['siteId', 'mnsName'],
        rule: 'Only the same payer wallet/network or CtrlPoint account owner can update a site.',
      },
      mns: {
        domain: cfg.mnsPublicDomain,
        freeMinLength: MIN_SPONSORED_MNS_NAME_LENGTH,
        shortNamesUseCredits: true,
      },
    },
    payments: {
      protocol: 'x402',
      provider: 'Circle Gateway Nanopayments',
      enabled: cfg.circleX402Enabled,
      sellerAddress: cfg.circleX402Enabled ? cfg.circleX402SellerAddress : null,
      facilitatorUrl: cfg.circleX402FacilitatorUrl,
      networks: cfg.circleX402Networks.length ? cfg.circleX402Networks : 'gateway-supported',
      prices: cfg.circleX402Prices,
      note: `Wallet-paid deploys require ${MIN_SPONSORED_MNS_NAME_LENGTH}+ character MNS names. Short names are available through CtrlPoint accounts with credits.`,
    },
    idempotency: {
      requiredHeader: 'Idempotency-Key',
      recommended: true,
      scope: 'payer wallet/network + key',
      behavior: {
        sameRequest: 'returns the original deployment response',
        differentRequestSameKey: '409 conflict',
        inProgress: 'returns deploymentId/statusUrl when available',
      },
    },
    examples: {
      staticHtml: {
        method: 'POST',
        path: '/api/agent/deploy',
        headers: { 'Idempotency-Key': 'agent-task-123' },
        body: {
          mnsName: 'agent-demo-site',
          title: 'Agent Demo',
          html: '<!doctype html><html><head><title>Agent Demo</title></head><body>Hello DeWeb</body></html>',
        },
      },
      frameworkZip: {
        method: 'POST',
        path: '/api/agent/deploy/framework',
        headers: { 'Idempotency-Key': 'agent-task-124' },
        multipart: {
          mnsName: 'agent-react-site',
          title: 'Agent React Site',
          buildCommand: 'npm run build',
          outputDir: 'dist',
          file: 'project.zip',
        },
      },
      update: {
        method: 'POST',
        path: '/api/agent/update/framework',
        headers: { 'Idempotency-Key': 'agent-task-125' },
        multipart: {
          siteId: 'site_id_from_previous_deploy',
          file: 'updated-project.zip',
        },
      },
    },
  })
})

router.get('/manifest', (_req, res) => {
  const apiBase = cfg.apiPublicUrl.replace(/\/+$/, '')
  res.json({
    schemaVersion: '2026-05-15',
    name: 'CtrlPoint DeWeb Deploy',
    description: 'Accountless x402-paid deployment and update service for AI-generated websites and web apps.',
    serviceUrl: apiBase ? `${apiBase}/api/agent` : '/api/agent',
    capabilitiesUrl: apiBase ? `${apiBase}/api/agent/capabilities` : '/api/agent/capabilities',
    openapiUrl: apiBase ? `${apiBase}/api/agent/openapi.json` : '/api/agent/openapi.json',
    payment: {
      protocol: 'x402',
      provider: 'Circle Gateway',
      settlementAsset: 'USDC',
      sellerAddress: cfg.circleX402Enabled ? cfg.circleX402SellerAddress : null,
      prices: cfg.circleX402Prices,
    },
    endpoints: [
      { method: 'POST', path: '/api/agent/deploy', price: cfg.circleX402Prices.staticDeploy, description: 'Deploy raw HTML, HTML file, or static zip.' },
      { method: 'POST', path: '/api/agent/deploy/framework', price: cfg.circleX402Prices.frameworkDeploy, description: 'Deploy framework project zip with package.json.' },
      { method: 'POST', path: '/api/agent/update', price: cfg.circleX402Prices.staticUpdate, description: 'Update existing raw HTML, HTML file, or static zip site.' },
      { method: 'POST', path: '/api/agent/update/framework', price: cfg.circleX402Prices.frameworkUpdate, description: 'Update existing framework project zip site.' },
      { method: 'GET', path: '/api/agent/deployments/{deploymentId}', description: 'Poll deployment status.' },
    ],
  })
})

router.get('/openapi.json', (_req, res) => {
  res.json({
    openapi: '3.1.0',
    info: {
      title: 'CtrlPoint Agent Deploy API',
      version: '1.0.0',
      description: 'x402-paid deployment API for AI agents publishing to Massa DeWeb.',
    },
    paths: {
      '/api/agent/capabilities': {
        get: { summary: 'Machine-readable capabilities', responses: { '200': { description: 'Capabilities' } } },
      },
      '/api/agent/deploy': {
        post: {
          summary: 'Deploy HTML/static site',
          parameters: [{ name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string' } }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['mnsName'],
                  properties: {
                    mnsName: { type: 'string' },
                    siteId: { type: 'string' },
                    title: { type: 'string' },
                    description: { type: 'string' },
                    html: { type: 'string' },
                  },
                },
              },
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    mnsName: { type: 'string' },
                    siteId: { type: 'string' },
                    title: { type: 'string' },
                    description: { type: 'string' },
                    file: { type: 'string', format: 'binary' },
                  },
                },
              },
            },
          },
          responses: { '202': { description: 'Deployment queued' }, '402': { description: 'x402 payment required' } },
        },
      },
      '/api/agent/deploy/framework': {
        post: {
          summary: 'Deploy framework project zip',
          parameters: [{ name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string' } }],
          requestBody: {
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  required: ['file'],
                  properties: {
                    mnsName: { type: 'string' },
                    siteId: { type: 'string' },
                    title: { type: 'string' },
                    description: { type: 'string' },
                    projectRoot: { type: 'string', default: '.' },
                    buildCommand: { type: 'string', default: 'npm run build' },
                    outputDir: { type: 'string', default: 'dist' },
                    buildEnv: { type: 'string' },
                    file: { type: 'string', format: 'binary' },
                  },
                },
              },
            },
          },
          responses: { '200': { description: 'Framework site updated' }, '201': { description: 'Framework site deployed' }, '402': { description: 'x402 payment required' } },
        },
      },
      '/api/agent/update': {
        post: {
          summary: 'Update existing HTML/static site',
          parameters: [{ name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string' } }],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    mnsName: { type: 'string' },
                    siteId: { type: 'string' },
                    title: { type: 'string' },
                    description: { type: 'string' },
                    html: { type: 'string' },
                  },
                  anyOf: [{ required: ['siteId'] }, { required: ['mnsName'] }],
                },
              },
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  properties: {
                    mnsName: { type: 'string' },
                    siteId: { type: 'string' },
                    title: { type: 'string' },
                    description: { type: 'string' },
                    file: { type: 'string', format: 'binary' },
                  },
                  anyOf: [{ required: ['siteId'] }, { required: ['mnsName'] }],
                },
              },
            },
          },
          responses: { '202': { description: 'Update queued' }, '402': { description: 'x402 payment required' } },
        },
      },
      '/api/agent/update/framework': {
        post: {
          summary: 'Update existing framework project zip',
          parameters: [{ name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string' } }],
          requestBody: {
            content: {
              'multipart/form-data': {
                schema: {
                  type: 'object',
                  required: ['file'],
                  properties: {
                    mnsName: { type: 'string' },
                    siteId: { type: 'string' },
                    title: { type: 'string' },
                    description: { type: 'string' },
                    projectRoot: { type: 'string', default: '.' },
                    buildCommand: { type: 'string', default: 'npm run build' },
                    outputDir: { type: 'string', default: 'dist' },
                    buildEnv: { type: 'string' },
                    file: { type: 'string', format: 'binary' },
                  },
                  anyOf: [{ required: ['siteId', 'file'] }, { required: ['mnsName', 'file'] }],
                },
              },
            },
          },
          responses: { '200': { description: 'Framework site updated' }, '402': { description: 'x402 payment required' } },
        },
      },
      '/api/agent/deployments/{deploymentId}': {
        get: {
          summary: 'Poll deployment status',
          parameters: [{ name: 'deploymentId', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { '200': { description: 'Deployment status' } },
        },
      },
    },
  })
})

router.get('/keys', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const keys = await prisma.agentApiKey.findMany({
      where: { userId: req.user!.userId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, keyPrefix: true, lastUsedAt: true, createdAt: true },
    })
    res.json({ keys })
  } catch (err) { next(err) }
})

router.post('/keys', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const name = typeof req.body.name === 'string' && req.body.name.trim()
      ? req.body.name.trim().slice(0, 80)
      : 'Agent key'
    const generated = createAgentKey()
    const record = await prisma.agentApiKey.create({
      data: {
        userId: req.user!.userId,
        name,
        keyHash: generated.keyHash,
        keyPrefix: generated.keyPrefix,
      },
      select: { id: true, name: true, keyPrefix: true, createdAt: true },
    })
    res.status(201).json({ key: generated.key, record })
  } catch (err) { next(err) }
})

router.delete('/keys/:keyId', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const key = await prisma.agentApiKey.findUnique({ where: { id: req.params.keyId as string } })
    if (!key) throw new AppError(404, 'Agent API key not found.')
    if (key.userId !== req.user!.userId) throw new AppError(403, 'Access denied.')
    await prisma.agentApiKey.update({
      where: { id: key.id },
      data: { revokedAt: new Date() },
    })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

router.get('/sites', requireAgentAuth, async (req: AgentAuthRequest, res: Response, next) => {
  try {
    const sites = await prisma.site.findMany({
      where: { userId: req.user!.userId },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        mnsName: true,
        status: true,
        scAddress: true,
        title: true,
        description: true,
        needsDeploy: true,
        ownershipClaimed: true,
        createdAt: true,
        updatedAt: true,
      },
    })
    res.json({ sites: sites.map(site => ({ ...site, url: site.scAddress ? mnsUrl(site.mnsName) : null })) })
  } catch (err) { next(err) }
})

function requireAgentKeyOrX402(price: string) {
  return [
    (req: AgentAuthRequest, res: Response, next: (err?: unknown) => void) => {
      if (readAgentKeyHeader(req)) {
        req.agentBillingMode = 'credits'
        return requireAgentAuth(req, res, next)
      }
      if (!cfg.circleX402Enabled) {
        res.status(401).json({ error: 'Agent API key required. Circle x402 payments are not enabled on this server.' })
        return
      }
      return requireCirclePayment(price)(req, res, next)
    },
    attachX402AgentUser,
  ]
}

function agentPaymentPayload(req: AgentAuthRequest) {
  return req.payment ? {
    payer: req.payment.payer,
    amount: req.payment.amount,
    network: req.payment.network,
    transaction: req.payment.transaction,
  } : undefined
}

async function handleDeploy(req: AgentAuthRequest, res: Response, idempotency?: AgentRequestRecord, mode: 'deploy_or_update' | 'update_only' = 'deploy_or_update') {
  if (isFrameworkRequest(req)) return await deployFramework(req, res, idempotency, mode)

  const siteId = firstString(req.body.siteId)
  const mnsName = await resolveTargetMnsName(req.user!.userId, siteId, req.body.mnsName)
  const { html, title: parsedTitle } = htmlFromRequest(req)
  const prepared = await createOrUpdateSiteAndDeployment({
    userId: req.user!.userId,
    siteId,
    mnsName,
    html,
    title: firstString(req.body.title) || parsedTitle,
    description: firstString(req.body.description) || '',
    source: req.agentBillingMode === 'x402' ? 'agent_x402' : 'agent_api',
    initialStep: 'Queued agent deploy.',
    billingMode: req.agentBillingMode || 'credits',
    mode,
  })

  const response = {
    siteId: prepared.site.id,
    deploymentId: prepared.deployment.id,
    status: 'QUEUED',
    statusUrl: `/api/agent/deployments/${prepared.deployment.id}`,
    url: mnsUrl(prepared.site.mnsName),
    creditsCharged: prepared.creditsCharged,
    payment: agentPaymentPayload(req),
    message: prepared.isUpdate ? 'Agent update queued.' : 'Agent deployment queued.',
  }
  await completeAgentRequest(idempotency || { id: '', idempotencyKey: '', requestHash: '' }, response, 'QUEUED', prepared.site.id, prepared.deployment.id)
  res.status(202).json(response)
}

router.post('/deploy', ...requireAgentKeyOrX402(cfg.circleX402Prices.staticDeploy), upload.single('file'), async (req: AgentAuthRequest, res: Response, next) => {
  let idempotency: AgentRequestRecord | undefined
  try {
    const started = await beginAgentRequest(req, 'POST /api/agent/deploy')
    if (started.replay) return res.status(started.statusCode).json(started.response)
    idempotency = started.record
    await handleDeploy(req, res, idempotency)
  } catch (err) {
    await failAgentRequest(idempotency || { id: '', idempotencyKey: '', requestHash: '' }, err)
    next(err)
  }
})

router.post('/deploy/framework', ...requireAgentKeyOrX402(cfg.circleX402Prices.frameworkDeploy), upload.single('file'), async (req: AgentAuthRequest, res: Response, next) => {
  let idempotency: AgentRequestRecord | undefined
  try {
    req.body.projectType = 'framework'
    const started = await beginAgentRequest(req, 'POST /api/agent/deploy/framework')
    if (started.replay) return res.status(started.statusCode).json(started.response)
    idempotency = started.record
    await handleDeploy(req, res, idempotency)
  } catch (err) {
    await failAgentRequest(idempotency || { id: '', idempotencyKey: '', requestHash: '' }, err)
    next(err)
  }
})

router.post('/update', ...requireAgentKeyOrX402(cfg.circleX402Prices.staticUpdate), upload.single('file'), async (req: AgentAuthRequest, res: Response, next) => {
  let idempotency: AgentRequestRecord | undefined
  try {
    const started = await beginAgentRequest(req, 'POST /api/agent/update')
    if (started.replay) return res.status(started.statusCode).json(started.response)
    idempotency = started.record
    await handleDeploy(req, res, idempotency, 'update_only')
  } catch (err) {
    await failAgentRequest(idempotency || { id: '', idempotencyKey: '', requestHash: '' }, err)
    next(err)
  }
})

router.post('/update/framework', ...requireAgentKeyOrX402(cfg.circleX402Prices.frameworkUpdate), upload.single('file'), async (req: AgentAuthRequest, res: Response, next) => {
  let idempotency: AgentRequestRecord | undefined
  try {
    req.body.projectType = 'framework'
    const started = await beginAgentRequest(req, 'POST /api/agent/update/framework')
    if (started.replay) return res.status(started.statusCode).json(started.response)
    idempotency = started.record
    await handleDeploy(req, res, idempotency, 'update_only')
  } catch (err) {
    await failAgentRequest(idempotency || { id: '', idempotencyKey: '', requestHash: '' }, err)
    next(err)
  }
})

router.get('/deployments/:deploymentId', async (req: AgentAuthRequest, res: Response, next) => {
  try {
    const deployment = await prisma.deployment.findUnique({
      where: { id: req.params.deploymentId as string },
      include: { site: { select: { id: true, userId: true, mnsName: true } } },
    })
    if (!deployment) throw new AppError(404, 'Deployment not found.')

    res.json({
      deploymentId: deployment.id,
      siteId: deployment.site.id,
      status: deployment.status,
      step: deployment.step || deployment.status,
      error: deployment.errorMsg,
      scAddress: deployment.scAddress,
      url: deployment.status === 'COMPLETE' ? mnsUrl(deployment.site.mnsName) : null,
      createdAt: deployment.createdAt,
      updatedAt: deployment.updatedAt,
    })
  } catch (err) { next(err) }
})

export default router
