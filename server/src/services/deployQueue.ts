import { DeployJob, DeploymentStatus } from '../types'
import { PrismaClient } from '@prisma/client'
import { uploadSite } from './massa'
import { registerMns } from './mns'
import { cfg } from '../config'

const prisma = new PrismaClient()

// In-memory job store for status polling
const jobs = new Map<string, DeployJob>()

export function getJob(id: string): DeployJob | undefined {
  return jobs.get(id)
}

function updateJob(id: string, update: Partial<DeployJob>) {
  const job = jobs.get(id)
  if (job) jobs.set(id, { ...job, ...update })
}

async function updateDeploymentDb(id: string, status: DeploymentStatus, data?: { scAddress?: string; errorMsg?: string }) {
  await prisma.deployment.update({
    where: { id },
    data: { status, ...data, updatedAt: new Date() },
  })
}

export async function queueDeploy(params: {
  deploymentId: string
  siteId: string
  mnsName: string
  html: string
  title: string
  description: string
  existingScAddress?: string
  isUpdate: boolean
}): Promise<void> {
  const job: DeployJob = {
    id: params.deploymentId,
    siteId: params.siteId,
    status: 'QUEUED',
    step: 'Queued',
    startedAt: new Date(),
  }
  jobs.set(params.deploymentId, job)

  // Run async — do not await
  runDeploy(params, job).catch(console.error)
}

const log = (deploymentId: string, msg: string) =>
  console.log(`[deploy:${deploymentId.slice(0, 8)}] ${msg}`)

async function runDeploy(
  params: {
    deploymentId: string
    siteId: string
    mnsName: string
    html: string
    title: string
    description: string
    existingScAddress?: string
    isUpdate: boolean
  },
  job: DeployJob
): Promise<void> {
  const id = params.deploymentId
  log(id, `Starting ${params.isUpdate ? 'update' : 'initial deploy'} for "${params.mnsName}"`)

  try {
    // Upload site to Massa chain
    log(id, 'Uploading HTML to Massa chain...')
    updateJob(job.id, { status: 'UPLOADING', step: 'Uploading to Massa chain...' })
    await updateDeploymentDb(id, 'UPLOADING')

    const { scAddress } = await uploadSite(
      params.html,
      params.title,
      params.description,
      params.existingScAddress,
      (step) => { log(id, step); updateJob(job.id, { step }) }
    )
    log(id, `Upload complete — SC address: ${scAddress}`)

    updateJob(job.id, { scAddress })
    await updateDeploymentDb(id, 'UPLOADING', { scAddress })
    await prisma.site.update({ where: { id: params.siteId }, data: { scAddress } })

    // Register MNS (only on initial deploy, not updates)
    if (!params.isUpdate) {
      log(id, `Registering MNS name "${params.mnsName}"...`)
      updateJob(job.id, { status: 'MNS_REGISTERING', step: 'Registering domain...' })
      await updateDeploymentDb(id, 'MNS_REGISTERING')

      await registerMns(params.mnsName, scAddress, undefined, (step) => {
        log(id, step)
        updateJob(job.id, { step })
      })
      log(id, `MNS registration complete`)
    }

    log(id, `Deployment COMPLETE — https://${params.mnsName}.${cfg.mnsPublicDomain}`)
    updateJob(job.id, { status: 'COMPLETE', step: 'Live!' })
    await updateDeploymentDb(id, 'COMPLETE', { scAddress })
    await prisma.site.update({
      where: { id: params.siteId },
      data: { status: 'LIVE', scAddress, updatedAt: new Date() },
    })
  } catch (err: any) {
    const errorMsg = err?.message || 'Unknown error'
    log(id, `FAILED: ${errorMsg}`)
    updateJob(job.id, { status: 'FAILED', step: 'Failed', error: errorMsg })
    await updateDeploymentDb(id, 'FAILED', { errorMsg })
    await prisma.site.update({
      where: { id: params.siteId },
      data: { status: 'ERROR' },
    })
  }
}
