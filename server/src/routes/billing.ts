import { Router, Response, Request } from 'express'
import { PrismaClient } from '@prisma/client'
import crypto from 'crypto'
import { requireAuth } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { AuthRequest } from '../types'
import { cfg } from '../config'

const router = Router()
const prisma = new PrismaClient()

// Credit packages
const PACKAGES = [
  { id: 'starter', name: 'Starter Credits', credits: 25, priceUsd: 9.99 },
  { id: 'builder', name: 'Builder Credits', credits: 100, priceUsd: 34.99 },
  { id: 'pro', name: 'Pro Credits', credits: 300, priceUsd: 89.99 },
  { id: 'studio', name: 'Studio Credits', credits: 1000, priceUsd: 249.99 },
]

type PackageId = keyof typeof cfg.polarProducts

function isPackageId(value: string): value is PackageId {
  return value === 'starter' || value === 'builder' || value === 'pro' || value === 'studio'
}

function polarApiBase(): string {
  return cfg.polarEnvironment === 'sandbox'
    ? 'https://sandbox-api.polar.sh/v1'
    : 'https://api.polar.sh/v1'
}

function polarProductId(packageId: string): string {
  return isPackageId(packageId) ? cfg.polarProducts[packageId] : ''
}

function assertPolarConfigured(packageId: string) {
  if (!cfg.polarAccessToken) throw new AppError(503, 'Polar billing is not configured yet. Contact support.')
  if (!polarProductId(packageId)) throw new AppError(503, `Polar product is not configured for package "${packageId}".`)
}

function webhookSecretBytes(secret: string): Buffer {
  const trimmed = secret.trim()
  if (trimmed.startsWith('whsec_')) return Buffer.from(trimmed.slice('whsec_'.length), 'base64')
  return Buffer.from(trimmed, 'utf8')
}

function verifyPolarWebhook(req: Request): void {
  if (!cfg.polarWebhookSecret) throw new AppError(503, 'Polar webhook secret is not configured.')

  const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body || ''), 'utf8')
  const id = String(req.headers['webhook-id'] || req.headers['svix-id'] || '')
  const timestamp = String(req.headers['webhook-timestamp'] || req.headers['svix-timestamp'] || '')
  const signatureHeader = String(req.headers['webhook-signature'] || req.headers['svix-signature'] || '')

  if (!id || !timestamp || !signatureHeader) throw new AppError(400, 'Missing Polar webhook signature headers.')

  const ts = Number(timestamp)
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 5 * 60) {
    throw new AppError(400, 'Polar webhook timestamp is outside the allowed window.')
  }

  const signed = Buffer.concat([
    Buffer.from(`${id}.${timestamp}.`, 'utf8'),
    rawBody,
  ])
  const expected = crypto.createHmac('sha256', webhookSecretBytes(cfg.polarWebhookSecret)).update(signed).digest('base64')
  const signatures = signatureHeader
    .split(' ')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => part.startsWith('v1,') ? part.slice(3) : part)

  const ok = signatures.some(signature => {
    const actual = Buffer.from(signature)
    const expectedBuffer = Buffer.from(expected)
    return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer)
  })
  if (!ok) throw new AppError(400, 'Invalid Polar webhook signature.')
}

async function fulfillCreditPurchase(params: {
  userId: string
  packageId: string
  credits: number
  paymentId: string
  provider: 'stripe' | 'polar'
}) {
  const existing = await prisma.creditTransaction.findFirst({
    where: { stripePaymentId: params.paymentId },
    select: { id: true },
  })
  if (existing) return

  await prisma.$transaction([
    prisma.user.update({
      where: { id: params.userId },
      data: { credits: { increment: params.credits } },
    }),
    prisma.creditTransaction.create({
      data: {
        userId: params.userId,
        amount: params.credits,
        type: 'purchase',
        stripePaymentId: params.paymentId,
        note: `Purchased ${params.credits} credits via ${params.provider} (${params.packageId})`,
      },
    }),
  ])
}

router.get('/packages', (req: Request, res: Response) => {
  res.json({ packages: PACKAGES })
})

