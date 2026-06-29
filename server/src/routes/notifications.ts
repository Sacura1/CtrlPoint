import { Router, Response } from 'express'
import prisma from '../lib/prisma'
import { requireAuth } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { AuthRequest } from '../types'

const router = Router()

function validExpoToken(token: string) {
  return /^ExponentPushToken\[[^\]]+\]$|^ExpoPushToken\[[^\]]+\]$/.test(token)
}

router.post('/tokens', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const token = String(req.body.token || '').trim()
    const platform = String(req.body.platform || '').trim().slice(0, 32) || null
    if (!validExpoToken(token)) throw new AppError(400, 'Invalid push token.')

    await prisma.pushToken.upsert({
      where: { token },
      update: { userId: req.user!.userId, platform },
      create: { userId: req.user!.userId, token, platform },
    })

    res.json({ ok: true })
  } catch (err) { next(err) }
})

router.delete('/tokens', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const token = String(req.body.token || '').trim()
    if (!token) throw new AppError(400, 'Push token is required.')
    await prisma.pushToken.deleteMany({ where: { userId: req.user!.userId, token } })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

export default router
