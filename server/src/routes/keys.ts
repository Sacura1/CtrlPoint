import { Router, Response } from 'express'
import prisma from '../lib/prisma'
import { requireAuth } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { AuthRequest } from '../types'
import { encrypt } from '../utils/encryption'

const router = Router()

const VALID_PROVIDERS = ['openai', 'anthropic'] as const
type Provider = typeof VALID_PROVIDERS[number]

function isValidProvider(p: unknown): p is Provider {
  return typeof p === 'string' && (VALID_PROVIDERS as readonly string[]).includes(p)
}

// GET /api/keys — returns which providers have a key saved (never returns the key itself)
router.get('/', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const keys = await prisma.userApiKey.findMany({
      where: { userId: req.user!.userId },
      select: { provider: true, createdAt: true },
    })
    const result: Record<string, boolean> = { openai: false, anthropic: false }
    for (const k of keys) result[k.provider] = true
    res.json({ keys: result })
  } catch (err) { next(err) }
})

// POST /api/keys — save or replace a key for a provider
router.post('/', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const { provider, apiKey } = req.body

    if (!isValidProvider(provider)) throw new AppError(400, 'Provider must be "openai" or "anthropic".')
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 10)
      throw new AppError(400, 'Invalid API key.')

    const trimmed = apiKey.trim()

    // Basic format check
    if (provider === 'openai' && !trimmed.startsWith('sk-'))
      throw new AppError(400, 'OpenAI keys start with "sk-".')
    if (provider === 'anthropic' && !trimmed.startsWith('sk-ant-'))
      throw new AppError(400, 'Anthropic keys start with "sk-ant-".')

    const { encryptedKey, iv } = encrypt(trimmed)

    await prisma.userApiKey.upsert({
      where: { userId_provider: { userId: req.user!.userId, provider } },
      create: { userId: req.user!.userId, provider, encryptedKey, iv },
      update: { encryptedKey, iv },
    })

    res.json({ ok: true })
  } catch (err) { next(err) }
})

// DELETE /api/keys/:provider — remove a saved key
router.delete('/:provider', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const { provider } = req.params
    if (!isValidProvider(provider)) throw new AppError(400, 'Invalid provider.')

    await prisma.userApiKey.deleteMany({
      where: { userId: req.user!.userId, provider },
    })

    res.json({ ok: true })
  } catch (err) { next(err) }
})

export default router
