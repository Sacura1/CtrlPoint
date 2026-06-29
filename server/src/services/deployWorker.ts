import prisma from '../lib/prisma'
import { uploadSite } from './massa'
import { registerMns } from './mns'
import { deployGitHubSite } from './githubDeploy'
import { cfg } from '../config'
import { refundMnsRegistrationCreditsForDeployment } from './credits'
import { notifyDeploymentComplete } from './pushNotifications'
import { recordAgentDeploymentProof } from './agentDeploymentLedger'

const ACTIVE_STATUSES = ['BUILDING', 'UPLOADING', 'MNS_REGISTERING']
const STUCK_AFTER_MS = 45 * 60 * 1000

let started = false
let tickRunning = false
let wakeTimer: NodeJS.Timeout | null = null
let lastStuckCleanupAt = 0
let activeStatic = 0
let activeFramework = 0

const log = (deploymentId: string, msg: string) =>
  console.log(`[worker:${deploymentId.slice(0, 8)}] ${msg}`)

type DeploymentWithSite = any
type JobKind = 'static' | 'framework'

function isGitHubSource(source: string | null | undefined): boolean {
  return source === 'github_new' || source === 'github_push' || source === 'github_rollback'
}

function jobKind(deployment: DeploymentWithSite): JobKind {
  if (!isGitHubSource(deployment.source)) return 'static'
  return (deployment.projectType || deployment.site?.githubConnection?.projectType) === 'framework' ? 'framework' : 'static'
}

function hasCapacity(kind: JobKind): boolean {
  if (kind === 'framework') return activeFramework < cfg.deployWorkerFrameworkConcurrency
  return activeStatic < cfg.deployWorkerStaticConcurrency
}

function inc(kind: JobKind) {
  if (kind === 'framework') activeFramework += 1
  else activeStatic += 1
}

function dec(kind: JobKind) {
  if (kind === 'framework') activeFramework = Math.max(0, activeFramework - 1)
  else activeStatic = Math.max(0, activeStatic - 1)
}

async function failStuckDeployments() {
  const cutoff = new Date(Date.now() - STUCK_AFTER_MS)
  const stuck = await prisma.deployment.findMany({
    where: { status: { in: ACTIVE_STATUSES }, updatedAt: { lt: cutoff } },
    select: { id: true, siteId: true },
    take: 20,
  })

  for (const deployment of stuck) {
    await prisma.deployment.update({
      where: { id: deployment.id },
      data: {
        status: 'FAILED',
        step: 'Failed',
        errorMsg: 'Deployment worker was interrupted or timed out. Please retry.',
      },
    }).catch(() => {})
    await prisma.site.update({
      where: { id: deployment.siteId },
      data: { status: 'ERROR' },
    }).catch(() => {})
  }
}

async function hasActiveDeploymentForSite(siteId: string, deploymentId: string): Promise<boolean> {
  const active = await prisma.deployment.findFirst({
    where: {
      siteId,
      id: { not: deploymentId },
      status: { in: ACTIVE_STATUSES },
    },
    select: { id: true },
  })
  return !!active
}

async function updateDeployment(id: string, data: { status?: string; step?: string; scAddress?: string; errorMsg?: string }) {
  await prisma.deployment.update({ where: { id }, data: { ...data, updatedAt: new Date() } }).catch(() => {})
}

async function processManualDeployment(deployment: DeploymentWithSite) {
  const site = deployment.site
  const isUpdate = deployment.type === 'UPDATE' || !!site.scAddress

  log(deployment.id, `Starting ${isUpdate ? 'manual update' : 'manual initial deploy'} for ${site.mnsName}`)
  await prisma.site.update({
    where: { id: site.id },
    data: { status: isUpdate ? 'UPDATING' : 'DEPLOYING' },
  })
  await updateDeployment(deployment.id, { status: 'UPLOADING', step: 'Uploading to Massa chain...' })

  const { scAddress } = await uploadSite(
    site.generatedCode,
    site.title,
    site.description,
    isUpdate ? site.scAddress ?? undefined : undefined,
    (step) => {
      log(deployment.id, step)
      updateDeployment(deployment.id, { step })
    }
  )

  await updateDeployment(deployment.id, { status: 'UPLOADING', scAddress, step: 'Upload complete.' })
  await prisma.site.update({ where: { id: site.id }, data: { scAddress } })

  if (!isUpdate) {
    await updateDeployment(deployment.id, { status: 'MNS_REGISTERING', step: 'Registering domain...' })
    await registerMns(site.mnsName, scAddress, undefined, (step) => {
      log(deployment.id, step)
      updateDeployment(deployment.id, { step })
    })
  }

  await prisma.deployment.updateMany({
    where: { siteId: site.id, id: { not: deployment.id }, status: 'COMPLETE' },
    data: { status: 'SUPERSEDED', step: 'Superseded by a newer deployment.', updatedAt: new Date() },
  })
  await updateDeployment(deployment.id, { status: 'COMPLETE', scAddress, step: 'Live!' })
  await prisma.site.update({
    where: { id: site.id },
    data: { status: 'LIVE', scAddress, needsDeploy: false, updatedAt: new Date() },
  })
  log(deployment.id, `Complete: https://${site.mnsName}.${cfg.mnsPublicDomain}`)
}

