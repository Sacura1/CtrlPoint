import crypto from 'crypto'
import { RequestHandler } from 'express'
import prisma from '../lib/prisma'
import { cfg } from '../config'
import { AgentAuthRequest } from '../types'

const { createGatewayMiddleware } = require('@circle-fin/x402-batching/server') as {
  createGatewayMiddleware: (config: {
    sellerAddress: string
    facilitatorUrl?: string
    networks?: string | string[]
    description?: string
  }) => {
    require: (price: string) => RequestHandler
  }
}


type GatewayInstance = ReturnType<typeof createGatewayMiddleware>

let gateway: GatewayInstance | null = null

function getGateway(): GatewayInstance {
  if (!cfg.circleX402Enabled) throw new Error('Circle x402 payments are not enabled.')
  if (!cfg.circleX402SellerAddress) throw new Error('Circle x402 seller address is not configured.')
  if (!gateway) {
    gateway = createGatewayMiddleware({
      sellerAddress: cfg.circleX402SellerAddress,
      facilitatorUrl: cfg.circleX402FacilitatorUrl,
      ...(cfg.circleX402Networks.length ? { networks: cfg.circleX402Networks } : {}),
      description: 'CtrlPoint DeWeb deployment for AI agents',
    })
  }
  return gateway
}

function agentWalletEmail(payer: string, network: string): string {
  const key = `${network}:${payer.toLowerCase()}`
  const hash = crypto.createHash('sha256').update(key).digest('hex').slice(0, 32)
  return `agent-${hash}@agents.ctrlpoint.internal`
}

export async function findOrCreateAgentWalletUser(payer: string, network: string) {
  const email = agentWalletEmail(payer, network)
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      credits: 0,
    },
    select: { id: true, email: true },
  })
}

export function requireCirclePayment(price: string): RequestHandler {
  return getGateway().require(price) as unknown as RequestHandler
}

export async function attachX402AgentUser(req: AgentAuthRequest, _res: unknown, next: (err?: unknown) => void) {
  try {
    if (req.user && req.agentBillingMode === 'credits') {
      next()
      return
    }

    const payment = req.payment
    if (!payment?.verified || !payment.payer || !payment.network) {
      next(new Error('Circle x402 payment was not verified.'))
      return
    }

    const user = await findOrCreateAgentWalletUser(payment.payer, payment.network)
    req.user = {
      userId: user.id,
      email: user.email,
      authMode: 'x402',
      payer: payment.payer,
      paymentNetwork: payment.network,
    }
    req.agentBillingMode = 'x402'
    next()
  } catch (err) {
    next(err)
  }
}
