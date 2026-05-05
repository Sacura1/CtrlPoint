import { Router, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { requireAuth } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { AuthRequest } from '../types'
import { chat, updateSiteChat, ChatMessage, isAllowedModel, AllowedModel, UserKeys, isReasoningEffort, ReasoningEffort } from '../services/ai'
import { cfg } from '../config'
import { decrypt } from '../utils/encryption'
import { applyDailyFreeCredits, creditCostForModel } from '../services/credits'

const router = Router()
const prisma = new PrismaClient()

function resolveModel(body: any): AllowedModel | undefined {
  if (!cfg.enableModelSelection) return undefined
  const m = body?.model
  return isAllowedModel(m) ? m : undefined
}

function resolveReasoningEffort(body: any): ReasoningEffort | undefined {
  if (!cfg.enableModelSelection) return undefined
  return isReasoningEffort(body?.reasoningEffort) ? body.reasoningEffort : undefined
}

async function resolveUserKeys(userId: string): Promise<UserKeys> {
  const rows = await prisma.userApiKey.findMany({ where: { userId } })
  const keys: UserKeys = {}
  for (const row of rows) {
    try {
      const plain = decrypt(row.encryptedKey, row.iv)
      if (row.provider === 'openai') keys.openaiKey = plain
      else if (row.provider === 'anthropic') keys.anthropicKey = plain
    } catch {
      throw new AppError(409, `Your saved ${row.provider === 'openai' ? 'OpenAI' : 'Anthropic'} API key could not be read. Remove it in API Keys settings and add it again.`)
    }
  }
  return keys
}

function hasUserKeyForProvider(userKeys: UserKeys, provider: 'openai' | 'anthropic'): boolean {
  return provider === 'openai' ? !!userKeys.openaiKey : !!userKeys.anthropicKey
}

function selectedProvider(model: AllowedModel | undefined): 'openai' | 'anthropic' {
  if (model) return model.startsWith('gpt-') ? 'openai' : 'anthropic'
  return cfg.aiProvider === 'openai' ? 'openai' : 'anthropic'
}

function effectiveModel(model: AllowedModel | undefined): string {
  if (model) return model
  return selectedProvider(model) === 'openai' ? cfg.openaiModel : cfg.anthropicModel
}

async function chargeAiCredit(userId: string, type: 'generate' | 'edit', note: string, cost: number): Promise<number> {
  if (cost <= 0) return (await applyDailyFreeCredits(prisma, userId))?.credits ?? 0

  const user = await applyDailyFreeCredits(prisma, userId)
  if (!user) throw new AppError(404, 'User not found.')
  if (user.credits < cost) {
    throw new AppError(402, `Insufficient credits. AI ${type} costs ${cost} credit(s). You have ${user.credits}.`)
  }

  const updatedUser = await prisma.user.update({
    where: { id: userId },
    data: { credits: { decrement: cost } },
  })
  await prisma.creditTransaction.create({
    data: {
      userId,
      amount: -cost,
      type,
      note: `${note} (${cost} credit${cost === 1 ? '' : 's'})`,
    },
  })
  return updatedUser.credits
}

async function ensurePlatformAiCredits(userId: string, type: 'generate' | 'edit', cost: number, usesUserKey: boolean): Promise<number> {
  const user = await applyDailyFreeCredits(prisma, userId)
  if (!user) throw new AppError(404, 'User not found.')
  if (usesUserKey) return user.credits
  if (cost > 0 && user.credits < cost) {
    throw new AppError(402, `Insufficient credits. AI ${type} costs ${cost} credit(s). You have ${user.credits}.`)
  }
  return user.credits
}

// Chat with agent (new site or existing)
router.post('/', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const { history, currentHtml } = req.body

    if (!history || !Array.isArray(history) || history.length === 0)
      throw new AppError(400, 'Message history is required.')

    const last = history[history.length - 1]
    if (!last?.content?.trim()) throw new AppError(400, 'Last message cannot be empty.')
    if (last.content.length > 2000) throw new AppError(400, 'Message too long (max 2000 chars).')

    const model = resolveModel(req.body)
    const reasoningEffort = resolveReasoningEffort(req.body)
    const modelName = effectiveModel(model)
    const creditCost = creditCostForModel(modelName)
    const userKeys = await resolveUserKeys(req.user!.userId)
    const usesUserKey = hasUserKeyForProvider(userKeys, selectedProvider(model))
    let remainingCredits = await ensurePlatformAiCredits(req.user!.userId, currentHtml ? 'edit' : 'generate', creditCost, usesUserKey)
    // If caller provides existing HTML (e.g. uploaded file), edit it rather than generate from scratch
    const response = currentHtml
      ? await updateSiteChat(currentHtml, history as ChatMessage[], model, userKeys, reasoningEffort)
      : await chat(history as ChatMessage[], model, userKeys, reasoningEffort)

    if (response.type === 'site' && !usesUserKey) {
      remainingCredits = await chargeAiCredit(
        req.user!.userId,
        currentHtml ? 'edit' : 'generate',
        currentHtml ? `AI edit uploaded site with ${modelName}${reasoningEffort ? ` (${reasoningEffort} reasoning)` : ''}` : `AI site generation with ${modelName}${reasoningEffort ? ` (${reasoningEffort} reasoning)` : ''}`,
        creditCost
      )
    }

    res.json({ ...response, credits: remainingCredits })
  } catch (err) { next(err) }
})

