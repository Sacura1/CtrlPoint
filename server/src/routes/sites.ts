import { Router, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { requireAuth } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { AuthRequest } from '../types'
import { transferMnsOwnership } from '../services/mns'

const router = Router()
const prisma = new PrismaClient()

// List all sites for user
router.get('/', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const sites = await prisma.site.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, mnsName: true, scAddress: true, status: true,
        title: true, description: true, createdAt: true, updatedAt: true,
        lastPrompt: true,
      },
    })
    res.json({ sites })
  } catch (err) { next(err) }
})

// Get one site (including code for editing)
router.get('/:siteId', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const site = await prisma.site.findUnique({ where: { id: req.params.siteId } })
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

// Delete a draft site (cannot delete live sites without warning)
router.delete('/:siteId', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const site = await prisma.site.findUnique({ where: { id: req.params.siteId } })
    if (!site) throw new AppError(404, 'Site not found.')
    if (site.userId !== req.user!.userId) throw new AppError(403, 'Access denied.')
    if (site.status === 'DEPLOYING' || site.status === 'UPDATING')
      throw new AppError(409, 'Cannot delete a site that is currently deploying.')

    await prisma.site.delete({ where: { id: req.params.siteId } })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

// Transfer MNS ownership to user's wallet
router.post('/:siteId/transfer-ownership', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const site = await prisma.site.findUnique({ where: { id: req.params.siteId } })
    if (!site) throw new AppError(404, 'Site not found.')
    if (site.userId !== req.user!.userId) throw new AppError(403, 'Access denied.')
    if (site.status !== 'LIVE') throw new AppError(400, 'Site must be live before transferring ownership.')

    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } })
    if (!user?.massaAddress) throw new AppError(400, 'Please add your Massa wallet address in settings before transferring ownership.')

    await transferMnsOwnership(site.mnsName, user.massaAddress)
    res.json({ ok: true, message: `MNS ownership transferred to ${user.massaAddress}` })
  } catch (err) { next(err) }
})

export default router
