import { Router, Response } from 'express'
import prisma from '../lib/prisma'
import { v4 as uuidv4 } from 'uuid'
import { requireAuth } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { AuthRequest } from '../types'
import { checkMnsAvailable, mnsRegistrationCreditCost, mnsRegistrationMessage } from '../services/mns'
import { applyDailyFreeCredits } from '../services/credits'
import { cfg } from '../config'
import { wakeDeployWorker } from '../services/deployWorker'
import { injectArcContractConfig } from '../services/arcContracts'

const router = Router()
const mnsUrl = (name: string) => `https://${name}.${cfg.mnsPublicDomain}`

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isDatabaseConnectionError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err || '')
  return /can't reach database|database server|connection|timeout|p1001/i.test(message)
}

async function withDatabaseRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (!isDatabaseConnectionError(err) || attempt === attempts - 1) break
      await sleep(250 * (attempt + 1))
    }
  }
  throw lastError
}

// Check if MNS name is available (used before deployment)
router.get('/check-mns/:name', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const name = req.params.name as string
    const available = await checkMnsAvailable(name)
    const creditCost = mnsRegistrationCreditCost(name)
    res.json({ available, creditCost, free: creditCost === 0, message: mnsRegistrationMessage(name) })
  } catch (err: any) {
    // Validation errors (bad format) → report as invalid; provider errors → assume available
    const isValidation = err.message?.includes('Name')
    const name = req.params.name as string
    const creditCost = isValidation ? 0 : mnsRegistrationCreditCost(name)
    res.json({
      available: isValidation ? false : true,
      error: isValidation ? err.message : undefined,
      creditCost,
      free: creditCost === 0,
      message: isValidation ? undefined : mnsRegistrationMessage(name),
    })
  }
})

// Kick off a deployment
router.post('/', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const { siteId } = req.body
    if (!siteId) throw new AppError(400, 'siteId is required.')

    // Load site
    let site = await prisma.site.findUnique({ where: { id: siteId }, include: { arcDapp: true } })
    if (!site) throw new AppError(404, 'Site not found.')
    if (site.userId !== req.user!.userId) throw new AppError(403, 'Access denied.')
    if (site.ownershipClaimed) {
      throw new AppError(409, 'You already claimed ownership for this site. CtrlPoint no longer controls its MNS record, so platform updates are disabled.')
    }
    if (site.status === 'DEPLOYING' || site.status === 'UPDATING') {
      // Check if a real active job exists in memory — if not, the deployment is stuck
      const activeDeployment = await prisma.deployment.findFirst({
        where: { siteId, status: { in: ['QUEUED', 'BUILDING', 'UPLOADING', 'MNS_REGISTERING'] } },
        orderBy: { createdAt: 'desc' },
      })
      const isStuck = !activeDeployment ||
        (new Date().getTime() - new Date(activeDeployment.updatedAt).getTime()) > 10 * 60 * 1000

      if (!isStuck) throw new AppError(409, 'A deployment is already running for this site.')

      // Reset stuck deployment so user can retry
      await prisma.site.update({ where: { id: siteId }, data: { status: site.scAddress ? 'LIVE' : 'ERROR' } })
      if (activeDeployment) await prisma.deployment.update({ where: { id: activeDeployment.id }, data: { status: 'FAILED', step: 'Failed — timed out', errorMsg: 'Deployment timed out or was interrupted.' } })
    }
    if (!site.generatedCode) throw new AppError(400, 'Site has no generated code. Generate a site first.')
    if (site.kind === 'ARC_DAPP' && site.arcDapp) {
      const refreshedCode = injectArcContractConfig(site.generatedCode, {
        contractAddress: site.arcDapp.contractAddress,
        abiJson: site.arcDapp.abiJson,
        explorerUrl: site.arcDapp.explorerUrl,
        contractName: site.arcDapp.contractName,
        ownerAddress: site.arcDapp.ownerAddress,
      })
      if (refreshedCode !== site.generatedCode) {
        const updated = await prisma.site.update({ where: { id: site.id }, data: { generatedCode: refreshedCode } })
        site = { ...site, ...updated, generatedCode: refreshedCode }
      }
    }

    const isUpdate = site.status === 'LIVE'

    // Check MNS availability for initial deploys (fail-open: if check errors, let deploy proceed)
    if (!isUpdate) {
      const available = await checkMnsAvailable(site.mnsName).catch(() => true)
      if (available === false)
        throw new AppError(409, `The MNS name "${site.mnsName}" is already registered on Massa. Please choose a different name.`)
    }

    // Mark site as deploying
    const deploymentId = uuidv4()
    const mnsCreditCost = !isUpdate ? mnsRegistrationCreditCost(site.mnsName) : 0
    const user = mnsCreditCost > 0 ? await applyDailyFreeCredits(prisma, req.user!.userId) : null

    await prisma.$transaction(async tx => {
      if (mnsCreditCost > 0) {
        const charged = await tx.user.updateMany({
          where: { id: req.user!.userId, credits: { gte: mnsCreditCost } },
          data: { credits: { decrement: mnsCreditCost } },
        })
        if (charged.count !== 1) {
          throw new AppError(402, `Insufficient credits. Short MNS name "${site.mnsName}" costs ${mnsCreditCost.toLocaleString()} credits. You have ${user?.credits ?? 0}.`)
        }
        await tx.creditTransaction.create({
          data: {
            userId: req.user!.userId,
            amount: -mnsCreditCost,
            type: 'mns_registration',
            note: `MNS registration for ${site.mnsName} (${deploymentId})`,
          },
        })
      }

      await tx.site.update({
        where: { id: siteId },
        data: { status: isUpdate ? 'UPDATING' : 'DEPLOYING' },
      })
      await tx.deployment.create({
        data: {
          id: deploymentId,
          siteId,
          type: isUpdate ? 'UPDATE' : 'INITIAL',
          status: 'QUEUED',
          source: site.lastPrompt ? 'agent' : 'upload',
          step: 'Queued',
        },
      })
    }, { maxWait: 15_000, timeout: 30_000 })
    wakeDeployWorker()

    res.status(202).json({
      deploymentId,
      message: isUpdate ? 'Update started.' : 'Deployment started.',
      creditsCharged: mnsCreditCost,
    })
  } catch (err) { next(err) }
})

// Poll deployment status
router.get('/status/:deploymentId', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const deploymentId = req.params.deploymentId as string

    const deployment = await withDatabaseRetry(() => prisma.deployment.findUnique({
      where: { id: deploymentId as string },
      include: { site: { select: { mnsName: true, userId: true } } },
    }))
    if (!deployment) throw new AppError(404, 'Deployment not found.')
    if (deployment.site.userId !== req.user!.userId) throw new AppError(403, 'Access denied.')

    res.json({
      status: deployment.status,
      step: deployment.step || deployment.status,
      scAddress: deployment.scAddress,
      error: deployment.errorMsg,
      url: deployment.status === 'COMPLETE' ? mnsUrl(deployment.site.mnsName) : null,
    })
  } catch (err) {
    if (isDatabaseConnectionError(err)) {
      next(new AppError(503, 'Deployment status is temporarily unavailable. The app will retry.'))
      return
    }
    next(err)
  }
})

export default router
