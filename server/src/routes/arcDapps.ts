import crypto from 'crypto'
import { Router, Response } from 'express'
import { verifyMessage } from 'viem'
import { cfg } from '../config'
import prisma from '../lib/prisma'
import { requireAuth } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { AuthRequest } from '../types'
import { MODEL_CATALOG, isAllowedModel, isReasoningEffort, type ArcWeb3Category } from '../services/ai'
import { deployGeneratedArcContract, injectArcContractConfig, preparedArcContractForCategory } from '../services/arcContracts'
import { wakeArcBuildWorker } from '../services/arcBuildWorker'
import { applyDailyFreeCredits, estimatedArcBuildCreditReservation } from '../services/credits'

const router = Router()
const db = prisma as any
const CATEGORIES = new Set<ArcWeb3Category>([
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
])
const BUSY_STATUSES = new Set(['QUEUED', 'QUEUED_EDIT', 'PLANNING', 'GENERATING_CONTRACT', 'VALIDATING_CONTRACT', 'GENERATING_FRONTEND', 'DEPLOYING_CONTRACT'])
const CONTRACT_CATEGORIES = new Set<ArcWeb3Category>(['payment-links', 'split-payments', 'voting-polls', 'membership', 'games', 'custom'])

function categoryFrom(value: unknown): ArcWeb3Category {
  if (typeof value === 'string' && CATEGORIES.has(value as ArcWeb3Category)) return value as ArcWeb3Category
  throw new AppError(400, 'Choose a supported dApp type.')
}

function selectedModel(value: unknown) {
  if (!cfg.enableModelSelection) return null
  if (!isAllowedModel(value)) {
    throw new AppError(400, 'Choose a supported AI model before starting the build.')
  }
  return value
}

function effectiveModel(model: string | null) {
  return model || (cfg.aiProvider === 'openai' ? cfg.openaiModel : cfg.anthropicModel)
}

function providerForModel(model: string) {
  return model.startsWith('gpt-') ? 'openai' : 'anthropic'
}

async function buildUsesUserKey(userId: string, model: string) {
  const key = await prisma.userApiKey.findFirst({
    where: { userId, provider: providerForModel(model) },
    select: { id: true },
  })
  return Boolean(key)
}

async function ensureReservationBalance(userId: string, cost: number, usesUserKey: boolean) {
  const user = await applyDailyFreeCredits(prisma, userId)
  if (!user) throw new AppError(404, 'User not found.')
  if (!usesUserKey && user.credits < cost) {
    throw new AppError(402, `You need ${cost} credits for this dApp build. You have ${user.credits}.`)
  }
}

function slugFromPrompt(prompt: string) {
  const words = prompt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(word => word.length > 2 && !['build', 'create', 'make', 'with', 'that', 'this', 'dapp', 'app', 'website'].includes(word))
    .slice(0, 4)
  return (words.join('-') || 'arc-app').slice(0, 42).replace(/-+$/g, '')
}

async function uniqueMnsName(prompt: string) {
  const base = slugFromPrompt(prompt)
  const candidates = Array.from({ length: 30 }, (_, attempt) => {
    const suffix = attempt === 0 ? '' : `-${attempt + 1}`
    return `${base}${suffix}`.slice(0, 100).replace(/-+$/g, '')
  })
  const existing = await prisma.site.findMany({
    where: { mnsName: { in: candidates } },
    select: { mnsName: true },
  })
  const used = new Set(existing.map(site => site.mnsName))
  const available = candidates.find(candidate => !used.has(candidate))
  if (available) return available
  return `arc-app-${crypto.randomBytes(3).toString('hex')}`
}

function ownerProofMessage(dappId: string, address: string, nonce: string) {
  return `CtrlPoint ARC contract ownership\nProject: ${dappId}\nOwner: ${address.toLowerCase()}\nNonce: ${nonce}`
}

function validateMnsName(value: string) {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/.test(value) || value.length < 2) {
    throw new AppError(400, 'Use 2-100 lowercase letters, numbers, or hyphens for the MNS name.')
  }
}