// Chat for updating existing site
router.post('/update/:siteId', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const siteId = req.params.siteId as string
    const { history } = req.body

    if (!history || !Array.isArray(history) || history.length === 0)
      throw new AppError(400, 'Message history is required.')

    const site = await prisma.site.findUnique({ where: { id: siteId } })
    if (!site) throw new AppError(404, 'Site not found.')
    if (site.userId !== req.user!.userId) throw new AppError(403, 'Access denied.')
    if (site.status === 'DEPLOYING' || site.status === 'UPDATING')
      throw new AppError(409, 'Site is currently deploying. Wait for it to finish.')

    const model = resolveModel(req.body)
    const reasoningEffort = resolveReasoningEffort(req.body)
    const modelName = effectiveModel(model)
    const creditCost = creditCostForModel(modelName)
    const userKeys = await resolveUserKeys(req.user!.userId)
    const usesUserKey = hasUserKeyForProvider(userKeys, selectedProvider(model))
    let remainingCredits = await ensurePlatformAiCredits(req.user!.userId, 'edit', creditCost, usesUserKey)
    const response = await updateSiteChat(site.generatedCode, history as ChatMessage[], model, userKeys, reasoningEffort)

    // If AI generated new HTML, save it
    if (response.type === 'site') {
      if (!usesUserKey) {
        remainingCredits = await chargeAiCredit(
          req.user!.userId,
          'edit',
          `AI edit ${site.mnsName} with ${modelName}${reasoningEffort ? ` (${reasoningEffort} reasoning)` : ''}`,
          creditCost
        )
      }

      await prisma.site.update({
        where: { id: siteId },
        data: {
          previousCode: site.generatedCode,
          generatedCode: response.html!,
          title: response.title!,
          description: response.description!,
          lastPrompt: history[history.length - 1].content,
          needsDeploy: true,
        },
      })
    }

    res.json({ ...response, credits: remainingCredits })
  } catch (err) { next(err) }
})

// Revert to previous version
router.post('/revert/:siteId', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const siteId = req.params.siteId as string
    const site = await prisma.site.findUnique({ where: { id: siteId } })
    if (!site) throw new AppError(404, 'Site not found.')
    if (site.userId !== req.user!.userId) throw new AppError(403, 'Access denied.')
    if (!site.previousCode) throw new AppError(400, 'No previous version to revert to.')
    if (site.status === 'DEPLOYING' || site.status === 'UPDATING')
      throw new AppError(409, 'Site is currently deploying.')

    await prisma.site.update({
      where: { id: siteId },
      data: { generatedCode: site.previousCode, previousCode: null, needsDeploy: true },
    })

    res.json({ type: 'site', html: site.previousCode, title: site.title, description: site.description })
  } catch (err) { next(err) }
})

export default router
