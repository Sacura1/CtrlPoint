import { Request, Response, NextFunction } from 'express'
import { databaseErrorCode, isTransientDatabaseError } from '../lib/prisma'
import { recordServerError } from '../services/observability'
import { AuthRequest } from '../types'

export class AppError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message)
    this.name = 'AppError'
  }
}

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message })
    return
  }

  if (isTransientDatabaseError(err)) {
    const code = databaseErrorCode(err)
    console.warn(`[database] request failed after retries (${code}): ${req.method} ${req.path}`)
    res.setHeader('Retry-After', '5')
    res.status(503).json({ error: 'The database is temporarily unavailable. Please retry in a few seconds.' })
    return
  }

  console.error('[Unhandled Error]', err)
  recordServerError({
    message: err.message || 'Unhandled error',
    stack: err.stack,
    path: req.path,
    method: req.method,
    userId: (req as AuthRequest).user?.userId,
    statusCode: 500,
  }).catch(() => {})
  res.status(500).json({ error: 'Internal server error' })
}
