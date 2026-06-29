import { Router, Response } from 'express'
import prisma from '../lib/prisma'
import { requireAuth } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { AuthRequest } from '../types'
import { chat, arcWeb3Chat, updateSiteChat, ChatMessage, isAllowedModel, AllowedModel, UserKeys, isReasoningEffort, ReasoningEffort, ArcWeb3Category } from '../services/ai'
import { cfg } from '../config'
import { decrypt } from '../utils/encryption'
import { aiCreditsForTokenEstimate, aiCreditsForUsage, applyDailyFreeCredits, creditCostForModel, estimateTokensFromText, minimumAiCreditCost } from '../services/credits'
import { notifySiteGenerated } from '../services/pushNotifications'

const router = Router()

function resolveModel(body: any): AllowedModel | undefined {
  if (!cfg.enableModelSelection) return undefined
  const m = body?.model
  return isAllowedModel(m) ? m : undefined
}

function resolveReasoningEffort(body: any): ReasoningEffort | undefined {
  if (!cfg.enableModelSelection) return undefined
  return isReasoningEffort(body?.reasoningEffort) ? body.reasoningEffort : undefined
}

function resolveGenerationMode(body: any): 'site' | 'arc-web3' {
  if (body?.mode === 'arc-web3') throw new AppError(404, 'Arc Web3 generation is disabled.')
  return 'site'
}

const ARC_WEB3_CATEGORIES: readonly ArcWeb3Category[] = [
  'wallet-tools',
  'payment-links',
  'tip-jar',
  'split-payments',
  'voting-polls',
  'membership',
  'games',
  'eligibility',
  'dashboards',
  'custom',
] as const

function resolveArcCategory(body: any): ArcWeb3Category {
  if (ARC_WEB3_CATEGORIES.includes(body?.arcCategory)) return body.arcCategory
  throw new AppError(400, 'Arc app type is required.')
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
    throw new AppError(402, `Insufficient credits. AI ${type} may cost up to ${cost} credit(s) for this model and context. You have ${user.credits}.`)
  }
  return user.credits
}

function maxOutputTokensFor(reasoningEffort?: ReasoningEffort): number {
  return reasoningEffort === 'xhigh' || reasoningEffort === 'max' ? 64_000 : 16_384
}

function estimatedInputTokens(systemKind: 'chat' | 'update', history: ChatMessage[], currentHtml?: string): number {
  const systemReserve = systemKind === 'update' ? 700 : 500
  return systemReserve
    + estimateTokensFromText(currentHtml)
    + history.reduce((sum, message) => sum + estimateTokensFromText(message.content), 0)
}

function aiChargeNote(base: string, modelName: string, reasoningEffort: ReasoningEffort | undefined, usage?: { inputTokens: number; outputTokens: number }) {
  const reasoning = reasoningEffort ? ` (${reasoningEffort} reasoning)` : ''
  const tokenDetail = usage ? `, ${usage.inputTokens.toLocaleString()} input / ${usage.outputTokens.toLocaleString()} output tokens` : ''
  return `${base} with ${modelName}${reasoning}${tokenDetail}`
}

function isProviderGenerationFailure(response: { type: 'chat' | 'site'; text?: string }): boolean {
  if (response.type !== 'chat') return false
  return /AI provider returned (an empty response|incomplete HTML)/i.test(response.text || '')
}

function validateHistory(history: unknown): ChatMessage[] {
  if (!history || !Array.isArray(history) || history.length === 0)
    throw new AppError(400, 'Message history is required.')

  const last = history[history.length - 1]
  if (!last?.content?.trim()) throw new AppError(400, 'Last message cannot be empty.')
  if (last.content.length > 5000) throw new AppError(400, 'Message too long (max 5000 chars).')

  return history as ChatMessage[]
}

type TemplateAssets = Record<string, string>

