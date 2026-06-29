import { Router, Request, Response } from 'express'
import bcrypt from 'bcrypt'
import { OAuth2Client } from 'google-auth-library'
import prisma from '../lib/prisma'
import { signToken, requireAuth } from '../middleware/auth'
import { AuthRequest } from '../types'
import { AppError } from '../middleware/errorHandler'
import { cfg } from '../config'
import { applyDailyFreeCredits } from '../services/credits'
import { recordLogin } from '../services/observability'
import { sendOtpEmail } from '../services/email'

const router = Router()
const googleClient = new OAuth2Client(cfg.googleClientId)

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
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

function otpCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

async function createOtp(email: string, purpose: 'register' | 'reset', userId?: string) {
  const code = otpCode()
  const codeHash = await bcrypt.hash(code, 10)
  await prisma.authOtp.updateMany({
    where: { email, purpose, consumedAt: null },
    data: { consumedAt: new Date() },
  })
  await prisma.authOtp.create({
    data: {
      email,
      purpose,
      userId,
      codeHash,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  })
  await sendOtpEmail(email, code, purpose)
  return code
}

async function verifyOtp(email: string, purpose: 'register' | 'reset', code: string) {
  const otp = await prisma.authOtp.findFirst({
    where: { email, purpose, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  })
  if (!otp) throw new AppError(400, 'Verification code expired. Request a new code.')
  if (otp.attempts >= 5) throw new AppError(429, 'Too many attempts. Request a new code.')

  const valid = await bcrypt.compare(String(code || '').trim(), otp.codeHash)
  if (!valid) {
    await prisma.authOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } })
    throw new AppError(400, 'Invalid verification code.')
  }

  await prisma.authOtp.update({ where: { id: otp.id }, data: { consumedAt: new Date() } })
  return otp
}

router.post('/guest', async (_req: Request, res: Response, next) => {
  try {
    if (cfg.nodeEnv === 'production' && process.env.ENABLE_GUEST_LOGIN !== 'true') {
      throw new AppError(403, 'Guest login is disabled.')
    }

    const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    const user = await prisma.user.create({
      data: {
        email: `guest-${suffix}@ctrlpoint.local`,
        credits: 3,
        dailyCreditsResetAt: new Date(),
      },
    })
    await prisma.creditTransaction.create({
      data: { userId: user.id, amount: 3, type: 'guest_bonus', note: 'Guest testing credits' },
    })

    const token = signToken({ userId: user.id, email: user.email })
    setCookie(res, token)
    await recordLogin(user.id, 'guest')
    res.status(201).json({ user: userPayload(user), token })
  } catch (err) { next(err) }
})

router.post('/email/start', async (req: Request, res: Response, next) => {
  try {
    const email = normalizeEmail(String(req.body.email || ''))
    const purpose = String(req.body.purpose || '') as 'register' | 'reset'
    if (!isValidEmail(email)) throw new AppError(400, 'Enter a valid email address.')
    if (!['register', 'reset'].includes(purpose)) throw new AppError(400, 'Invalid email verification purpose.')

    const user = await prisma.user.findUnique({ where: { email } })
    if (purpose === 'register') {
      if (user) throw new AppError(409, 'An account with this email already exists.')
      const code = await createOtp(email, 'register')
      res.json({ ok: true, ...(cfg.nodeEnv === 'production' ? {} : { devCode: code }) })
      return
    }

    if (user) {
      const code = await createOtp(email, 'reset', user.id)
      res.json({ ok: true, ...(cfg.nodeEnv === 'production' ? {} : { devCode: code }) })
      return
    }

    res.json({ ok: true })
  } catch (err) { next(err) }
})

// ── Google OAuth ──────────────────────────────────────────────────────────────

router.post('/google', async (req: Request, res: Response, next) => {
  try {
    const { idToken, accessToken } = req.body
    if (!idToken && !accessToken) throw new AppError(400, 'Google token is required.')
    if (!cfg.googleClientId) throw new AppError(503, 'Google auth is not configured.')

    let googleId: string
    let email: string

    if (idToken) {
      const ticket = await googleClient.verifyIdToken({ idToken, audience: cfg.googleClientId })
      const payload = ticket.getPayload()
      if (!payload?.email) throw new AppError(400, 'Could not retrieve email from Google account.')
      googleId = payload.sub!
      email = payload.email
    } else {
      // accessToken flow from useGoogleLogin hook
      const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (!infoRes.ok) throw new AppError(400, 'Could not verify Google access token.')
      const info = await infoRes.json() as any
      if (!info.sub || !info.email) throw new AppError(400, 'Could not retrieve email from Google account.')
      googleId = info.sub
      email = info.email
    }

    // Find existing user by googleId or email, or create new
    let user = await prisma.user.findFirst({
      where: { OR: [{ googleId }, { email }] },
    })

    if (user) {
      // Link googleId if signing in via email account for first time with Google
      if (!user.googleId) {
        user = await prisma.user.update({ where: { id: user.id }, data: { googleId } })
      }
      user = await applyDailyFreeCredits(prisma, user.id) ?? user
    } else {
      // New user — create account, grant signup credits
      user = await prisma.user.create({
        data: { email, googleId, credits: 3, dailyCreditsResetAt: new Date() },
      })
      await prisma.creditTransaction.create({
        data: { userId: user.id, amount: 3, type: 'signup_bonus', note: 'Welcome bonus' },
      })
    }

    const token = signToken({ userId: user.id, email: user.email })
    setCookie(res, token)
    await recordLogin(user.id, 'google')
    res.json({ user: userPayload(user), token })
  } catch (err) { next(err) }
})

