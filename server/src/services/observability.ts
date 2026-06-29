import prisma from '../lib/prisma'
import { cfg } from '../config'

let lastAlertAt = 0

export async function recordLogin(userId: string, method: string) {
  await prisma.userLoginEvent.create({ data: { userId, method } }).catch(() => {})
}

export async function recordServerError(params: {
  message: string
  stack?: string
  path?: string
  method?: string
  userId?: string
  statusCode?: number
}) {
  const row = await prisma.serverErrorLog.create({
    data: {
      message: params.message.slice(0, 1000),
      stack: params.stack?.slice(0, 8000),
      path: params.path,
      method: params.method,
      userId: params.userId,
      statusCode: params.statusCode,
    },
  }).catch(() => null)

  notifyAdmin(params).catch(() => {})
  return row
}

async function notifyAdmin(params: { message: string; path?: string; method?: string; statusCode?: number }) {
  if (!cfg.adminAlertWebhookUrl) return
  const now = Date.now()
  if (now - lastAlertAt < 60_000) return
  lastAlertAt = now

  await fetch(cfg.adminAlertWebhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `CtrlPoint error: ${params.statusCode ?? 500} ${params.method ?? ''} ${params.path ?? ''}\n${params.message}`.slice(0, 1800),
      content: `CtrlPoint error: ${params.statusCode ?? 500} ${params.method ?? ''} ${params.path ?? ''}\n${params.message}`.slice(0, 1800),
    }),
  })
}