function serializeDapp(row: any, detailed = false) {
  const abi = row.abiJson ? JSON.parse(row.abiJson) : null
  const site = row.site ? {
    id: row.site.id,
    kind: row.site.kind,
    mnsName: row.site.mnsName,
    title: row.site.title,
    description: row.site.description,
    status: row.site.status,
    scAddress: row.site.scAddress,
    customDomain: row.site.customDomains?.[0]?.domain ?? null,
    needsDeploy: row.site.needsDeploy,
    generatedCode: detailed ? row.site.generatedCode : undefined,
    updatedAt: row.site.updatedAt,
  } : undefined
  return {
    id: row.id,
    siteId: row.siteId,
    userId: row.userId,
    category: row.category,
    status: row.status,
    prompt: row.prompt,
    model: row.model,
    reasoningEffort: row.reasoningEffort,
    buildStep: row.buildStep,
    progress: row.progress,
    ownerAddress: row.ownerAddress,
    contractAddress: row.contractAddress,
    deployTxHash: row.deployTxHash,
    explorerUrl: row.explorerUrl,
    contractName: row.contractName,
    contractSummary: row.contractSummary,
    compilerVersion: row.compilerVersion,
    template: row.template,
    errorMsg: row.errorMsg,
    buildStartedAt: row.buildStartedAt,
    buildFinishedAt: row.buildFinishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    abi,
    sourceCode: detailed ? row.sourceCode : undefined,
    site,
  }
}

const siteInclude = {
  customDomains: {
    where: { status: 'ACTIVE' },
    select: { domain: true },
    orderBy: [{ becameActiveAt: 'asc' }, { createdAt: 'asc' }],
    take: 1,
  },
}

async function ownDapp(dappId: string, userId: string, detailed = false) {
  const dapp = await db.arcDapp.findUnique({
    where: { id: dappId },
    include: { site: detailed ? { include: siteInclude } : { include: siteInclude } },
  })
  if (!dapp) throw new AppError(404, 'ARC project not found.')
  if (dapp.userId !== userId) throw new AppError(403, 'Access denied.')
  if (detailed && dapp.site?.generatedCode) {
    const refreshedCode = injectArcContractConfig(dapp.site.generatedCode, dapp)
    if (refreshedCode !== dapp.site.generatedCode) {
      dapp.site.generatedCode = refreshedCode
      prisma.site.update({
        where: { id: dapp.siteId },
        data: { generatedCode: refreshedCode },
      }).catch(() => {})
    }
  }
  return dapp
}

router.get('/', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const dapps = await db.arcDapp.findMany({
      where: { userId: req.user!.userId },
      orderBy: { updatedAt: 'desc' },
      include: { site: { include: siteInclude } },
    })
    res.json({ dapps: dapps.map((row: any) => serializeDapp(row)) })
  } catch (err) { next(err) }
})

router.post('/', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const prompt = String(req.body.prompt || '').trim()
    if (prompt.length < 10) throw new AppError(400, 'Describe what the dApp should do.')
    if (prompt.length > 5000) throw new AppError(400, 'Description is too long.')
    const category = categoryFrom(req.body.category)
    const model = selectedModel(req.body.model)
    const reasoningEffort = isReasoningEffort(req.body.reasoningEffort) ? req.body.reasoningEffort : null
    const mnsName = await uniqueMnsName(prompt)
    const contractBacked = CONTRACT_CATEGORIES.has(category)
    const modelName = effectiveModel(model)
    const usesUserKey = await buildUsesUserKey(req.user!.userId, modelName)
    const reservedCredits = usesUserKey ? 0 : estimatedArcBuildCreditReservation({
      model: modelName,
      category,
      prompt,
      reasoningEffort,
    })
    await ensureReservationBalance(req.user!.userId, reservedCredits, usesUserKey)

    const site = await prisma.$transaction(async tx => {
      if (reservedCredits > 0) {
        const charged = await tx.user.updateMany({
          where: { id: req.user!.userId, credits: { gte: reservedCredits } },
          data: { credits: { decrement: reservedCredits } },
        })
        if (charged.count !== 1) throw new AppError(402, `You need ${reservedCredits} credits for this dApp build.`)
      }
      const created = await tx.site.create({
        data: {
          userId: req.user!.userId,
          kind: 'ARC_DAPP',
          mnsName,
          generatedCode: '',
          title: 'Building your dApp',
          description: contractBacked
            ? 'CtrlPoint is planning the contract and interface.'
            : 'CtrlPoint is planning the interface and Arc integration.',
          lastPrompt: prompt,
          status: 'GENERATING',
          arcDapp: {
            create: {
              userId: req.user!.userId,
              category,
              prompt,
              model,
              reasoningEffort,
              reservedCredits,
              usesUserKey,
              status: 'QUEUED',
              buildStep: 'Queued for build',
              progress: 4,
            },
          },
        } as any,
        include: { arcDapp: true },
      })
      if (reservedCredits > 0) {
        await tx.creditTransaction.create({
          data: {
            userId: req.user!.userId,
            amount: -reservedCredits,
            type: 'arc_generate_reservation',
            note: `Reserved for ARC ${category} build (${created.arcDapp!.id})`,
          },
        })
      }
      return created
    })
    wakeArcBuildWorker()
    const balance = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { credits: true } })
    res.status(202).json({ dapp: serializeDapp({ ...site.arcDapp, site }, true), credits: balance?.credits })
  } catch (err) { next(err) }
})

