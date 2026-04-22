import { Router, Response, Request } from 'express'
import { PrismaClient } from '@prisma/client'
import { requireAuth } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { AuthRequest } from '../types'
import { cfg } from '../config'

const router = Router()
const prisma = new PrismaClient()

// Credit packages
const PACKAGES = [
  { id: 'starter', name: 'Starter', credits: 5, priceUsd: 5 },
  { id: 'pro', name: 'Pro', credits: 15, priceUsd: 12 },
  { id: 'builder', name: 'Builder', credits: 50, priceUsd: 35 },
]

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

// Stripe checkout session
router.post('/checkout', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const { packageId } = req.body
    const pkg = PACKAGES.find(p => p.id === packageId)
    if (!pkg) throw new AppError(400, 'Invalid package.')

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
      const { userId, credits } = session.metadata
      const creditCount = parseInt(credits)

      await prisma.user.update({
        where: { id: userId },
        data: { credits: { increment: creditCount } },
      })
      await prisma.creditTransaction.create({
        data: {
          userId,
          amount: creditCount,
          type: 'purchase',
          stripePaymentId: session.payment_intent,
          note: `Purchased ${creditCount} credits`,
        },
      })
    }

    res.json({ received: true })
  } catch (err) { next(err) }
})

export default router
