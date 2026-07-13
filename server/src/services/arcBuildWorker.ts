import prisma from '../lib/prisma'
import { cfg } from '../config'
import { decrypt } from '../utils/encryption'
import {
  arcWeb3Chat,
  generateArcContract,
  isAllowedModel,
  isReasoningEffort,
  updateArcSiteChat,
  validateArcDappHtml,
  type AIUsage,
  type AllowedModel,
  type ArcWeb3Category,
  type ReasoningEffort,
  type UserKeys,
} from './ai'
import { aiCreditsForUsage, minimumAiCreditCost } from './credits'
import { compileGeneratedArcContract, injectArcContractConfig, preparedArcContractForCategory } from './arcContracts'
import { notifySiteGenerated } from './pushNotifications'

const db = prisma as any
const CONTRACT_CATEGORIES = new Set<ArcWeb3Category>(['payment-links', 'split-payments', 'voting-polls', 'membership', 'games', 'custom'])
const ACTIVE_STATUSES = ['PLANNING', 'GENERATING_CONTRACT', 'VALIDATING_CONTRACT', 'GENERATING_FRONTEND']
const STALE_AFTER_MS = 45 * 60 * 1000
const ACTIVE_POLL_MS = 2_500
const IDLE_SAFETY_POLL_MS = 24 * 60 * 60 * 1000
const ERROR_BACKOFF_MS = [2_000, 5_000, 15_000, 30_000, 60_000]

let started = false
let running = false
let timer: NodeJS.Timeout | null = null
let consecutiveFailures = 0

function schedule(delay: number | null = 2500) {
  if (!started || delay === null) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(async () => {
    timer = null
    try {
      const nextDelay = await tick()
      consecutiveFailures = 0
      schedule(nextDelay)
    } catch (err: any) {
      consecutiveFailures += 1
      const delay = ERROR_BACKOFF_MS[Math.min(consecutiveFailures - 1, ERROR_BACKOFF_MS.length - 1)]
      console.warn(`[arc-worker] database unavailable; retrying in ${delay}ms: ${err?.code || err?.message || err}`)
      schedule(delay)
    }
  }, delay)
}

async function resolveUserKeys(userId: string): Promise<UserKeys> {
  const rows = await prisma.userApiKey.findMany({ where: { userId } })
  const keys: UserKeys = {}
  for (const row of rows) {
    const plain = decrypt(row.encryptedKey, row.iv)
    if (row.provider === 'openai') keys.openaiKey = plain
    if (row.provider === 'anthropic') keys.anthropicKey = plain
  }
  return keys
}

function usesUserKey(model: AllowedModel | undefined, keys: UserKeys) {
  const provider = model ? (model.startsWith('gpt-') ? 'openai' : 'anthropic') : cfg.aiProvider
  return provider === 'openai' ? !!keys.openaiKey : !!keys.anthropicKey
}

async function refundCredits(dapp: any, amount: number) {
  if (amount <= 0) return
  await prisma.$transaction([
    prisma.user.update({ where: { id: dapp.userId }, data: { credits: { increment: amount } } }),
    prisma.creditTransaction.create({
      data: {
        userId: dapp.userId,
        amount,
        type: 'arc_generate_refund',
        note: `Refund for failed ARC dApp generation: ${dapp.site.title || dapp.category}`,
      },
    }),
    db.arcDapp.update({ where: { id: dapp.id }, data: { reservedCredits: 0 } }),
  ])
}

function mergeUsage(total: AIUsage, usage?: AIUsage) {
  if (!usage) return total
  total.inputTokens += usage.inputTokens
  total.outputTokens += usage.outputTokens
  total.totalTokens += usage.totalTokens
  return total
}

async function refundUnusedReservation(dapp: any, amount: number) {
  if (amount <= 0) return
  await prisma.$transaction([
    prisma.user.update({ where: { id: dapp.userId }, data: { credits: { increment: amount } } }),
    prisma.creditTransaction.create({
      data: {
        userId: dapp.userId,
        amount,
        type: 'arc_reservation_refund',
        note: `Unused ARC build reservation refund (${dapp.id})`,
      },
    }),
    db.arcDapp.update({
      where: { id: dapp.id },
      data: { reservedCredits: { decrement: amount } },
    }),
  ])
}

