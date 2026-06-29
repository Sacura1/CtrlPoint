import { Request } from 'express'

export interface AuthPayload {
  userId: string
  email: string
}

export interface AuthRequest extends Request {
  user?: AuthPayload
}

export interface AgentAuthPayload extends AuthPayload {
  agentKeyId?: string
  authMode?: 'agent_key' | 'x402'
  payer?: string
  paymentNetwork?: string
}

export interface AgentAuthRequest extends Request {
  user?: AgentAuthPayload
  agentBillingMode?: 'credits' | 'x402'
  payment?: {
    verified: boolean
    payer: string
    amount: string
    network: string
    transaction?: string
  }
}

export type SiteStatus = 'DRAFT' | 'DEPLOYING' | 'LIVE' | 'ERROR' | 'UPDATING'
export type DeploymentStatus = 'QUEUED' | 'BUILDING' | 'UPLOADING' | 'MNS_REGISTERING' | 'COMPLETE' | 'SUPERSEDED' | 'FAILED'
export type DeploymentType = 'INITIAL' | 'UPDATE' | 'ROLLBACK'

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
