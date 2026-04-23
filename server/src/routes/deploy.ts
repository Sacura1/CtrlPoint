import { Router, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { v4 as uuidv4 } from 'uuid'
import { requireAuth } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { AuthRequest } from '../types'
import { queueDeploy, getJob } from '../services/deployQueue'
import { checkMnsAvailable } from '../services/mns'
import { cfg } from '../config'

const router = Router()
const prisma = new PrismaClient()
const mnsUrl = (name: string) => `https://${name}.${cfg.mnsPublicDomain}`

// Check if MNS name is available (used before deployment)
router.get('/check-mns/:name', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const name = req.params.name as string
    const available = await checkMnsAvailable(name)
    res.json({ available })
  } catch (err: any) {
    // Validation errors (bad format) → report as invalid; provider errors → assume available
    const isValidation = err.message?.includes('Name')
    res.json({ available: isValidation ? false : true, error: isValidation ? err.message : undefined })
  }
})

// Kick off a deployment
router.post('/', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const { siteId } = req.body
    if (!siteId) throw new AppError(400, 'siteId is required.')

    // Load site
    const site = await prisma.site.findUnique({ where: { id: siteId } })
    if (!site) throw new AppError(404, 'Site not found.')
    if (site.userId !== req.user!.userId) throw new AppError(403, 'Access denied.')
    if (site.status === 'DEPLOYING' || site.status === 'UPDATING')
      throw new AppError(409, 'A deployment is already running for this site.')
    if (!site.generatedCode) throw new AppError(400, 'Site has no generated code. Generate a site first.')

    // Check credits
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } })
    if (!user) throw new AppError(404, 'User not found.')
    const isUpdate = site.status === 'LIVE'
    const creditCost = isUpdate ? cfg.credits.update : cfg.credits.deploy
    if (user.credits < creditCost)
      throw new AppError(402, `Insufficient credits. This action costs ${creditCost} credit(s). You have ${user.credits}.`)

    // Check MNS availability for initial deploys (fail-open: if check errors, let deploy proceed)
    if (!isUpdate) {
      const available = await checkMnsAvailable(site.mnsName).catch(() => true)
      if (available === false)
        throw new AppError(409, `The MNS name "${site.mnsName}" is already registered on Massa. Please choose a different name.`)
    }

    // Deduct credits atomically
    await prisma.user.update({
      where: { id: user.id },
      data: { credits: { decrement: creditCost } },
    })
    await prisma.creditTransaction.create({
      data: {
        userId: user.id,
        amount: -creditCost,
        type: isUpdate ? 'update' : 'deploy',
        note: `${isUpdate ? 'Update' : 'Deploy'} ${site.mnsName}`,
      },
    })

    // Mark site as deploying
    await prisma.site.update({
      where: { id: siteId },
      data: { status: isUpdate ? 'UPDATING' : 'DEPLOYING' },
    })

    // Create deployment record
    const deploymentId = uuidv4()
    await prisma.deployment.create({
      data: {
        id: deploymentId,
        siteId,
        type: isUpdate ? 'UPDATE' : 'INITIAL',
        status: 'QUEUED',
      },
    })

    // Queue the job (runs async)
    await queueDeploy({
      deploymentId,
      siteId,
      mnsName: site.mnsName,
      html: site.generatedCode,
      title: site.title,
      description: site.description,
      existingScAddress: isUpdate ? site.scAddress ?? undefined : undefined,
      isUpdate,
    })

    res.status(202).json({
      deploymentId,
      message: isUpdate ? 'Update started.' : 'Deployment started.',
    })
  } catch (err) { next(err) }
})

// Poll deployment status
router.get('/status/:deploymentId', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const deploymentId = req.params.deploymentId as string

    // Check in-memory job first (fastest path)
    const job = getJob(deploymentId)
    if (job) {
      const site = await prisma.site.findUnique({ where: { id: job.siteId }, select: { mnsName: true } })
      return res.json({
        status: job.status,
        step: job.step,
        scAddress: job.scAddress,
        error: job.error,
        url: job.status === 'COMPLETE' && site?.mnsName ? mnsUrl(site.mnsName) : null,
      })
    }

    // Fall back to DB for completed/old jobs
    const deployment = await prisma.deployment.findUnique({
      where: { id: deploymentId as string },
      include: { site: { select: { mnsName: true, userId: true } } },
    })
    if (!deployment) throw new AppError(404, 'Deployment not found.')
    if (deployment.site.userId !== req.user!.userId) throw new AppError(403, 'Access denied.')

    res.json({
      status: deployment.status,
      step: deployment.status,
      scAddress: deployment.scAddress,
      error: deployment.errorMsg,
      url: deployment.status === 'COMPLETE' ? mnsUrl(deployment.site.mnsName) : null,
    })
  } catch (err) { next(err) }
})

export default router
