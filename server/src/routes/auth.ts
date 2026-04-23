import { Router, Request, Response } from 'express'
import bcrypt from 'bcrypt'
import { OAuth2Client } from 'google-auth-library'
import { PrismaClient } from '@prisma/client'
import { signToken, requireAuth } from '../middleware/auth'
import { AuthRequest } from '../types'
import { AppError } from '../middleware/errorHandler'
import { cfg } from '../config'

const router = Router()
const prisma = new PrismaClient()
const googleClient = new OAuth2Client(cfg.googleClientId)

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function isValidMassaAddress(address: string): boolean {
  return /^AS[A-Za-z0-9]{56,}$/.test(address)
}

function setCookie(res: Response, token: string) {
  const isProduction = cfg.nodeEnv === 'production'
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'lax',
    secure: isProduction,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  })
}

function userPayload(user: { id: string; email: string; credits: number; massaAddress: string | null }) {
  return { id: user.id, email: user.email, credits: user.credits, massaAddress: user.massaAddress }
}

// ── Google OAuth ──────────────────────────────────────────────────────────────

router.post('/google', async (req: Request, res: Response, next) => {
  try {
    const { idToken } = req.body
    if (!idToken) throw new AppError(400, 'Google ID token is required.')
    if (!cfg.googleClientId) throw new AppError(503, 'Google auth is not configured.')

    // Verify the token with Google
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: cfg.googleClientId,
    })
    const payload = ticket.getPayload()
    if (!payload?.email) throw new AppError(400, 'Could not retrieve email from Google account.')

    const { sub: googleId, email, name } = payload

    // Find existing user by googleId or email, or create new
    let user = await prisma.user.findFirst({
      where: { OR: [{ googleId }, { email }] },
    })

    if (user) {
      // Link googleId if signing in via email account for first time with Google
      if (!user.googleId) {
        user = await prisma.user.update({ where: { id: user.id }, data: { googleId } })
      }
    } else {
      // New user — create account, grant signup credits
      user = await prisma.user.create({
        data: { email, googleId, credits: 3 },
      })
      await prisma.creditTransaction.create({
        data: { userId: user.id, amount: 3, type: 'signup_bonus', note: 'Welcome bonus' },
      })
    }

    const token = signToken({ userId: user.id, email: user.email })
    setCookie(res, token)
    res.json({ user: userPayload(user) })
  } catch (err) { next(err) }
})

// ── Email / Password ──────────────────────────────────────────────────────────

router.post('/register', async (req: Request, res: Response, next) => {
  try {
    const { email, password, massaAddress } = req.body

    if (!email || !password) throw new AppError(400, 'Email and password are required.')
    if (!isValidEmail(email)) throw new AppError(400, 'Invalid email address.')
    if (password.length < 8) throw new AppError(400, 'Password must be at least 8 characters.')
    if (massaAddress && !isValidMassaAddress(massaAddress))
      throw new AppError(400, 'Invalid Massa wallet address.')

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) throw new AppError(409, 'An account with this email already exists.')

    const passwordHash = await bcrypt.hash(password, 12)
    const user = await prisma.user.create({
      data: { email, passwordHash, massaAddress: massaAddress || null },
    })
    await prisma.creditTransaction.create({
      data: { userId: user.id, amount: 3, type: 'signup_bonus', note: 'Welcome bonus' },
    })

    const token = signToken({ userId: user.id, email: user.email })
    setCookie(res, token)
    res.status(201).json({ user: userPayload(user) })
  } catch (err) { next(err) }
})

router.post('/login', async (req: Request, res: Response, next) => {
  try {
    const { email, password } = req.body
    if (!email || !password) throw new AppError(400, 'Email and password are required.')

    const user = await prisma.user.findUnique({ where: { email } })
    // User exists but signed up with Google — no password set
    if (user && !user.passwordHash)
      throw new AppError(401, 'This account uses Google sign-in. Please use the Google button.')
    if (!user) throw new AppError(401, 'Invalid email or password.')

    const valid = await bcrypt.compare(password, user.passwordHash!)
    if (!valid) throw new AppError(401, 'Invalid email or password.')

    const token = signToken({ userId: user.id, email: user.email })
    setCookie(res, token)
    res.json({ user: userPayload(user) })
  } catch (err) { next(err) }
})

router.post('/logout', (req: Request, res: Response) => {
  const isProduction = cfg.nodeEnv === 'production'
  res.clearCookie('token', {
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'lax',
    secure: isProduction,
  })
  res.json({ ok: true })
})

router.get('/me', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } })
    if (!user) throw new AppError(404, 'User not found.')
    res.json({ user: userPayload(user) })
  } catch (err) { next(err) }
})

// Generate a new Massa wallet for the user (key shown once, never stored)
router.post('/wallet/generate', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const { Account } = await import('@massalabs/massa-web3')
    const account = await Account.generate()
    const address = account.address.toString()
    const privateKey = account.privateKey.toString()
    // Auto-save address to user profile
    await prisma.user.update({
      where: { id: req.user!.userId },
      data: { massaAddress: address },
    })
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } })
    // Return private key — shown to user once, never persisted
    res.json({ address, privateKey, user: userPayload(user!) })
  } catch (err) { next(err) }
})

router.patch('/me', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const { massaAddress } = req.body
    if (massaAddress && !isValidMassaAddress(massaAddress))
      throw new AppError(400, 'Invalid Massa wallet address.')
    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: { massaAddress },
    })
    res.json({ user: userPayload(user) })
  } catch (err) { next(err) }
})

export default router
