import { Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { cfg } from '../config'
import { AuthRequest, AuthPayload } from '../types'

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
