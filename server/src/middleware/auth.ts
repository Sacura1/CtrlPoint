import { Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'
import { cfg } from '../config'
import { AuthRequest, AuthPayload, AgentAuthRequest } from '../types'
import { hashAgentKey, readAgentKeyHeader } from '../services/agentKeys'

const prisma = new PrismaClient()

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '')

  if (!token) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }

  try {
    const payload = jwt.verify(token, cfg.jwtSecret) as AuthPayload
    req.user = payload
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, cfg.jwtSecret, { expiresIn: cfg.jwtExpiresIn as any })
}

export async function requireAgentAuth(req: AgentAuthRequest, res: Response, next: NextFunction) {
  const key = readAgentKeyHeader(req)
  if (!key) {
    res.status(401).json({ error: 'Agent API key required' })
    return
  }

  try {
    const keyHash = hashAgentKey(key)
    const record = await prisma.agentApiKey.findFirst({
      where: { keyHash, revokedAt: null },
      include: { user: { select: { id: true, email: true } } },
    })

    if (!record) {
      res.status(401).json({ error: 'Invalid or revoked agent API key' })
      return
    }

    req.user = { userId: record.userId, email: record.user.email, agentKeyId: record.id }
    await prisma.agentApiKey.update({
      where: { id: record.id },
      data: { lastUsedAt: new Date() },
    }).catch(() => {})
    next()
  } catch (err) {
    next(err)
  }
}
