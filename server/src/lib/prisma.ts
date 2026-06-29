import path from 'path'
import dotenv from 'dotenv'
import { PrismaClient } from '@prisma/client'

dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: false })

const TRANSIENT_DATABASE_CODES = new Set(['P1001', 'P1002', 'P2024'])
const RETRY_DELAYS_MS = [750, 2_000, 5_000]

function runtimeDatabaseUrl(rawUrl: string | undefined): string | undefined {
  if (!rawUrl) return rawUrl
  try {
    const url = new URL(rawUrl)
    if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', '5')
    if (!url.searchParams.has('pool_timeout')) url.searchParams.set('pool_timeout', '30')
    if (!url.searchParams.has('connect_timeout')) url.searchParams.set('connect_timeout', '20')
    return url.toString()
  } catch {
    return rawUrl
  }
}

export function databaseErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined
  const candidate = error as { code?: unknown; errorCode?: unknown; message?: unknown }
  if (typeof candidate.code === 'string') return candidate.code
  if (typeof candidate.errorCode === 'string') return candidate.errorCode
  if (typeof candidate.message === 'string') {
    return candidate.message.match(/\bP(?:1001|1002|2024)\b/)?.[0]
  }
  return undefined
}

export function isTransientDatabaseError(error: unknown): boolean {
  const code = databaseErrorCode(error)
  return !!code && TRANSIENT_DATABASE_CODES.has(code)
}

function wait(delayMs: number) {
  return new Promise(resolve => setTimeout(resolve, delayMs))
}

async function withDatabaseRetry<T>(
  operation: () => Promise<T>,
  label: string,
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      const code = databaseErrorCode(error)
      const delay = RETRY_DELAYS_MS[attempt]
      if (!isTransientDatabaseError(error) || delay === undefined) throw error
      console.warn(`[database] ${label} temporarily unavailable (${code}); retrying in ${delay}ms`)
      await wait(delay)
    }
  }
}

function createPrismaClient(): PrismaClient {
  const databaseUrl = runtimeDatabaseUrl(process.env.DATABASE_URL)
  const base = new PrismaClient({
    ...(databaseUrl ? { datasources: { db: { url: databaseUrl } } } : {}),
    log: process.env.PRISMA_QUERY_LOG === 'true' ? ['query', 'warn'] : ['warn'],
  })

  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          return withDatabaseRetry(
            () => query(args),
            `${model}.${operation}`,
          )
        },
      },
    },
  }) as unknown as PrismaClient
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient
}

const prisma =
  globalForPrisma.prisma ??
  createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

export default prisma