router.get('/site/:siteId', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const site = await prisma.site.findUnique({ where: { id: req.params.siteId as string }, select: { id: true, userId: true } })
    if (!site) throw new AppError(404, 'Site not found.')
    if (site.userId !== req.user!.userId) throw new AppError(403, 'Access denied.')
    const dapp = await db.arcDapp.findUnique({
      where: { siteId: site.id },
      include: { site: { include: siteInclude } },
    })
    res.json({ dapp: dapp ? serializeDapp(dapp, true) : null })
  } catch (err) { next(err) }
})

router.get('/:dappId', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const dapp = await ownDapp(req.params.dappId as string, req.user!.userId, true)
    res.json({ dapp: serializeDapp(dapp, true) })
  } catch (err) { next(err) }
})

router.post('/:dappId/rebuild', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const dapp = await ownDapp(req.params.dappId as string, req.user!.userId, true)
    if (BUSY_STATUSES.has(dapp.status)) throw new AppError(409, 'This dApp is already being built.')
    const prompt = String(req.body.prompt || '').trim()
    if (prompt.length < 3 || prompt.length > 5000) throw new AppError(400, 'Enter a clear edit request.')
    const model = cfg.enableModelSelection
      ? selectedModel(req.body.model ?? dapp.model ?? MODEL_CATALOG[0].id)
      : dapp.model
    const reasoningEffort = isReasoningEffort(req.body.reasoningEffort) ? req.body.reasoningEffort : dapp.reasoningEffort
    const modelName = effectiveModel(model)
    const usesUserKey = await buildUsesUserKey(req.user!.userId, modelName)
    const reservedCredits = usesUserKey ? 0 : estimatedArcBuildCreditReservation({
      model: modelName,
      category: dapp.category,
      prompt,
      reasoningEffort,
      currentHtml: dapp.site.generatedCode,
      isEdit: true,
    })
    await ensureReservationBalance(req.user!.userId, reservedCredits, usesUserKey)
    const queued = await prisma.$transaction(async tx => {
      if (reservedCredits > 0) {
        const charged = await tx.user.updateMany({
          where: { id: req.user!.userId, credits: { gte: reservedCredits } },
          data: { credits: { decrement: reservedCredits } },
        })
        if (charged.count !== 1) throw new AppError(402, `You need ${reservedCredits} credits for this dApp edit.`)
      }
      const updated = await (tx as any).arcDapp.update({
        where: { id: dapp.id },
        data: {
          prompt,
          model,
          reasoningEffort,
          reservedCredits,
          usesUserKey,
          status: 'QUEUED_EDIT',
          buildStep: 'Edit queued',
          progress: 4,
          errorMsg: null,
        },
      })
      await tx.site.update({
        where: { id: dapp.siteId },
        data: { status: 'GENERATING', lastPrompt: prompt },
      })
      if (reservedCredits > 0) {
        await tx.creditTransaction.create({
          data: {
            userId: req.user!.userId,
            amount: -reservedCredits,
            type: 'arc_edit_reservation',
            note: `Reserved for ARC dApp edit (${dapp.id})`,
          },
        })
      }
      return updated
    })
    wakeArcBuildWorker()
    const balance = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { credits: true } })
    res.status(202).json({ dapp: serializeDapp({ ...queued, site: dapp.site }, true), credits: balance?.credits })
  } catch (err) { next(err) }
})

router.patch('/:dappId/site', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const dapp = await ownDapp(req.params.dappId as string, req.user!.userId, true)
    if (dapp.site.scAddress || dapp.site.status === 'LIVE') throw new AppError(409, 'A live MNS name cannot be changed here.')
    const mnsName = String(req.body.mnsName || '').trim().toLowerCase()
    validateMnsName(mnsName)
    const existing = await prisma.site.findUnique({ where: { mnsName }, select: { id: true } })
    if (existing && existing.id !== dapp.siteId) throw new AppError(409, `The name "${mnsName}" is already used by another CtrlPoint project.`)
    const site = await prisma.site.update({ where: { id: dapp.siteId }, data: { mnsName } })
    res.json({ dapp: serializeDapp({ ...dapp, site }, true) })
  } catch (err) { next(err) }
})

