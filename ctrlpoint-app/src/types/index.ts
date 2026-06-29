export interface User {
  id: string
  email: string
  credits: number
  massaAddress: string | null
}

export interface Site {
  id: string
  mnsName: string
  scAddress: string | null
  status: 'DRAFT' | 'GENERATING' | 'GENERATION_FAILED' | 'DEPLOYING' | 'LIVE' | 'ERROR' | 'UPDATING'
  title: string
  description: string
  createdAt: string
  updatedAt: string
  lastPrompt: string | null
  needsDeploy: boolean
  ownershipClaimed: boolean
  ownershipClaimedAt?: string | null
  ownershipClaimedTo?: string | null
  customDomain?: string | null
  generatedCode?: string
  previousCode?: string | null
}

export interface SiteDeployment {
  id: string
  type: string
  status: string
  source: string
  commitSha: string | null
  step: string | null
  errorMsg: string | null
  scAddress: string | null
  createdAt: string
  updatedAt: string
}

export interface DeployStatus {
  status: 'QUEUED' | 'BUILDING' | 'UPLOADING' | 'MNS_REGISTERING' | 'COMPLETE' | 'FAILED'
  step: string
  scAddress?: string
  error?: string
  url?: string | null
}

export interface CreditPackage {
  id: string
  name: string
  credits: number
  priceUsd: number
  googlePlayProductId?: string
}

export interface ModelOption {
  id: string
  label: string
  full: string
  sub: string
  provider: 'OpenAI' | 'Anthropic'
  cost: number
  supportsReasoning: boolean
  reasoningEfforts: string[]
}

export interface ReasoningEffortOption {
  id: string
  label: string
  sub: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface AIResponse {
  type: 'chat' | 'site'
  text?: string
  html?: string
  title?: string
  description?: string
  credits?: number
}
