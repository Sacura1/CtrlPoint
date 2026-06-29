import { PrismaClient } from '@prisma/client'
import { MODEL_CATALOG } from './ai'
import type { AIUsage, AllowedModel, ArcWeb3Category } from './ai'

const DAILY_FREE_CREDITS = 3
const AI_CREDIT_USD_VALUE = Number(process.env.AI_CREDIT_USD_VALUE || '0.25')
const AI_CREDIT_MARKUP_MULTIPLIER = Number(process.env.AI_CREDIT_MARKUP_MULTIPLIER || '1.2')

const MODEL_CREDIT_COSTS: Record<string, number> = Object.fromEntries(MODEL_CATALOG.map(model => [model.id, model.cost]))
const MODEL_TOKEN_PRICES_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  'gpt-5.5': { input: 5, output: 30 },
  'gpt-5.4': { input: 2.5, output: 15 },
  'gpt-5.4-mini': { input: 0.75, output: 4.5 },
  'claude-opus-4-7': { input: 5, output: 25 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
}

const ARC_WEB3_CATEGORY_CREDIT_FLOORS: Record<ArcWeb3Category, number> = {
  'wallet-tools': 4,
  'payment-links': 4,
  'tip-jar': 4,
  eligibility: 4,
  dashboards: 4,
  'split-payments': 4,
  'voting-polls': 4,
  membership: 4,
  games: 4,
  custom: 6,
}

function maxOutputTokensForReasoning(reasoningEffort?: string | null): number {
  return reasoningEffort === 'xhigh' || reasoningEffort === 'max' ? 64_000 : 16_384
}

export function estimatedArcBuildCreditReservation(options: {
  model: AllowedModel | string | undefined
  category: ArcWeb3Category
  prompt: string
  reasoningEffort?: string | null
  currentHtml?: string | null
  isEdit?: boolean
}): number {
  const minimum = minimumAiCreditCost(options.model, { mode: 'arc-web3', arcCategory: options.category })
  const promptTokens = estimateTokensFromText(options.prompt)
  const currentHtmlTokens = estimateTokensFromText(options.currentHtml)
  const outputPerCall = maxOutputTokensForReasoning(options.reasoningEffort)
  const frontendAttempts = 3
  const contractAttempts = options.category === 'custom' && !options.isEdit ? 2 : 0
  const frontendInputPerAttempt = 7_500 + promptTokens + currentHtmlTokens
  const contractInputPerAttempt = 2_500 + promptTokens
  return aiCreditsForTokenEstimate(
    options.model,
    (frontendInputPerAttempt * frontendAttempts) + (contractInputPerAttempt * contractAttempts),
    outputPerCall * (frontendAttempts + contractAttempts),
    minimum,
  )
}

function utcDayStart(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

export function creditCostForModel(model: AllowedModel | string | undefined): number {
  return MODEL_CREDIT_COSTS[model || ''] ?? 1
}

export function arcWeb3CreditFloor(category: ArcWeb3Category | string | undefined): number {
  return ARC_WEB3_CATEGORY_CREDIT_FLOORS[category as ArcWeb3Category] ?? 2
}

export function minimumAiCreditCost(
  model: AllowedModel | string | undefined,
  options?: { mode?: 'site' | 'arc-web3'; arcCategory?: ArcWeb3Category | string }
): number {
  const modelMinimum = creditCostForModel(model)
  if (options?.mode !== 'arc-web3') return modelMinimum
  return Math.max(modelMinimum, arcWeb3CreditFloor(options.arcCategory))
}

export function estimateTokensFromText(value: string | undefined | null): number {
  if (!value) return 0
  return Math.ceil(value.length / 4)
}

function tokenUsdCost(model: string, inputTokens: number, outputTokens: number): number {
  const prices = MODEL_TOKEN_PRICES_USD_PER_MTOK[model]
  if (!prices) return 0
  return (Math.max(0, inputTokens) / 1_000_000 * prices.input) + (Math.max(0, outputTokens) / 1_000_000 * prices.output)
}

export function aiCreditsForTokenEstimate(model: AllowedModel | string | undefined, inputTokens: number, outputTokens: number, minimum = creditCostForModel(model)): number {
  const modelName = model || ''
  const usdCost = tokenUsdCost(modelName, inputTokens, outputTokens)
  const markedUpUsdCost = usdCost * Math.max(1, AI_CREDIT_MARKUP_MULTIPLIER)
  const tokenCredits = markedUpUsdCost > 0 ? Math.ceil(markedUpUsdCost / AI_CREDIT_USD_VALUE) : 0
  return Math.max(minimum, tokenCredits)
}

export function aiCreditsForUsage(model: AllowedModel | string | undefined, usage: AIUsage | undefined, minimum = creditCostForModel(model)): number {
  if (!usage) return minimum
  return aiCreditsForTokenEstimate(model, usage.inputTokens, usage.outputTokens, minimum)
}

export async function applyDailyFreeCredits(prisma: PrismaClient, userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return null

  const today = utcDayStart()
  if (user.dailyCreditsResetAt && user.dailyCreditsResetAt >= today) return user

  const creditTopUp = Math.max(0, DAILY_FREE_CREDITS - user.credits)
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      credits: creditTopUp > 0 ? { increment: creditTopUp } : undefined,
      dailyCreditsResetAt: new Date(),
    },
  })

  if (creditTopUp > 0) {
    await prisma.creditTransaction.create({
      data: {
        userId,
        amount: creditTopUp,
        type: 'daily_free_credits',
        note: `Daily free credits reset to ${DAILY_FREE_CREDITS}`,
      },
    })
  }

  return updated
}

export async function refundMnsRegistrationCreditsForDeployment(
  prisma: PrismaClient,
  userId: string,
  mnsName: string,
  deploymentId: string
): Promise<void> {
  const charge = await prisma.creditTransaction.findFirst({
    where: {
      userId,
      type: 'mns_registration',
      amount: { lt: 0 },
      note: { contains: `(${deploymentId})` },
    },
    orderBy: { createdAt: 'desc' },
  })
  if (!charge) return

  const refundExists = await prisma.creditTransaction.findFirst({
    where: {
      userId,
      type: 'mns_registration_refund',
      note: { contains: `(${deploymentId})` },
    },
    select: { id: true },
  })
  if (refundExists) return

  const refundAmount = Math.abs(charge.amount)
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { credits: { increment: refundAmount } },
    }),
    prisma.creditTransaction.create({
      data: {
        userId,
        amount: refundAmount,
        type: 'mns_registration_refund',
        note: `Refund for failed MNS registration ${mnsName} (${deploymentId})`,
      },
    }),
  ])
}