function validateTemplateAssets(raw: unknown): TemplateAssets {
  if (!raw) return {}
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new AppError(400, 'Invalid uploaded images.')
  const entries = Object.entries(raw as Record<string, unknown>)
  if (entries.length > 8) throw new AppError(400, 'Too many uploaded images.')

  return entries.reduce<TemplateAssets>((assets, [key, value]) => {
    if (!/^CTRLPOINT_IMAGE_[a-zA-Z0-9_-]+_\d+$/.test(key)) throw new AppError(400, 'Invalid uploaded image key.')
    if (typeof value !== 'string' || !value.startsWith('data:image/')) throw new AppError(400, 'Invalid uploaded image data.')
    if (value.length > 900_000) throw new AppError(400, 'One uploaded image is too large. Choose a smaller photo.')
    assets[key] = value
    return assets
  }, {})
}

function applyTemplateAssets(html: string, assets: TemplateAssets) {
  return Object.entries(assets).reduce((nextHtml, [key, dataUri]) => nextHtml.split(key).join(dataUri), html)
}

type PreparedGeneration = {
  generationMode: 'site' | 'arc-web3'
  arcCategory?: ArcWeb3Category
  model?: AllowedModel
  reasoningEffort?: ReasoningEffort
  providerReasoningEffort?: ReasoningEffort
  modelName: string
  minimumCreditCost: number
  userKeys: UserKeys
  usesUserKey: boolean
  remainingCredits: number
}

async function prepareGeneration(userId: string, body: any, history: ChatMessage[], currentHtml?: string): Promise<PreparedGeneration> {
  const generationMode = resolveGenerationMode(body)
  const arcCategory = generationMode === 'arc-web3' ? resolveArcCategory(body) : undefined
  const model = resolveModel(body)
  const reasoningEffort = resolveReasoningEffort(body)
  const providerReasoningEffort = generationMode === 'arc-web3' && !currentHtml ? undefined : reasoningEffort
  const modelName = effectiveModel(model)
  const minimumCreditCost = minimumAiCreditCost(modelName, { mode: generationMode, arcCategory })
  const userKeys = await resolveUserKeys(userId)
  const usesUserKey = hasUserKeyForProvider(userKeys, selectedProvider(model))
  const estimatedCreditCost = aiCreditsForTokenEstimate(
    modelName,
    estimatedInputTokens(currentHtml ? 'update' : 'chat', history, currentHtml),
    maxOutputTokensFor(providerReasoningEffort),
    minimumCreditCost
  )
  const remainingCredits = await ensurePlatformAiCredits(userId, currentHtml ? 'edit' : 'generate', estimatedCreditCost, usesUserKey)

  return {
    generationMode,
    arcCategory,
    model,
    reasoningEffort,
    providerReasoningEffort,
    modelName,
    minimumCreditCost,
    userKeys,
    usesUserKey,
    remainingCredits,
  }
}

async function executeGeneration(userId: string, prepared: PreparedGeneration, history: ChatMessage[], currentHtml?: string) {
  const runGeneration = () => currentHtml
    ? updateSiteChat(currentHtml, history, prepared.model, prepared.userKeys, prepared.providerReasoningEffort)
    : prepared.generationMode === 'arc-web3'
      ? arcWeb3Chat(history, prepared.arcCategory!, prepared.model, prepared.userKeys, prepared.providerReasoningEffort)
      : chat(history, prepared.model, prepared.userKeys, prepared.providerReasoningEffort)

  const response = await runGeneration()
  if (isProviderGenerationFailure(response)) {
    throw new AppError(502, 'The AI provider did not return usable site code. No credits were charged. Please retry.')
  }

  let remainingCredits = prepared.remainingCredits
  if (!prepared.usesUserKey) {
    const finalCreditCost = aiCreditsForUsage(prepared.modelName, response.usage, prepared.minimumCreditCost)
    remainingCredits = await chargeAiCredit(
      userId,
      currentHtml ? 'edit' : 'generate',
      aiChargeNote(response.type === 'site'
        ? (currentHtml ? 'AI edit uploaded site' : prepared.generationMode === 'arc-web3' ? `AI Arc web3 ${prepared.arcCategory} generation` : 'AI site generation')
        : (currentHtml ? 'AI edit attempt' : 'AI generation attempt'),
        prepared.modelName,
        prepared.providerReasoningEffort,
        response.usage
      ),
      finalCreditCost
    )
  }

  return { ...response, credits: remainingCredits }
}

