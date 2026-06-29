import { Router, Response } from 'express'
import crypto from 'crypto'
import dns from 'dns/promises'
import prisma from '../lib/prisma'
import { requireAuth } from '../middleware/auth'
import { AppError } from '../middleware/errorHandler'
import { AuthRequest } from '../types'
import { cfg } from '../config'
import {
  ROUTABLE_CUSTOM_DOMAIN_STATUSES,
  checkCustomDomainReadiness,
  targetHostForSite as customDomainTargetHostForSite,
  verificationName as customDomainVerificationName,
  verificationValue as customDomainVerificationValue,
} from '../services/customDomainReadiness'
import { wakeCustomDomainMonitor } from '../services/customDomainMonitor'

const router = Router()
const db = prisma as any
const FREE_CUSTOM_DOMAINS_PER_USER = 2
const EXTRA_CUSTOM_DOMAIN_CREDITS = 5
const PENDING_REFUND_WINDOW_MS = 10 * 60 * 1000
const PUBLIC_DNS_RESOLVERS = ['1.1.1.1', '8.8.8.8', '9.9.9.9']
const ROUTE_CACHE_STALE_MS = 24 * 60 * 60 * 1000

type RouteCacheEntry = {
  expiresAt: number
  staleUntil: number
  resolved?: {
    siteId: string
    mnsName: string
    scAddress: string | null
  }
}

const routeCache = new Map<string, RouteCacheEntry>()

function getFreshRouteCache(domain: string) {
  const cached = routeCache.get(domain)
  return cached && cached.expiresAt > Date.now() ? cached : null
}

function getStaleRouteCache(domain: string) {
  const cached = routeCache.get(domain)
  return cached && cached.staleUntil > Date.now() ? cached : null
}

function cacheRoutableDomain(domain: string, row: any) {
  routeCache.set(domain, {
    expiresAt: Date.now() + cfg.customDomainRouteCacheMs,
    staleUntil: Date.now() + ROUTE_CACHE_STALE_MS,
    resolved: row.site ? {
      siteId: row.site.id,
      mnsName: row.site.mnsName,
      scAddress: row.site.scAddress,
    } : undefined,
  })
}

function normalizeDomain(raw: string): string {
  const value = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '')

  if (!value || value.length > 253) throw new AppError(400, 'Enter a valid domain.')
  if (value.includes('*') || value.includes('_')) throw new AppError(400, 'Wildcard and underscore domains are not supported.')
  const labels = value.split('.')
  if (labels.length < 2) throw new AppError(400, 'Enter a full domain, for example app.example.com.')
  for (const label of labels) {
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) {
      throw new AppError(400, 'Domain labels may contain only letters, numbers, and hyphens.')
    }
  }
  return value
}

function tryRequestDomain(req: any): string | null {
  try {
    return normalizeDomain(String(req.query.domain || req.hostname || ''))
  } catch {
    return null
  }
}

function verificationName(domain: string) {
  return `_ctrlpoint.${domain}`
}

function verificationValue(token: string) {
  return `ctrlpoint-verify=${token}`
}

function targetHostForSite(mnsName: string) {
  return `${mnsName}.${cfg.mnsPublicDomain}`
}

function dnsPendingMessage(recordType: string, recordName: string) {
  return `${recordType} record was not found at ${recordName}. If you just added it, DNS can take a few minutes. If it has been longer, make sure the record was added in the domain's active DNS provider.`
}

function serialize(domain: any) {
  return {
    id: domain.id,
    siteId: domain.siteId,
    domain: domain.domain,
    status: domain.status,
    creditCost: domain.creditCost ?? 0,
    errorMsg: domain.errorMsg,
    createdAt: domain.createdAt,
    updatedAt: domain.updatedAt,
    lastCheckedAt: domain.lastCheckedAt,
    verification: {
      type: 'TXT',
      name: customDomainVerificationName(domain.domain),
      value: customDomainVerificationValue(domain.verificationToken),
    },
    routing: {
      type: 'CNAME',
      name: domain.domain,
      value: customDomainTargetHostForSite(domain.site.mnsName),
      apexARecords: cfg.customDomainARecords,
    },
  }
}

async function assertOwnsSite(siteId: string, userId: string) {
  const site = await prisma.site.findUnique({ where: { id: siteId } })
  if (!site) throw new AppError(404, 'Site not found.')
  if (site.userId !== userId) throw new AppError(403, 'Access denied.')
  if (site.status !== 'LIVE' || !site.scAddress) throw new AppError(409, 'Custom domains can only be added to live deployments.')
  return site
}

async function checkTxt(domain: string, token: string): Promise<boolean> {
  try {
    const records = await dns.resolveTxt(verificationName(domain))
    const values = records.map(parts => parts.join(''))
    return values.includes(verificationValue(token)) || values.includes(token)
  } catch {
    return false
  }
}

