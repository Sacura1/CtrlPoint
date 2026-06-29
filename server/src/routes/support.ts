import { Router, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import prisma from '../lib/prisma'
import { cfg } from '../config'
import { AppError } from '../middleware/errorHandler'
import { AuthPayload } from '../types'

const router = Router()

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function optionalUser(req: Request): AuthPayload | null {
  const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '')
  if (!token) return null
  try {
    return jwt.verify(token, cfg.jwtSecret) as AuthPayload
  } catch {
    return null
  }
}

router.post('/tickets', async (req: Request, res: Response, next) => {
  try {
    const authUser = optionalUser(req)
    const email = String(req.body.email || authUser?.email || '').trim().toLowerCase()
    const title = String(req.body.title || '').trim()
    const body = String(req.body.body || '').trim()

    if (!email || !isValidEmail(email)) throw new AppError(400, 'Enter a valid email address.')
    if (title.length < 3) throw new AppError(400, 'Title must be at least 3 characters.')
    if (title.length > 140) throw new AppError(400, 'Title is too long.')
    if (body.length < 10) throw new AppError(400, 'Message must be at least 10 characters.')
    if (body.length > 5000) throw new AppError(400, 'Message is too long.')

    const ticket = await prisma.supportTicket.create({
      data: {
        userId: authUser?.userId,
        email,
        title,
        body,
      },
      select: { id: true, status: true, createdAt: true },
    })

    res.status(201).json({ ticket })
  } catch (err) { next(err) }
})

export default router