async function generateWithCredits(userId: string, body: any, history: ChatMessage[], currentHtml?: string) {
  const prepared = await prepareGeneration(userId, body, history, currentHtml)
  return executeGeneration(userId, prepared, history, currentHtml)
}

function draftSlugFromPrompt(prompt: string) {
  const stopWords = new Set([
    'a',
    'an',
    'and',
    'app',
    'build',
    'create',
    'for',
    'from',
    'generate',
    'make',
    'me',
    'my',
    'of',
    'page',
    'site',
    'the',
    'to',
    'web',
    'website',
    'with',
  ])
  const words =
    prompt
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(word => word.length > 1 && !stopWords.has(word))
      .slice(0, 5)

  const base = (words.length ? words.join('-') : 'my-site').slice(0, 42).replace(/-+$/g, '')
  return base.length < 2 ? `${base}-site` : base
}

async function uniqueDraftMnsName(prompt: string) {
  const base = draftSlugFromPrompt(prompt)
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const suffix = attempt ? `-${attempt + 1}` : ''
    const candidate = `${base}${suffix}`.slice(0, 100).replace(/-+$/g, '')
    const existing = await prisma.site.findUnique({ where: { mnsName: candidate } })
    if (!existing) return candidate
  }
  return `my-site-${Math.floor(1000 + Math.random() * 9000)}`
}

function generationFailureMessage(err: unknown) {
  if (err instanceof AppError) return err.message
  if (err instanceof Error) return err.message
  return 'Generation failed.'
}

// Start a new site generation and immediately create a draft record for mobile/background use.
router.post('/draft', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const history = validateHistory(req.body.history)
    if (req.body.currentHtml) throw new AppError(400, 'Draft background generation is only available for new sites.')
    const assets = validateTemplateAssets(req.body.assets)

    const prepared = await prepareGeneration(req.user!.userId, req.body, history)
    const lastPrompt = history[history.length - 1].content
    const mnsName = await uniqueDraftMnsName(lastPrompt)

    const site = await prisma.site.create({
      data: {
        userId: req.user!.userId,
        mnsName,
        generatedCode: '',
        title: 'Generating...',
        description: 'Agent is building this web-app.',
        lastPrompt,
        status: 'GENERATING',
        needsDeploy: false,
      },
    })

    res.status(202).json({ site })

    executeGeneration(req.user!.userId, prepared, history)
      .then(async (response) => {
        if (response.type !== 'site' || !response.html) {
          throw new AppError(502, response.text || 'The AI provider did not return usable site code.')
        }
        const completedSite = await prisma.site.update({
          where: { id: site.id },
          data: {
            generatedCode: applyTemplateAssets(response.html, assets),
            title: response.title || 'My Site',
            description: response.description || '',
            lastPrompt,
            status: 'DRAFT',
            needsDeploy: false,
          },
        })
        await notifySiteGenerated(req.user!.userId, completedSite.id, completedSite.title).catch(err => console.error('[push] generation notification failed:', err))
      })
      .catch(async (err) => {
        await prisma.site.update({
          where: { id: site.id },
          data: {
            status: 'GENERATION_FAILED',
            description: generationFailureMessage(err).slice(0, 500),
          },
        }).catch(() => null)
      })
  } catch (err) { next(err) }
})

// Chat with agent (new site or existing)
router.post('/', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const { history, currentHtml } = req.body
    const validatedHistory = validateHistory(history)
    const response = await generateWithCredits(req.user!.userId, req.body, validatedHistory, currentHtml)
    res.json(response)
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
    const minimumCreditCost = creditCostForModel(modelName)
    const userKeys = await resolveUserKeys(req.user!.userId)
    const usesUserKey = hasUserKeyForProvider(userKeys, selectedProvider(model))
    const estimatedCreditCost = aiCreditsForTokenEstimate(
      modelName,
      estimatedInputTokens('update', history as ChatMessage[], site.generatedCode),
      maxOutputTokensFor(reasoningEffort),
      minimumCreditCost
    )
    let remainingCredits = await ensurePlatformAiCredits(req.user!.userId, 'edit', estimatedCreditCost, usesUserKey)
    const response = await updateSiteChat(site.generatedCode, history as ChatMessage[], model, userKeys, reasoningEffort)

    if (isProviderGenerationFailure(response)) {
      throw new AppError(502, 'The AI provider did not return usable site code. No credits were charged. Please retry.')
    }

    if (!usesUserKey) {
      const finalCreditCost = aiCreditsForUsage(modelName, response.usage, minimumCreditCost)
      remainingCredits = await chargeAiCredit(
        req.user!.userId,
        'edit',
        aiChargeNote(response.type === 'site' ? `AI edit ${site.mnsName}` : `AI edit attempt ${site.mnsName}`, modelName, reasoningEffort, response.usage),
        finalCreditCost
      )
    }

    // If AI generated new HTML, save it
    if (response.type === 'site') {
      const updatedSite = await prisma.site.update({
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
      await notifySiteGenerated(req.user!.userId, updatedSite.id, updatedSite.title).catch(err => console.error('[push] edit notification failed:', err))
    }

    res.json({ ...response, credits: remainingCredits })
  } catch (err) { next(err) }
})

