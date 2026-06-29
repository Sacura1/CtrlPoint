import prisma from '../lib/prisma'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const REMINDER_AFTER_MS = 2 * 24 * 60 * 60 * 1000
const REMINDER_COPY = [
  'Got an idea? Build and deploy a small website today.',
  'Need a quick page? CtrlPoint can generate and deploy one from your phone.',
  'Make something simple today: birthday page, invite, portfolio, or mini game.',
  'Your next shareable web page can be live in a few taps.',
  'Quick reminder: you can create and deploy a website without leaving your phone.',
]

type PushMessage = {
  to: string
  title: string
  body: string
  data?: Record<string, unknown>
}

function isExpoPushToken(token: string) {
  return /^ExponentPushToken\[[^\]]+\]$|^ExpoPushToken\[[^\]]+\]$/.test(token)
}

async function sendExpo(messages: PushMessage[]) {
  const valid = messages.filter((message) => isExpoPushToken(message.to))
  if (valid.length === 0) return

  for (let i = 0; i < valid.length; i += 100) {
    const chunk = valid.slice(i, i + 100)
    try {
      await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chunk.map((message) => ({
          ...message,
          sound: 'default',
          priority: 'high',
        }))),
      })
    } catch (err) {
      console.error('[push] send failed:', err)
    }
  }
}

export async function notifyUser(userId: string, title: string, body: string, data?: Record<string, unknown>) {
  const tokens = await prisma.pushToken.findMany({
    where: { userId },
    select: { token: true },
  })
  await sendExpo(tokens.map(({ token }) => ({ to: token, title, body, data })))
}

export async function notifySiteGenerated(userId: string, siteId: string, title: string) {
  const site = await prisma.site.findFirst({
    where: {
      id: siteId,
      userId,
    },
    select: {
      generatedCode: true,
      status: true,
      title: true,
    },
  })

  if (!site?.generatedCode || site.status === 'GENERATING' || site.status === 'GENERATION_FAILED') {
    console.warn('[push] skipped site_generated notification for unfinished site', {
      siteId,
      status: site?.status,
      hasCode: !!site?.generatedCode,
    })
    return
  }

  await notifyUser(userId, 'Your site is ready', `${title || 'Your web-app'} is ready to preview and deploy.`, {
    type: 'site_generated',
    siteId,
  })
}

export async function notifyDeploymentComplete(userId: string, siteId: string, title: string, url: string, isUpdate: boolean) {
  await notifyUser(
    userId,
    isUpdate ? 'Update is live' : 'Site is live',
    isUpdate ? `${title || 'Your web-app'} has been updated.` : `${title || 'Your web-app'} is now live.`,
    { type: isUpdate ? 'site_updated' : 'site_deployed', siteId, url },
  )
}

export async function sendDueBuildReminders() {
  const cutoff = new Date(Date.now() - REMINDER_AFTER_MS)
  const tokens = await prisma.pushToken.findMany({
    where: {
      OR: [{ lastReminderAt: null }, { lastReminderAt: { lt: cutoff } }],
    },
    take: 250,
    select: { id: true, token: true, userId: true },
  })
  if (tokens.length === 0) return

  const now = new Date()
  const body = REMINDER_COPY[Math.floor(Math.random() * REMINDER_COPY.length)]
  await sendExpo(tokens.map(({ token }) => ({
    to: token,
    title: 'Create something today',
    body,
    data: { type: 'build_reminder' },
  })))

  await prisma.pushToken.updateMany({
    where: { id: { in: tokens.map((token) => token.id) } },
    data: { lastReminderAt: now },
  })
}

let reminderStarted = false
let reminderTimer: NodeJS.Timeout | null = null

export function startPushReminderWorker() {
  if (reminderStarted) return
  reminderStarted = true
  const tick = async () => {
    await sendDueBuildReminders().catch((err) => console.error('[push] reminder failed:', err))
    reminderTimer = setTimeout(tick, 60 * 60 * 1000)
  }
  reminderTimer = setTimeout(tick, 10 * 60 * 1000)
}