router.get('/history', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const transactions = await prisma.creditTransaction.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    res.json({ transactions })
  } catch (err) { next(err) }
})

router.post('/checkout', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const { packageId } = req.body
    const pkg = PACKAGES.find(p => p.id === packageId)
    if (!pkg) throw new AppError(400, 'Invalid package.')

    if (cfg.billingProvider === 'polar') {
      assertPolarConfigured(packageId)
      const polarRes = await fetch(`${polarApiBase()}/checkouts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfg.polarAccessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          products: [polarProductId(packageId)],
          external_customer_id: req.user!.userId,
          customer_email: req.user!.email,
          customer_ip_address: req.ip,
          allow_discount_codes: false,
          success_url: `${cfg.clientUrl}/credits?checkout=success`,
          return_url: `${cfg.clientUrl}/credits`,
          metadata: {
            userId: req.user!.userId,
            packageId: pkg.id,
            credits: pkg.credits,
          },
        }),
      })
      const data = await polarRes.json() as any
      if (!polarRes.ok || !data?.url) {
        throw new AppError(502, data?.detail || data?.error || 'Could not create Polar checkout.')
      }
      res.json({ url: data.url })
      return
    }

    if (!cfg.stripeSecretKey) throw new AppError(503, 'Billing not configured yet. Contact support.')

    const stripe = (await import('stripe')).default
    const stripeClient = new stripe(cfg.stripeSecretKey)

    const session = await stripeClient.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: pkg.priceUsd * 100,
          product_data: { name: `CtrlPoint ${pkg.name} — ${pkg.credits} credits` },
        },
        quantity: 1,
      }],
      metadata: { userId: req.user!.userId, packageId, credits: pkg.credits.toString() },
      success_url: `${cfg.clientUrl}/dashboard?credits=added`,
      cancel_url: `${cfg.clientUrl}/dashboard?credits=cancelled`,
    })

    res.json({ url: session.url })
  } catch (err) { next(err) }
})

// Stripe webhook — credits fulfillment
router.post('/webhook', async (req: Request, res: Response, next) => {
  try {
    if (!cfg.stripeSecretKey) { res.json({ ok: true }); return }

    const stripe = (await import('stripe')).default
    const stripeClient = new stripe(cfg.stripeSecretKey)
    const sig = req.headers['stripe-signature'] as string
    const event = stripeClient.webhooks.constructEvent(req.body, sig, cfg.stripeWebhookSecret)

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as any
      const { userId, credits, packageId } = session.metadata
      const creditCount = parseInt(credits)

      await fulfillCreditPurchase({
        userId,
        packageId,
        credits: creditCount,
        paymentId: String(session.payment_intent),
        provider: 'stripe',
      })
    }

    res.json({ received: true })
  } catch (err) { next(err) }
})

router.post('/polar/webhook', async (req: Request, res: Response, next) => {
  try {
    verifyPolarWebhook(req)
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '')
    const event = JSON.parse(rawBody)
    if (event.type !== 'order.paid') {
      res.json({ received: true, ignored: true })
      return
    }

    const order = event.data || {}
    const metadata = order.metadata || {}
    const packageId = String(metadata.packageId || '')
    const pkg = PACKAGES.find(p => p.id === packageId)
    if (!pkg) throw new AppError(400, 'Polar order metadata has an invalid packageId.')
    if (order.product_id !== polarProductId(pkg.id)) {
      throw new AppError(400, 'Polar order product does not match the purchased credit package.')
    }

    const userId = String(metadata.userId || order.customer?.external_id || '')
    if (!userId) throw new AppError(400, 'Polar order is missing user id metadata.')

    const credits = Number(metadata.credits || pkg.credits)
    if (!Number.isInteger(credits) || credits !== pkg.credits) {
      throw new AppError(400, 'Polar order metadata has an invalid credit amount.')
    }

    await fulfillCreditPurchase({
      userId,
      packageId: pkg.id,
      credits: pkg.credits,
      paymentId: `polar:${order.id}`,
      provider: 'polar',
    })

    res.json({ received: true })
  } catch (err) { next(err) }
})

export default router