// Start an existing-site edit in the background so mobile users can leave the editor while the agent works.
router.post('/update-background/:siteId', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const siteId = req.params.siteId as string
    const { history } = req.body

    if (!history || !Array.isArray(history) || history.length === 0)
      throw new AppError(400, 'Message history is required.')

    const site = await prisma.site.findUnique({ where: { id: siteId } })
    if (!site) throw new AppError(404, 'Site not found.')
    if (site.userId !== req.user!.userId) throw new AppError(403, 'Access denied.')
    if (site.status === 'DEPLOYING' || site.status === 'UPDATING' || site.status === 'GENERATING')
      throw new AppError(409, 'Site is already busy. Wait for it to finish.')

    const model = resolveModel(req.body)
    const reasoningEffort = resolveReasoningEffort(req.body)
    const modelName = effectiveModel(model)
    const minimumCreditCost = creditCostForModel(modelName)
    const userKeys = await resolveUserKeys(req.user!.userId)
    const usesUserKey = hasUserKeyForProvider(userKeys, selectedProvider(model))
    const estimatedCreditCost = aiCreditsForTokenEstimate(
      modelName,
      estimatedInputTokens('update', history as ChatMessage[], site.generatedCode),
      maxOutputTokensFor(reasoningEffort),
      minimumCreditCost
    )
    await ensurePlatformAiCredits(req.user!.userId, 'edit', estimatedCreditCost, usesUserKey)

    const previousStatus = site.status === 'LIVE' ? 'LIVE' : 'DRAFT'
    const lastPrompt = history[history.length - 1].content
    const queuedSite = await prisma.site.update({
      where: { id: siteId },
      data: {
        previousCode: site.generatedCode,
        status: 'GENERATING',
        description: 'Agent is editing this web-app.',
        lastPrompt,
      },
    })

    res.status(202).json({ site: queuedSite })

    updateSiteChat(site.generatedCode, history as ChatMessage[], model, userKeys, reasoningEffort)
      .then(async (response) => {
        if (isProviderGenerationFailure(response)) {
          throw new AppError(502, 'The AI provider did not return usable site code. No credits were charged. Please retry.')
        }
        if (response.type !== 'site') {
          throw new AppError(502, response.text || 'The AI provider did not return usable site code.')
        }
        if (!usesUserKey) {
          const finalCreditCost = aiCreditsForUsage(modelName, response.usage, minimumCreditCost)
          await chargeAiCredit(
            req.user!.userId,
            'edit',
            aiChargeNote(`AI edit ${site.mnsName}`, modelName, reasoningEffort, response.usage),
            finalCreditCost
          )
        }
        const updatedSite = await prisma.site.update({
          where: { id: siteId },
          data: {
            generatedCode: response.html!,
            title: response.title!,
            description: response.description!,
            lastPrompt,
            status: previousStatus,
            needsDeploy: true,
          },
        })
        await notifySiteGenerated(req.user!.userId, updatedSite.id, updatedSite.title).catch(err => console.error('[push] background edit notification failed:', err))
      })
      .catch(async (err) => {
        await prisma.site.update({
          where: { id: siteId },
          data: {
            status: previousStatus,
            description: generationFailureMessage(err).slice(0, 500),
          },
        }).catch(() => null)
      })
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