async function checkRouting(domain: string, expectedTarget: string): Promise<{ ok: boolean; detail: string }> {
  const normalizedExpected = expectedTarget.replace(/\.$/, '').toLowerCase()
  try {
    const cname = await dns.resolveCname(domain)
    const normalized = cname.map(v => v.replace(/\.$/, '').toLowerCase())
    if (normalized.includes(normalizedExpected) || normalized.includes(cfg.customDomainCnameTarget)) {
      return { ok: true, detail: `CNAME points to ${normalized[0]}.` }
    }
    return { ok: false, detail: `CNAME found, but it points to ${normalized.join(', ')}.` }
  } catch {
    if (cfg.customDomainARecords.length === 0) return { ok: true, detail: 'TXT ownership verified. Routing target was not enforced because CUSTOM_DOMAIN_A_RECORDS is not configured.' }
    try {
      const records = await dns.resolve4(domain)
      const ok = records.some(ip => cfg.customDomainARecords.includes(ip))
      return ok
        ? { ok: true, detail: `A record points to ${records.join(', ')}.` }
        : { ok: false, detail: `A record points to ${records.join(', ')}, not the configured provider IP.` }
    } catch {
      return { ok: false, detail: `Point ${domain} to ${expectedTarget} with CNAME, or configure apex A records.` }
    }
  }
}

async function checkRoutingWithResolver(domain: string, expectedTarget: string, server: string): Promise<boolean> {
  const resolver = new dns.Resolver()
  resolver.setServers([server])
  const normalizedExpected = expectedTarget.replace(/\.$/, '').toLowerCase()
  try {
    const cname = await resolver.resolveCname(domain)
    const normalized = cname.map(v => v.replace(/\.$/, '').toLowerCase())
    return normalized.includes(normalizedExpected) || normalized.includes(cfg.customDomainCnameTarget)
  } catch {
    if (cfg.customDomainARecords.length === 0) return true
    try {
      const records = await resolver.resolve4(domain)
      return records.some(ip => cfg.customDomainARecords.includes(ip))
    } catch {
      return false
    }
  }
}

async function checkPublicRouting(domain: string, expectedTarget: string) {
  const checks = await Promise.all(PUBLIC_DNS_RESOLVERS.map(async server => ({
    server,
    ok: await checkRoutingWithResolver(domain, expectedTarget, server),
  })))
  const passed = checks.filter(check => check.ok).length
  const ok = passed === checks.length
  return {
    ok,
    checks,
    detail: ok
      ? 'DNS is visible on major public resolvers.'
      : `DNS is correct but still propagating on ${checks.length - passed} public resolver${checks.length - passed === 1 ? '' : 's'}.`,
  }
}

router.get('/', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const domains = await db.customDomain.findMany({
      where: { site: { userId: req.user!.userId } },
      include: { site: { select: { mnsName: true } } },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ domains: domains.map(serialize) })
  } catch (err) { next(err) }
})

router.get('/allow', async (req, res, next) => {
  try {
    const domain = normalizeDomain(String(req.query.domain || req.hostname || ''))
    const cached = getFreshRouteCache(domain)
    if (cached) {
      res.json({ ok: true })
      return
    }

    const match = await db.customDomain.findFirst({ where: { domain, status: { in: ROUTABLE_CUSTOM_DOMAIN_STATUSES } }, select: { id: true } })
    if (!match) throw new AppError(404, 'Domain is not allowed.')
    cacheRoutableDomain(domain, match)
    res.json({ ok: true })
  } catch (err) {
    const domain = tryRequestDomain(req)
    if (!(err instanceof AppError) && domain && getStaleRouteCache(domain)) {
      res.json({ ok: true })
      return
    }
    next(err)
  }
})

router.get('/resolve', async (req, res, next) => {
  try {
    const domain = normalizeDomain(String(req.query.domain || req.hostname || ''))
    const cached = getFreshRouteCache(domain)
    if (cached?.resolved) {
      res.json({
        domain,
        siteId: cached.resolved.siteId,
        mnsName: cached.resolved.mnsName,
        targetHost: customDomainTargetHostForSite(cached.resolved.mnsName),
        scAddress: cached.resolved.scAddress,
      })
      return
    }

    const match = await db.customDomain.findFirst({
      where: { domain, status: { in: ROUTABLE_CUSTOM_DOMAIN_STATUSES } },
      include: { site: { select: { id: true, mnsName: true, scAddress: true } } },
    })
    if (!match) throw new AppError(404, 'Domain is not mapped.')
    cacheRoutableDomain(domain, match)
    res.json({
      domain,
      siteId: match.site.id,
      mnsName: match.site.mnsName,
      targetHost: customDomainTargetHostForSite(match.site.mnsName),
      scAddress: match.site.scAddress,
    })
  } catch (err) {
    const domain = tryRequestDomain(req)
    const cached = domain ? getStaleRouteCache(domain) : null
    if (!(err instanceof AppError) && cached?.resolved) {
      res.json({
        domain,
        siteId: cached.resolved.siteId,
        mnsName: cached.resolved.mnsName,
        targetHost: customDomainTargetHostForSite(cached.resolved.mnsName),
        scAddress: cached.resolved.scAddress,
      })
      return
    }
    next(err)
  }
})

