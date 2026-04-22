import { Request } from 'express'

export interface AuthPayload {
  userId: string
  email: string
}

export interface AuthRequest extends Request {
  user?: AuthPayload
}

export type SiteStatus = 'DRAFT' | 'DEPLOYING' | 'LIVE' | 'ERROR' | 'UPDATING'
export type DeploymentStatus = 'QUEUED' | 'UPLOADING' | 'MNS_REGISTERING' | 'COMPLETE' | 'FAILED'
export type DeploymentType = 'INITIAL' | 'UPDATE'

export interface DeployJob {
  id: string
  siteId: string
  status: DeploymentStatus
  step: string
  scAddress?: string
  error?: string
  startedAt: Date
}

export interface GenerateResult {
  html: string
  title: string
  description: string
}