router.post('/:dappId/owner-nonce', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const dapp = await ownDapp(req.params.dappId as string, req.user!.userId)
    if (!dapp.sourceCode || !dapp.abiJson) throw new AppError(409, 'The contract is not ready yet.')
    if (dapp.contractAddress) throw new AppError(409, 'This contract is already deployed.')
    const ownerAddress = String(req.body.ownerAddress || '').trim()
    if (!/^0x[a-fA-F0-9]{40}$/.test(ownerAddress)) throw new AppError(400, 'Connect a valid EVM wallet.')
    const nonce = crypto.randomBytes(18).toString('hex')
    await db.arcDapp.update({
      where: { id: dapp.id },
      data: { ownerNonce: nonce, ownerAddress },
    })
    res.json({ message: ownerProofMessage(dapp.id, ownerAddress, nonce) })
  } catch (err) { next(err) }
})

router.post('/:dappId/deploy-contract', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const dapp = await ownDapp(req.params.dappId as string, req.user!.userId, true)
    if (dapp.contractAddress) {
      res.json({ dapp: serializeDapp(dapp, true) })
      return
    }
    if (!dapp.sourceCode || !dapp.contractName || !dapp.abiJson) throw new AppError(409, 'The generated contract is not ready.')
    if (dapp.status === 'DEPLOYING_CONTRACT') throw new AppError(409, 'Contract deployment is already running.')
    const approvedContract = preparedArcContractForCategory(dapp.category)
    if (approvedContract && (
      dapp.sourceCode !== approvedContract.sourceCode
      || dapp.contractName !== approvedContract.contractName
      || dapp.abiJson !== JSON.stringify(approvedContract.abi)
    )) {
      throw new AppError(409, 'This dApp uses an older contract interface. Rebuild it before publishing.')
    }

    const ownerAddress = String(req.body.ownerAddress || '').trim()
    const signature = String(req.body.signature || '').trim()
    if (!dapp.ownerNonce || dapp.ownerAddress?.toLowerCase() !== ownerAddress.toLowerCase()) {
      throw new AppError(409, 'Request a fresh wallet ownership message.')
    }
    const valid = await verifyMessage({
      address: ownerAddress as `0x${string}`,
      message: ownerProofMessage(dapp.id, ownerAddress, dapp.ownerNonce),
      signature: signature as `0x${string}`,
    }).catch(() => false)
    if (!valid) throw new AppError(401, 'Wallet signature could not be verified.')

    const claimed = await db.arcDapp.updateMany({
      where: {
        id: dapp.id,
        contractAddress: null,
        ownerNonce: dapp.ownerNonce,
        status: { not: 'DEPLOYING_CONTRACT' },
      },
      data: {
        status: 'DEPLOYING_CONTRACT',
        buildStep: 'Deploying contract to Arc Testnet',
        ownerAddress,
        ownerNonce: null,
        errorMsg: null,
      },
    })
    if (claimed.count !== 1) throw new AppError(409, 'Contract deployment was already started. Refresh the project.')

    try {
      const deploymentSource = approvedContract?.sourceCode || dapp.sourceCode
      const deploymentName = approvedContract?.contractName || dapp.contractName
      const deployed = await deployGeneratedArcContract(
        deploymentSource,
        deploymentName,
        ownerAddress,
        async deployTxHash => {
          await db.arcDapp.update({
            where: { id: dapp.id },
            data: { deployTxHash, buildStep: 'Waiting for contract confirmation' },
          })
        },
      )
      const updated = await db.arcDapp.update({
        where: { id: dapp.id },
        data: {
          status: 'CONTRACT_DEPLOYED',
          buildStep: 'Contract deployed',
          ownerAddress,
          contractAddress: deployed.contractAddress,
          deployTxHash: deployed.deployTxHash,
          explorerUrl: deployed.explorerUrl,
          abiJson: JSON.stringify(deployed.abi),
          sourceCode: deployed.sourceCode,
          contractName: deployed.contractName,
          errorMsg: null,
        },
      })
      const generatedCode = injectArcContractConfig(dapp.site.generatedCode, updated)
      const site = await prisma.site.update({
        where: { id: dapp.siteId },
        data: { generatedCode, needsDeploy: true },
      })
      res.json({ dapp: serializeDapp({ ...updated, site }, true) })
    } catch (err: any) {
      await db.arcDapp.update({
        where: { id: dapp.id },
        data: {
          status: 'CONTRACT_FAILED',
          buildStep: 'Contract deployment failed',
          errorMsg: String(err?.message || 'Contract deployment failed.').slice(0, 1000),
        },
      }).catch(() => {})
      throw err
    }
  } catch (err) { next(err) }
})

router.delete('/:dappId', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const dapp = await ownDapp(req.params.dappId as string, req.user!.userId)
    if (BUSY_STATUSES.has(dapp.status)) throw new AppError(409, 'Wait for the active build to finish before deleting this project.')
    await prisma.site.delete({ where: { id: dapp.siteId } })
    res.json({ ok: true })
  } catch (err) { next(err) }
})

export default router
