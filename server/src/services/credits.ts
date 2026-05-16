import { PrismaClient } from '@prisma/client'
import { AllowedModel, MODEL_CATALOG } from './ai'

const DAILY_FREE_CREDITS = 3

const MODEL_CREDIT_COSTS: Record<string, number> = Object.fromEntries(MODEL_CATALOG.map(model => [model.id, model.cost]))

function utcDayStart(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

export function creditCostForModel(model: AllowedModel | string | undefined): number {
  return MODEL_CREDIT_COSTS[model || ''] ?? 1
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
