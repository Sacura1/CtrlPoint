import { Router, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { requireAuth } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { AuthRequest } from '../types'
import { transferMnsOwnership } from '../services/mns'

const router = Router()
const prisma = new PrismaClient()

function validateMnsName(mnsName: string) {
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(mnsName))
    throw new AppError(400, 'Invalid site name. Use only lowercase letters, numbers, and hyphens.')
  if (mnsName.length < 2 || mnsName.length > 100)
    throw new AppError(400, 'Site name must be 2-100 characters.')
}

async function assertMnsNameAvailable(mnsName: string, excludeSiteId?: string) {
  const existing = await prisma.site.findUnique({ where: { mnsName } })
  if (existing && existing.id !== excludeSiteId) {
    throw new AppError(409, `The name "${mnsName}" is already taken. Choose a different name.`)
  }
}

// List all sites for user
router.get('/', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const sites = await prisma.site.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, mnsName: true, scAddress: true, status: true,
        title: true, description: true, createdAt: true, updatedAt: true,
        lastPrompt: true, needsDeploy: true,
        ownershipClaimed: true, ownershipClaimedAt: true, ownershipClaimedTo: true,
      },
    })
    res.json({ sites })
  } catch (err) { next(err) }
})

// Get one site (including code for editing)
router.get('/:siteId', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const site = await prisma.site.findUnique({ where: { id: req.params.siteId as string } })
    if (!site) throw new AppError(404, 'Site not found.')
    if (site.userId !== req.user!.userId) throw new AppError(403, 'Access denied.')
    res.json({ site })
  } catch (err) { next(err) }
})

// Create draft site (before deployment)
router.post('/', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const { mnsName, generatedCode, title, description, lastPrompt } = req.body

    if (!mnsName || !generatedCode) throw new AppError(400, 'mnsName and generatedCode are required.')

    // Validate MNS name format
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(mnsName))
      throw new AppError(400, 'Invalid site name. Use only lowercase letters, numbers, and hyphens.')
    if (mnsName.length < 2 || mnsName.length > 100)
      throw new AppError(400, 'Site name must be 2–100 characters.')

    // Check MNS name not already used in our DB
    const existing = await prisma.site.findUnique({ where: { mnsName } })
    if (existing) throw new AppError(409, `The name "${mnsName}" is already taken. Choose a different name.`)

    const site = await prisma.site.create({
      data: {
        userId: req.user!.userId,
        mnsName,
        generatedCode,
        title: title || 'My Site',
        description: description || '',
        lastPrompt,
        status: 'DRAFT',
      },
    })
    res.status(201).json({ site })
  } catch (err) { next(err) }
})

// Update an undeployed draft before first deployment
router.patch('/:siteId', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const site = await prisma.site.findUnique({ where: { id: req.params.siteId as string } })
    if (!site) throw new AppError(404, 'Site not found.')
    if (site.userId !== req.user!.userId) throw new AppError(403, 'Access denied.')
    if (site.scAddress || site.status === 'LIVE' || site.status === 'DEPLOYING' || site.status === 'UPDATING') {
      throw new AppError(409, 'Only undeployed drafts can be renamed here.')
    }

    const { mnsName, generatedCode, title, description, lastPrompt } = req.body
    const data: Record<string, any> = {}

    if (typeof mnsName === 'string' && mnsName !== site.mnsName) {
      validateMnsName(mnsName)
      await assertMnsNameAvailable(mnsName, site.id)
      data.mnsName = mnsName
    }
    if (typeof generatedCode === 'string' && generatedCode.trim()) data.generatedCode = generatedCode
    if (typeof title === 'string') data.title = title || 'My Site'
    if (typeof description === 'string') data.description = description
    if (typeof lastPrompt === 'string') data.lastPrompt = lastPrompt

    const updated = await prisma.site.update({ where: { id: site.id }, data })
    res.json({ site: updated })
  } catch (err) { next(err) }
})

// Delete a draft site (cannot delete live sites without warning)
router.delete('/:siteId', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const site = await prisma.site.findUnique({ where: { id: req.params.siteId as string } })
    if (!site) throw new AppError(404, 'Site not found.')
    if (site.userId !== req.user!.userId) throw new AppError(403, 'Access denied.')
    if (site.status === 'DEPLOYING' || site.status === 'UPDATING')
      throw new AppError(409, 'Cannot delete a site that is currently deploying.')

    await prisma.site.delete({ where: { id: req.params.siteId as string } })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// Get deployment activity for a site
router.get('/:siteId/deployments', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const site = await prisma.site.findUnique({ where: { id: req.params.siteId as string } })
    if (!site) throw new AppError(404, 'Site not found.')
    if (site.userId !== req.user!.userId) throw new AppError(403, 'Access denied.')

    const deployments = await prisma.deployment.findMany({
      where: { siteId: req.params.siteId as string },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { id: true, type: true, status: true, source: true, commitSha: true, step: true, errorMsg: true, scAddress: true, createdAt: true, updatedAt: true },
    })
    res.json({ deployments })
  } catch (err) { next(err) }
})

// Transfer MNS ownership to user's wallet
router.post('/:siteId/transfer-ownership', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const site = await prisma.site.findUnique({ where: { id: req.params.siteId as string } })
    if (!site) throw new AppError(404, 'Site not found.')
    if (site.userId !== req.user!.userId) throw new AppError(403, 'Access denied.')
    if (site.status !== 'LIVE') throw new AppError(400, 'Site must be live before transferring ownership.')
    if (site.ownershipClaimed) throw new AppError(409, 'Ownership has already been claimed for this site.')

    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } })
    if (!user?.massaAddress) throw new AppError(400, 'Please add your Massa wallet address in settings before transferring ownership.')

    await transferMnsOwnership(site.mnsName, user.massaAddress)
    const updatedSite = await prisma.site.update({
      where: { id: site.id },
      data: {
        ownershipClaimed: true,
        ownershipClaimedAt: new Date(),
        ownershipClaimedTo: user.massaAddress,
      },
    })
    res.json({ ok: true, site: updatedSite, message: `MNS ownership transferred to ${user.massaAddress}` })
  } catch (err) { next(err) }
})

export default router