async function updateBuild(id: string, status: string, buildStep: string, progress: number, extra: Record<string, any> = {}) {
  await db.arcDapp.update({
    where: { id },
    data: { status, buildStep, progress, ...extra },
  })
}

function contractContext(dapp: any, abi: any[] | null, summary?: string | null) {
  if (!abi) return ''
  return `\n\nThe contract has already been designed for this build.
Contract summary: ${summary || 'Contract-backed Arc dApp'}
Contract ABI: ${JSON.stringify(abi)}
Build the frontend against window.CTRLPOINT_ARC_CONTRACT and use only functions present in this ABI.`
}

async function processBuild(dapp: any) {
  let reservedCredits = Math.max(0, Number(dapp.reservedCredits || 0))
  const model = isAllowedModel(dapp.model) ? dapp.model : undefined
  const reasoning = isReasoningEffort(dapp.reasoningEffort) ? dapp.reasoningEffort : undefined
  const category = dapp.category as ArcWeb3Category
  const modelName = model || (cfg.aiProvider === 'openai' ? cfg.openaiModel : cfg.anthropicModel)
  const usage: AIUsage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
  let usingUserKey = false
  try {
    const keys = await resolveUserKeys(dapp.userId)
    usingUserKey = usesUserKey(model, keys)
    if (dapp.usesUserKey && !usingUserKey) {
      throw new Error('The API key selected for this build is no longer available. Add it again and retry.')
    }

    let abi: any[] | null = dapp.abiJson ? JSON.parse(dapp.abiJson) : null
    let sourceCode = dapp.sourceCode
    let contractName = dapp.contractName
    let contractSummary = dapp.contractSummary
    const preparedContract = !dapp.contractAddress ? preparedArcContractForCategory(category) : null
    const preparedAbiJson = preparedContract ? JSON.stringify(preparedContract.abi) : null
    const shouldGenerateContract = CONTRACT_CATEGORIES.has(category)
      && !dapp.contractAddress
      && (
        !dapp.sourceCode
        || Boolean(preparedContract && (
          dapp.sourceCode !== preparedContract.sourceCode
          || dapp.contractName !== preparedContract.contractName
          || dapp.abiJson !== preparedAbiJson
        ))
      )

    if (shouldGenerateContract) {
      await updateBuild(dapp.id, 'GENERATING_CONTRACT', 'Designing the smart contract', 28)
      if (preparedContract) {
        await updateBuild(dapp.id, 'VALIDATING_CONTRACT', 'Compiling and validating the contract', 52)
        abi = preparedContract.abi
        sourceCode = preparedContract.sourceCode
        contractName = preparedContract.contractName
        contractSummary = preparedContract.summary
      } else {
        let compileError = ''
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const correction = compileError
            ? `\n\nThe previous contract failed validation with this error: ${compileError}\nReturn a corrected contract that obeys every constraint.`
            : ''
          const generated = await generateArcContract(`${dapp.prompt}${correction}`, category, model, keys, reasoning)
          mergeUsage(usage, generated.usage)
          await updateBuild(dapp.id, 'VALIDATING_CONTRACT', attempt === 0 ? 'Compiling and validating the contract' : 'Validating the corrected contract', 52)
          try {
            const compiled = compileGeneratedArcContract(generated.sourceCode, generated.contractName)
            abi = compiled.abi
            sourceCode = compiled.sourceCode
            contractName = compiled.contractName
            contractSummary = generated.summary
            compileError = ''
            break
          } catch (err: any) {
            compileError = String(err?.message || 'Contract validation failed.').slice(0, 600)
            if (attempt === 1) throw err
            await updateBuild(dapp.id, 'GENERATING_CONTRACT', 'Correcting the smart contract', 38)
          }
        }
        if (!abi || !sourceCode || !contractName) throw new Error(compileError || 'Contract generation failed.')
      }
      await db.arcDapp.update({
        where: { id: dapp.id },
        data: {
          abiJson: JSON.stringify(abi),
          sourceCode,
          contractName,
          contractSummary,
          compilerVersion: 'solc-0.8.35',
        },
      })
    }

    await updateBuild(dapp.id, 'GENERATING_FRONTEND', 'Building the app interface', 72)
    const context = contractContext(dapp, abi, contractSummary)
    const isEdit = dapp.statusBeforeClaim === 'QUEUED_EDIT'
    let response: Awaited<ReturnType<typeof arcWeb3Chat>> | null = null
    let validationErrors: string[] = []
    const frontendAttempts = 3
    for (let attempt = 0; attempt < frontendAttempts; attempt += 1) {
      const correction = attempt > 0
        ? `\n\nThe previous interface failed CtrlPoint validation:\n- ${validationErrors.join('\n- ')}\nReturn a corrected complete HTML app.`
        : ''
      response = isEdit && dapp.site.generatedCode
        ? await updateArcSiteChat(
            dapp.site.generatedCode,
            [{ role: 'user', content: `${dapp.prompt}${context}${correction}` }],
            category,
            model,
            keys,
            reasoning,
          )
        : await arcWeb3Chat(
            [{ role: 'user', content: `${dapp.prompt}${context}${correction}` }],
            category,
            model,
            keys,
            reasoning,
          )
      mergeUsage(usage, response.usage)
      if (response.type !== 'site' || !response.html) {
        if (/AI provider returned incomplete HTML/i.test(response.text || '')) {
          throw new Error('The model stopped before finishing the dApp after automatic continuation. No additional full regeneration was attempted.')
        }
        if (attempt === frontendAttempts - 1) throw new Error(response.text || 'The AI provider did not return usable dApp code.')
        validationErrors = [response.text || 'Return a complete HTML dApp, not a chat response.']
        continue
      }
      validationErrors = validateArcDappHtml(response.html, category, abi || [])
      if (validationErrors.length === 0) break
      if (attempt === frontendAttempts - 1) {
        throw new Error(`Generated dApp failed validation: ${validationErrors.join(' ')}`)
      }
    }
    if (!response || response.type !== 'site' || !response.html) throw new Error('The AI provider did not return usable dApp code.')

    if (usingUserKey) {
      await refundUnusedReservation(dapp, reservedCredits)
      reservedCredits = 0
    } else {
      const calculatedCost = aiCreditsForUsage(
        modelName,
        usage,
        minimumAiCreditCost(modelName, { mode: 'arc-web3', arcCategory: category }),
      )
      const finalCost = Math.min(calculatedCost, reservedCredits)
      if (calculatedCost > reservedCredits) {
        console.warn('[arc-worker] build exceeded reservation; preserving result and capping user charge', {
          dappId: dapp.id,
          reservedCredits,
          calculatedCost,
        })
      }
      await refundUnusedReservation(dapp, reservedCredits - finalCost)
      reservedCredits = finalCost
    }
    const abiJson = abi ? JSON.stringify(abi) : null
    const generatedCode = injectArcContractConfig(response.html, {
      contractAddress: dapp.contractAddress,
      abiJson,
      explorerUrl: dapp.explorerUrl,
      contractName,
      ownerAddress: dapp.ownerAddress,
    })
    const nextSiteStatus = dapp.site.scAddress ? 'LIVE' : 'DRAFT'

    await prisma.$transaction([
      prisma.site.update({
        where: { id: dapp.siteId },
        data: {
          previousCode: dapp.site.generatedCode || null,
          generatedCode,
          title: response.title || dapp.site.title || 'Arc dApp',
          description: response.description || contractSummary || '',
          lastPrompt: dapp.prompt,
          status: nextSiteStatus,
          needsDeploy: Boolean(dapp.site.scAddress),
        },
      }),
      db.arcDapp.update({
        where: { id: dapp.id },
        data: {
          status: dapp.contractAddress ? 'CONTRACT_DEPLOYED' : abi ? 'READY_TO_DEPLOY' : 'READY',
          buildStep: 'Ready to preview',
          progress: 100,
          abiJson,
          sourceCode,
          contractName,
          contractSummary,
          reservedCredits: 0,
          errorMsg: null,
          buildFinishedAt: new Date(),
        },
      }),
    ])
    reservedCredits = 0
    await notifySiteGenerated(dapp.userId, dapp.siteId, response.title || 'Your Arc dApp').catch(() => {})
  } catch (err: any) {
    if (usingUserKey || usage.totalTokens === 0) {
      await refundCredits(dapp, reservedCredits).catch(refundErr => console.error('[arc-worker] refund failed:', refundErr))
    } else {
      const calculatedCost = aiCreditsForUsage(
        modelName,
        usage,
        minimumAiCreditCost(modelName, { mode: 'arc-web3', arcCategory: category }),
      )
      const failedUsageCost = Math.min(calculatedCost, reservedCredits)
      await refundUnusedReservation(dapp, reservedCredits - failedUsageCost)
        .catch(refundErr => console.error('[arc-worker] partial refund failed:', refundErr))
    }
    reservedCredits = 0
    const isEdit = dapp.statusBeforeClaim === 'QUEUED_EDIT'
    await prisma.site.update({
      where: { id: dapp.siteId },
      data: { status: dapp.site.scAddress ? 'LIVE' : (dapp.site.generatedCode ? 'DRAFT' : 'GENERATION_FAILED') },
    }).catch(() => {})
    await db.arcDapp.update({
      where: { id: dapp.id },
      data: {
        status: isEdit ? 'EDIT_FAILED' : 'FAILED',
        buildStep: isEdit ? 'Edit failed; previous version kept' : 'Build failed',
        reservedCredits: 0,
        errorMsg: String(err?.message || 'ARC dApp generation failed.').slice(0, 1000),
        buildFinishedAt: new Date(),
      },
    }).catch(() => {})
  }
}

