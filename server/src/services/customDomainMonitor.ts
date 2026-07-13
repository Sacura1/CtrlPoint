import prisma from '../lib/prisma'
import { cfg } from '../config'
import { checkCustomDomainReadiness } from './customDomainReadiness'

const db = prisma as any
let started = false
let running = false
let timer: NodeJS.Timeout | null = null

export async function checkCustomDomainsOnce(): Promise<number> {
  if (running) return 0
  running = true
  try {
    const activeCutoff = new Date(Date.now() - cfg.customDomainMonitorActivePollMs)
    const domains = await db.customDomain.findMany({
      where: {
        OR: [
          { status: { in: ['PENDING', 'DNS_READY', 'TLS_ISSUING', 'DEGRADED'] } },
          { status: 'ACTIVE', OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: activeCutoff } }] },
        ],
      },
      include: { site: { select: { mnsName: true } } },
      orderBy: [{ lastCheckedAt: 'asc' }, { createdAt: 'asc' }],
      take: cfg.customDomainMonitorBatchSize,
    })

    for (const domain of domains) {
      try {
        const readiness = await checkCustomDomainReadiness({
          domain: domain.domain,
          verificationToken: domain.verificationToken,
          mnsName: domain.site.mnsName,
          currentStatus: domain.status,
        })
        await db.customDomain.update({
          where: { id: domain.id },
          data: {
            status: readiness.status,
            becameActiveAt: readiness.openable && !domain.becameActiveAt ? new Date() : domain.becameActiveAt,
            lastCheckedAt: new Date(),
            errorMsg: readiness.errorMsg,
          },
        })
      } catch (err: any) {
        console.warn(`[custom-domain-monitor] ${domain.domain}: ${err?.message || err}`)
      }
    }
    return domains.length
  } finally {
    running = false
  }
}

function scheduleNext(delayMs: number | null) {
  if (!started || delayMs === null) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(async () => {
    timer = null
    try {
      const checked = await checkCustomDomainsOnce()
      scheduleNext(checked > 0 ? cfg.customDomainMonitorPollMs : (cfg.customDomainMonitorIdlePollEnabled ? cfg.customDomainMonitorIdlePollMs : null))
    } catch (err: any) {
      console.warn('[custom-domain-monitor] tick failed:', err?.message || err)
      scheduleNext(cfg.customDomainMonitorIdlePollEnabled ? cfg.customDomainMonitorIdlePollMs : null)
    }
  }, Math.max(30_000, delayMs))
}

export function wakeCustomDomainMonitor() {
  scheduleNext(0)
}

export function startCustomDomainMonitor() {
  if (started) return
  started = true
  scheduleNext(cfg.customDomainMonitorIdlePollEnabled ? cfg.customDomainMonitorIdlePollMs : null)
}
