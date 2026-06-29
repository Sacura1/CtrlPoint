import { Router, Response } from 'express'
import prisma from '../lib/prisma'
import { requireAdmin } from '../middleware/auth'
import { AuthRequest } from '../types'
import { checkProviderHealth } from '../services/providerMonitor'

const router = Router()
const LOCAL_GUEST_EMAIL_SUFFIX = '@ctrlpoint.local'

const realUserWhere = {
  NOT: { email: { endsWith: LOCAL_GUEST_EMAIL_SUFFIX } },
}

function daysAgo(days: number) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d
}

async function countDistinctRealLoginsSince(date: Date) {
  const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(DISTINCT e."userId")::bigint AS count
    FROM "UserLoginEvent" e
    JOIN "User" u ON u."id" = e."userId"
    WHERE e."createdAt" >= ${date}
      AND u."email" NOT LIKE ${`%${LOCAL_GUEST_EMAIL_SUFFIX}`}
  `
  return Number(rows[0]?.count ?? 0)
}

router.get('/status', requireAdmin, async (_req: AuthRequest, res: Response, next) => {
  try {
    const since14 = daysAgo(13)
    const since24h = daysAgo(1)
    const since30 = daysAgo(30)

    const [
      totalUsers,
      localGuestUsers,
      totalGenerated,
      totalLiveSites,
      totalCompleteDeployments,
      connectedRepos,
      openTickets,
      totalTickets,
      dau,
      mau,
      loginRows,
      generatedRows,
      deployedRows,
      recentTickets,
      recentErrors,
      failedDeployments,
      providerHealth,
      topCreditOwners,
    ] = await Promise.all([
      prisma.user.count({ where: realUserWhere }),
      prisma.user.count({ where: { email: { endsWith: LOCAL_GUEST_EMAIL_SUFFIX } } }),
      prisma.site.count(),
      prisma.site.count({ where: { OR: [{ status: 'LIVE' }, { scAddress: { not: null } }] } }),
      prisma.deployment.count({ where: { status: 'COMPLETE' } }),
      prisma.gitHubConnection.count(),
      prisma.supportTicket.count({ where: { status: 'OPEN' } }),
      prisma.supportTicket.count(),
      countDistinctRealLoginsSince(since24h),
      countDistinctRealLoginsSince(since30),
      prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
        SELECT date_trunc('day', e."createdAt") AS day, COUNT(*)::bigint AS count
        FROM "UserLoginEvent" e
        JOIN "User" u ON u."id" = e."userId"
        WHERE e."createdAt" >= ${since14}
          AND u."email" NOT LIKE ${`%${LOCAL_GUEST_EMAIL_SUFFIX}`}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
        SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS count
        FROM "Site"
        WHERE "createdAt" >= ${since14}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      prisma.$queryRaw<Array<{ day: Date; count: bigint }>>`
        SELECT date_trunc('day', "updatedAt") AS day, COUNT(*)::bigint AS count
        FROM "Deployment"
        WHERE "status" = 'COMPLETE' AND "updatedAt" >= ${since14}
        GROUP BY 1
        ORDER BY 1 ASC
      `,
      prisma.supportTicket.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, email: true, title: true, body: true, status: true, createdAt: true, userId: true },
      }),
      prisma.serverErrorLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: { id: true, message: true, path: true, method: true, statusCode: true, createdAt: true, userId: true },
      }),
      prisma.deployment.findMany({
        where: { status: 'FAILED' },
        orderBy: { updatedAt: 'desc' },
        take: 10,
        select: { id: true, siteId: true, source: true, errorMsg: true, updatedAt: true },
      }),
      checkProviderHealth().catch(err => ({ ok: false, url: '', error: err.message, consecutiveFailures: 1 })),
      prisma.user.findMany({
        where: realUserWhere,
        orderBy: [{ credits: 'desc' }, { createdAt: 'asc' }],
        take: 10,
        select: {
          id: true,
          email: true,
          credits: true,
          createdAt: true,
          _count: {
            select: {
              sites: true,
              githubConnections: true,
            },
          },
        },
      }),
    ])

    await prisma.$queryRaw`SELECT 1`

    const mapRows = (rows: Array<{ day: Date; count: bigint }>) => rows.map(row => ({
      day: row.day.toISOString().slice(0, 10),
      count: Number(row.count),
    }))

    res.json({
      totals: {
        users: totalUsers,
        localGuestUsers,
        generatedSites: totalGenerated,
        liveSites: totalLiveSites,
        completedDeployments: totalCompleteDeployments,
        connectedRepos,
        supportTickets: totalTickets,
        openTickets,
        dau,
        mau,
      },
      daily: {
        logins: mapRows(loginRows),
        generatedSites: mapRows(generatedRows),
        deployments: mapRows(deployedRows),
      },
      endpoints: [
        { name: 'API', ok: true, detail: 'Server responding' },
        { name: 'Database', ok: true, detail: 'Query OK' },
        { name: 'DeWeb provider', ok: providerHealth.ok, detail: providerHealth.ok ? `${'latencyMs' in providerHealth ? providerHealth.latencyMs ?? 0 : 0}ms` : providerHealth.error || 'Provider check failed' },
      ],
      topCreditOwners: topCreditOwners.map(user => ({
        id: user.id,
        email: user.email,
        credits: user.credits,
        sites: user._count.sites,
        connectedRepos: user._count.githubConnections,
        createdAt: user.createdAt,
      })),
      recentTickets,
      recentErrors,
      failedDeployments,
    })
  } catch (err) { next(err) }
})

router.patch('/tickets/:ticketId', requireAdmin, async (req: AuthRequest, res: Response, next) => {
  try {
    const status = String(req.body.status || '').toUpperCase()
    if (!['OPEN', 'CLOSED'].includes(status)) {
      res.status(400).json({ error: 'Invalid ticket status' })
      return
    }
    const ticket = await prisma.supportTicket.update({
      where: { id: req.params.ticketId as string },
      data: { status },
    })
    res.json({ ticket })
  } catch (err) { next(err) }
})

export default router