// ── Email / Password ──────────────────────────────────────────────────────────

router.post('/register', async (req: Request, res: Response, next) => {
  try {
    const email = normalizeEmail(String(req.body.email || ''))
    const { password, massaAddress } = req.body

    if (!email || !password) throw new AppError(400, 'Email and password are required.')
    if (!isValidEmail(email)) throw new AppError(400, 'Invalid email address.')
    if (password.length < 8) throw new AppError(400, 'Password must be at least 8 characters.')
    if (massaAddress && !isValidMassaAddress(massaAddress))
      throw new AppError(400, 'Invalid Massa wallet address.')

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) throw new AppError(409, 'An account with this email already exists.')

    const passwordHash = await bcrypt.hash(password, 12)
    const user = await prisma.user.create({
      data: { email, passwordHash, massaAddress: massaAddress || null, dailyCreditsResetAt: new Date() },
    })
    await prisma.creditTransaction.create({
      data: { userId: user.id, amount: 3, type: 'signup_bonus', note: 'Welcome bonus' },
    })

    const token = signToken({ userId: user.id, email: user.email })
    setCookie(res, token)
    await recordLogin(user.id, 'register')
    res.status(201).json({ user: userPayload(user), token })
  } catch (err) { next(err) }
})

router.post('/register/verify', async (req: Request, res: Response, next) => {
  try {
    const email = normalizeEmail(String(req.body.email || ''))
    const { password, code, massaAddress } = req.body

    if (!email || !password || !code) throw new AppError(400, 'Email, password, and verification code are required.')
    if (!isValidEmail(email)) throw new AppError(400, 'Invalid email address.')
    if (password.length < 8) throw new AppError(400, 'Password must be at least 8 characters.')
    if (massaAddress && !isValidMassaAddress(massaAddress))
      throw new AppError(400, 'Invalid Massa wallet address.')

    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) throw new AppError(409, 'An account with this email already exists.')

    await verifyOtp(email, 'register', code)
    const passwordHash = await bcrypt.hash(password, 12)
    const user = await prisma.user.create({
      data: { email, passwordHash, massaAddress: massaAddress || null, dailyCreditsResetAt: new Date() },
    })
    await prisma.creditTransaction.create({
      data: { userId: user.id, amount: 3, type: 'signup_bonus', note: 'Welcome bonus' },
    })

    const token = signToken({ userId: user.id, email: user.email })
    setCookie(res, token)
    await recordLogin(user.id, 'register')
    res.status(201).json({ user: userPayload(user), token })
  } catch (err) { next(err) }
})

router.post('/login', async (req: Request, res: Response, next) => {
  try {
    const email = normalizeEmail(String(req.body.email || ''))
    const { password } = req.body
    if (!email || !password) throw new AppError(400, 'Email and password are required.')

    const user = await prisma.user.findUnique({ where: { email } })
    // User exists but signed up with Google — no password set
    if (user && !user.passwordHash)
      throw new AppError(401, 'This account uses Google sign-in. Please use the Google button.')
    if (!user) throw new AppError(401, 'Invalid email or password.')

    const valid = await bcrypt.compare(password, user.passwordHash!)
    if (!valid) throw new AppError(401, 'Invalid email or password.')

    const refreshedUser = await applyDailyFreeCredits(prisma, user.id) ?? user
    const token = signToken({ userId: refreshedUser.id, email: refreshedUser.email })
    setCookie(res, token)
    await recordLogin(refreshedUser.id, 'password')
    res.json({ user: userPayload(refreshedUser), token })
  } catch (err) { next(err) }
})

router.post('/password/reset', async (req: Request, res: Response, next) => {
  try {
    const email = normalizeEmail(String(req.body.email || ''))
    const { code, password } = req.body
    if (!email || !code || !password) throw new AppError(400, 'Email, verification code, and new password are required.')
    if (!isValidEmail(email)) throw new AppError(400, 'Invalid email address.')
    if (password.length < 8) throw new AppError(400, 'Password must be at least 8 characters.')

    await verifyOtp(email, 'reset', code)
    const passwordHash = await bcrypt.hash(password, 12)
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) throw new AppError(400, 'Verification code expired. Request a new code.')

    const updated = await prisma.user.update({ where: { id: user.id }, data: { passwordHash } })
    const token = signToken({ userId: updated.id, email: updated.email })
    setCookie(res, token)
    await recordLogin(updated.id, 'password_reset')
    res.json({ user: userPayload(updated), token })
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

router.delete('/me', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.supportTicket.updateMany({
        where: { userId: req.user!.userId },
        data: { userId: null },
      })
      await tx.serverErrorLog.updateMany({
        where: { userId: req.user!.userId },
        data: { userId: null },
      })
      await tx.user.delete({ where: { id: req.user!.userId } })
    })

    const isProduction = cfg.nodeEnv === 'production'
    res.clearCookie('token', {
      httpOnly: true,
      sameSite: isProduction ? 'none' : 'lax',
      secure: isProduction,
    })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

router.get('/me', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const user = await applyDailyFreeCredits(prisma, req.user!.userId)
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