async function recoverStaleBuilds() {
  await db.arcDapp.updateMany({
    where: {
      status: { in: ACTIVE_STATUSES },
      updatedAt: { lt: new Date(Date.now() - STALE_AFTER_MS) },
    },
    data: {
      status: 'QUEUED',
      buildStep: 'Resuming interrupted build',
      progress: 5,
      errorMsg: null,
    },
  })
}

async function tick(): Promise<number | null> {
  if (running) return ACTIVE_POLL_MS
  running = true
  try {
    await recoverStaleBuilds()
    const queued = await db.arcDapp.findFirst({
      where: { status: { in: ['QUEUED', 'QUEUED_EDIT'] } },
      orderBy: { updatedAt: 'asc' },
      include: { site: true },
    })
    if (!queued) return cfg.arcBuildWorkerIdlePollEnabled ? IDLE_SAFETY_POLL_MS : null
    const statusBeforeClaim = queued.status
    const claimed = await db.arcDapp.updateMany({
      where: { id: queued.id, status: statusBeforeClaim },
      data: {
        status: 'PLANNING',
        buildStep: 'Planning the dApp',
        progress: 10,
        buildStartedAt: new Date(),
        buildFinishedAt: null,
        errorMsg: null,
      },
    })
    if (claimed.count === 1) {
      await processBuild({ ...queued, statusBeforeClaim })
    }
    return 750
  } finally {
    running = false
  }
}

export function wakeArcBuildWorker() {
  schedule(0)
}

export function startArcBuildWorker() {
  if (started) return
  started = true
  console.log('[arc-worker] build worker started')
  // In low-cost idle mode, new Arc build requests wake this worker directly.
  // Boot recovery can be re-enabled for marketing/high-traffic periods.
  if (cfg.arcBuildWorkerRecoverOnBoot) schedule(1000)
}