async function processGitHubDeployment(deployment: DeploymentWithSite) {
  const connection = deployment.site?.githubConnection
  if (!connection) throw new Error('GitHub connection not found for this site.')

  const sha = deployment.commitSha || 'initial'
  await deployGitHubSite({
    ...connection,
    projectType: deployment.projectType || connection.projectType,
    projectRoot: deployment.projectRoot ?? connection.projectRoot,
    buildCommand: deployment.buildCommand || connection.buildCommand,
    outputDir: deployment.outputDir || connection.outputDir,
    buildEnv: deployment.buildEnv ?? connection.buildEnv,
    site: deployment.site,
    user: deployment.site.user,
  }, sha, deployment.id)
}

async function processDeployment(deployment: DeploymentWithSite) {
  try {
    if (deployment.site?.ownershipClaimed) {
      throw new Error('Ownership has been claimed for this site. CtrlPoint updates are disabled.')
    }
    const isUpdate = deployment.type === 'UPDATE' || !!deployment.site?.scAddress
    if (isGitHubSource(deployment.source)) await processGitHubDeployment(deployment)
    else await processManualDeployment(deployment)
    if (deployment.source === 'agent_x402' || deployment.source === 'agent_x402_framework') {
      await recordAgentDeploymentProof(deployment.id)
        .catch(err => console.error(`[agent-ledger:${deployment.id.slice(0, 8)}] proof write failed:`, err?.message || err))
    }
    if (deployment.site?.userId) {
      await notifyDeploymentComplete(
        deployment.site.userId,
        deployment.site.id,
        deployment.site.title,
        `https://${deployment.site.mnsName}.${cfg.mnsPublicDomain}`,
        isUpdate,
      ).catch(err => console.error(`[push:${deployment.id.slice(0, 8)}] deployment notification failed:`, err))
    }
  } catch (err: any) {
    const errorMsg = err?.message || 'Unknown deployment error'
    log(deployment.id, `Failed: ${errorMsg}`)
    await updateDeployment(deployment.id, { status: 'FAILED', step: 'Failed', errorMsg })
    await prisma.site.update({ where: { id: deployment.siteId }, data: { status: 'ERROR' } }).catch(() => {})
    if (deployment.type === 'INITIAL' && deployment.site?.userId && deployment.site?.mnsName) {
      await refundMnsRegistrationCreditsForDeployment(
        prisma,
        deployment.site.userId,
        deployment.site.mnsName,
        deployment.id
      ).catch(refundErr => console.error(`[worker:${deployment.id.slice(0, 8)}] refund failed:`, refundErr))
    }
  }
}

function scheduleTick(delayMs: number) {
  if (!started || !cfg.enableDeployWorker) return
  if (wakeTimer) clearTimeout(wakeTimer)
  wakeTimer = setTimeout(() => {
    wakeTimer = null
    tick().catch(err => console.error('[worker] tick failed:', err))
  }, Math.max(0, delayMs))
}

export function wakeDeployWorker() {
  scheduleTick(0)
}

async function tick() {
  if (tickRunning) return
  tickRunning = true
  let startedJobs = 0
  let queuedCount = 0
  try {
  if (Date.now() - lastStuckCleanupAt > Math.max(60_000, cfg.deployWorkerIdlePollMs)) {
    lastStuckCleanupAt = Date.now()
    await failStuckDeployments().catch(err => console.error('[worker] stuck cleanup failed:', err))
  }

  const queued = await prisma.deployment.findMany({
    where: { status: 'QUEUED' },
    orderBy: { createdAt: 'asc' },
    take: 10,
    include: {
      site: {
        include: {
          user: true,
          githubConnection: true,
        },
      },
    },
  })
  queuedCount = queued.length

  for (const deployment of queued) {
    const kind = jobKind(deployment)
    if (!hasCapacity(kind)) continue
    if (await hasActiveDeploymentForSite(deployment.siteId, deployment.id)) continue

    const claimed = await prisma.deployment.updateMany({
      where: { id: deployment.id, status: 'QUEUED' },
      data: {
        status: kind === 'framework' ? 'BUILDING' : 'UPLOADING',
        step: kind === 'framework' ? 'Queued build started.' : 'Queued deploy started.',
        updatedAt: new Date(),
      },
    })
    if (claimed.count !== 1) continue

    inc(kind)
    startedJobs += 1
    processDeployment(deployment)
      .catch(err => console.error(`[worker:${deployment.id.slice(0, 8)}]`, err))
      .finally(() => {
        dec(kind)
        scheduleTick(0)
      })
  }
  } finally {
    tickRunning = false
    const activeJobs = activeStatic + activeFramework
    const likelyMoreQueued = queuedCount > startedJobs
    scheduleTick(activeJobs > 0 || likelyMoreQueued ? cfg.deployWorkerPollMs : cfg.deployWorkerIdlePollMs)
  }
}

export function startDeployWorker() {
  if (started || !cfg.enableDeployWorker) return
  started = true
  console.log(`[worker] deploy worker started: static=${cfg.deployWorkerStaticConcurrency}, framework=${cfg.deployWorkerFrameworkConcurrency}, idlePollMs=${cfg.deployWorkerIdlePollMs}`)
  // Recover queued work on boot. New deployment requests wake this worker
  // directly, so the idle safety poll does not keep serverless Postgres awake.
  scheduleTick(1000)
}
