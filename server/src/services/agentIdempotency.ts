import crypto from 'crypto'
import prisma from '../lib/prisma'
import { AgentAuthRequest } from '../types'
import { AppError } from '../middleware/errorHandler'


export interface AgentRequestSnapshot {
  route: string
  userId: string
  body: Record<string, unknown>
  file?: {
    originalname: string
    mimetype: string
    size: number
    sha256: string
  }
}

export interface AgentRequestRecord {
  id: string
  idempotencyKey: string
  requestHash: string
}

export function readIdempotencyKey(req: AgentAuthRequest): string | null {
  const value = req.headers['idempotency-key'] || req.headers['x-idempotency-key']
  const raw = Array.isArray(value) ? value[0] : value
  if (!raw) return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (trimmed.length > 160) throw new AppError(400, 'Idempotency-Key must be 160 characters or fewer.')
  if (!/^[A-Za-z0-9._:-]+$/.test(trimmed)) {
    throw new AppError(400, 'Idempotency-Key can only contain letters, numbers, ".", "_", ":", and "-".')
  }
  return trimmed
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => typeof item !== 'undefined')
    .sort(([a], [b]) => a.localeCompare(b))
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`
}

export function requestHash(snapshot: AgentRequestSnapshot): string {
  return crypto.createHash('sha256').update(stableStringify(snapshot)).digest('hex')
}

export function snapshotAgentRequest(req: AgentAuthRequest, route: string): AgentRequestSnapshot {
  const body = { ...(req.body || {}) }
  const file = req.file
  return {
    route,
    userId: req.user!.userId,
    body,
    file: file ? {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      sha256: crypto.createHash('sha256').update(file.buffer).digest('hex'),
    } : undefined,
  }
}

export async function beginAgentRequest(req: AgentAuthRequest, route: string): Promise<
  | { replay: true; statusCode: number; response: unknown }
  | { replay: false; record: AgentRequestRecord }
> {
  const idempotencyKey = readIdempotencyKey(req)
  const snapshot = snapshotAgentRequest(req, route)
  const hash = requestHash(snapshot)

  if (!idempotencyKey) {
    return {
      replay: false,
      record: { id: '', idempotencyKey: '', requestHash: hash },
    }
  }

  const existing = await prisma.agentRequest.findUnique({
    where: { userId_idempotencyKey: { userId: req.user!.userId, idempotencyKey } },
  })

  if (existing) {
    if (existing.requestHash !== hash) {
      throw new AppError(409, 'Idempotency-Key was already used for a different deploy request.')
    }
    if (existing.responseJson) {
      return { replay: true, statusCode: existing.status === 'COMPLETE' ? 200 : 202, response: JSON.parse(existing.responseJson) }
    }
    if (existing.errorJson) {
      const parsed = JSON.parse(existing.errorJson)
      throw new AppError(parsed.statusCode || 409, parsed.error || 'Previous idempotent request failed.')
    }
    return {
      replay: true,
      statusCode: 202,
      response: {
        deploymentId: existing.deploymentId,
        siteId: existing.siteId,
        status: 'IN_PROGRESS',
        statusUrl: existing.deploymentId ? `/api/agent/deployments/${existing.deploymentId}` : null,
        message: 'Idempotent request is already in progress.',
      },
    }
  }

  const record = await prisma.agentRequest.create({
    data: {
      userId: req.user!.userId,
      idempotencyKey,
      requestHash: hash,
      paymentPayer: req.payment?.payer,
      paymentNetwork: req.payment?.network,
      paymentAmount: req.payment?.amount,
      paymentTx: req.payment?.transaction,
    },
    select: { id: true, idempotencyKey: true, requestHash: true },
  })

  return { replay: false, record }
}

export async function completeAgentRequest(record: AgentRequestRecord, response: unknown, status: string, siteId?: string, deploymentId?: string) {
  if (!record.id) return
  await prisma.agentRequest.update({
    where: { id: record.id },
    data: {
      status,
      responseJson: JSON.stringify(response),
      siteId,
      deploymentId,
    },
  }).catch(() => {})
}

export async function failAgentRequest(record: AgentRequestRecord, err: unknown) {
  if (!record.id) return
  const statusCode = err instanceof AppError ? err.statusCode : 500
  const error = err instanceof Error ? err.message : 'Unknown error'
  await prisma.agentRequest.update({
    where: { id: record.id },
    data: {
      status: 'FAILED',
      errorJson: JSON.stringify({ statusCode, error }),
    },
  }).catch(() => {})
}