router.get('/site/:siteId', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    await assertOwnsSite(req.params.siteId as string, req.user!.userId)
    const domains = await db.customDomain.findMany({
      where: { siteId: req.params.siteId as string },
      include: { site: { select: { mnsName: true } } },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ domains: domains.map(serialize) })
  } catch (err) { next(err) }
})

router.post('/site/:siteId', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const site = await assertOwnsSite(req.params.siteId as string, req.user!.userId)
    const domain = normalizeDomain(req.body.domain)
    const token = crypto.randomBytes(18).toString('hex')
    let creditsCharged = 0
    let userCredits: number | undefined

    const created = await prisma.$transaction(async tx => {
      const txDb = tx as any
      const existingCount = await txDb.customDomain.count({
        where: { site: { userId: req.user!.userId } },
      })
      const creditCost = existingCount >= FREE_CUSTOM_DOMAINS_PER_USER ? EXTRA_CUSTOM_DOMAIN_CREDITS : 0

      if (creditCost > 0) {
        const charged = await tx.user.updateMany({
          where: { id: req.user!.userId, credits: { gte: creditCost } },
          data: { credits: { decrement: creditCost } },
        })
        if (charged.count !== 1) {
          const current = await tx.user.findUnique({ where: { id: req.user!.userId }, select: { credits: true } })
          throw new AppError(402, `You need ${creditCost} credits to add another custom domain. You have ${current?.credits ?? 0}.`)
        }
        await tx.creditTransaction.create({
          data: {
            userId: req.user!.userId,
            amount: -creditCost,
            type: 'custom_domain',
            note: `Custom domain ${domain}`,
          },
        })
      }

      const createdDomain = await txDb.customDomain.create({
        data: {
          siteId: site.id,
          domain,
          verificationToken: token,
          creditCost,
        },
        include: { site: { select: { mnsName: true } } },
      })
      creditsCharged = creditCost
      userCredits = (await tx.user.findUnique({ where: { id: req.user!.userId }, select: { credits: true } }))?.credits
      return createdDomain
    }).catch((err: any) => {
      if (err instanceof AppError) throw err
      if (err?.code === 'P2002') throw new AppError(409, 'That domain is already connected to another web-app.')
      throw err
    })

    wakeCustomDomainMonitor()
    res.status(201).json({ domain: serialize(created), creditsCharged, userCredits })
  } catch (err) { next(err) }
})

router.post('/:domainId/verify', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const existing = await db.customDomain.findUnique({
      where: { id: req.params.domainId as string },
      include: { site: { select: { userId: true, mnsName: true } } },
    })
    if (!existing) throw new AppError(404, 'Custom domain not found.')
    if (existing.site.userId !== req.user!.userId) throw new AppError(403, 'Access denied.')

    const readiness = await checkCustomDomainReadiness({
      domain: existing.domain,
      verificationToken: existing.verificationToken,
      mnsName: existing.site.mnsName,
      currentStatus: existing.status,
    })
    const updated = await db.customDomain.update({
      where: { id: existing.id },
      data: {
        status: readiness.status,
        becameActiveAt: readiness.openable && !existing.becameActiveAt ? new Date() : existing.becameActiveAt,
        lastCheckedAt: new Date(),
        errorMsg: readiness.errorMsg,
      },
      include: { site: { select: { mnsName: true } } },
    })
    res.json({
      domain: serialize(updated),
      verified: readiness.verified,
      openable: readiness.openable,
      checks: readiness.checks,
    })
  } catch (err) { next(err) }
})

router.delete('/:domainId', requireAuth, async (req: AuthRequest, res: Response, next) => {
  try {
    const existing = await db.customDomain.findUnique({
      where: { id: req.params.domainId as string },
      include: { site: { select: { userId: true } } },
    })
    if (!existing) throw new AppError(404, 'Custom domain not found.')
    if (existing.site.userId !== req.user!.userId) throw new AppError(403, 'Access denied.')
    let refundedCredits = 0
    let userCredits: number | undefined
    const refundable = (existing.creditCost ?? 0) > 0
      && existing.status !== 'ACTIVE'
      && !existing.becameActiveAt
      && Date.now() - new Date(existing.createdAt).getTime() <= PENDING_REFUND_WINDOW_MS

    await prisma.$transaction(async tx => {
      const txDb = tx as any
      await txDb.customDomain.delete({ where: { id: existing.id } })
      if (refundable) {
        refundedCredits = existing.creditCost
        await tx.user.update({
          where: { id: req.user!.userId },
          data: { credits: { increment: refundedCredits } },
        })
        await tx.creditTransaction.create({
          data: {
            userId: req.user!.userId,
            amount: refundedCredits,
            type: 'custom_domain_refund',
            note: `Refund for unverified custom domain ${existing.domain}`,
          },
        })
      }
      userCredits = (await tx.user.findUnique({ where: { id: req.user!.userId }, select: { credits: true } }))?.credits
    })
    res.json({ ok: true, refundedCredits, userCredits })
  } catch (err) { next(err) }
})

export default router
