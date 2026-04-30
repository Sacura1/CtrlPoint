import { Router, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { requireAuth } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { AuthRequest } from '../types'
import { chat, updateSiteChat, ChatMessage, isAllowedModel, AllowedModel, UserKeys } from '../services/ai'
import { cfg } from '../config'
import { decrypt } from '../utils/encryption'

const router = Router()
const prisma = new PrismaClient()

function resolveModel(body: any): AllowedModel | undefined {
  if (!cfg.enableModelSelection) return undefined
  const m = body?.model
  return isAllowedModel(m) ? m : undefined
}

async function resolveUserKeys(userId: string): Promise<UserKeys> {
  const rows = await prisma.userApiKey.findMany({ where: { userId } })
  const keys: UserKeys = {}
  for (const row of rows) {
    try {
      const plain = decrypt(row.encryptedKey, row.iv)
      if (row.provider === 'openai') keys.openaiKey = plain
      else if (row.provider === 'anthropic') keys.anthropicKey = plain
    } catch {}
  }
  return keys
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

    const userKeys = await resolveUserKeys(req.user!.userId)
    // If caller provides existing HTML (e.g. uploaded file), edit it rather than generate from scratch
    const response = currentHtml
      ? await updateSiteChat(currentHtml, history as ChatMessage[], resolveModel(req.body), userKeys)
      : await chat(history as ChatMessage[], resolveModel(req.body), userKeys)
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

    const userKeys = await resolveUserKeys(req.user!.userId)
    const response = await updateSiteChat(site.generatedCode, history as ChatMessage[], resolveModel(req.body), userKeys)

    // If AI generated new HTML, save it
    if (response.type === 'site') {
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

    res.json(response)
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
