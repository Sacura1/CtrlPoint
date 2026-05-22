export interface User {
  id: string
  email: string
  credits: number
  massaAddress: string | null
}

export interface Site {
  id: string
  mnsName: string
  customDomain?: string | null
  scAddress: string | null
  status: 'DRAFT' | 'DEPLOYING' | 'LIVE' | 'ERROR' | 'UPDATING'
  title: string
  description: string
  createdAt: string
  updatedAt: string
  lastPrompt: string | null
  needsDeploy: boolean
  ownershipClaimed: boolean
  ownershipClaimedAt?: string | null
  ownershipClaimedTo?: string | null
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
  buildLogAvailable?: boolean
  createdAt: string
  updatedAt: string
}

export interface ArcDapp {
  id: string
  siteId: string
  userId: string
  category: string
  status: string
  ownerAddress?: string | null
  contractAddress?: string | null
  deployTxHash?: string | null
  explorerUrl?: string | null
  template?: string | null
  errorMsg?: string | null
  createdAt: string
  updatedAt: string
  abi?: any[] | null
  site?: {
    id: string
    mnsName: string
    title: string
    status: string
    scAddress: string | null
    customDomain?: string | null
    needsDeploy: boolean
    updatedAt: string
  }
}

export interface GitHubConnection {
  githubInstallationId?: string | null
  repoOwner: string
  repoName: string
  branch: string
  projectType: string
  projectRoot: string
  buildCommand: string
  outputDir: string
  buildEnv: string | null
  autoDeployOnPush: boolean
  lastDeployedSha: string | null
}

export interface CustomDomain {
  id: string
  siteId: string
  domain: string
  status: 'PENDING' | 'ACTIVE' | 'ERROR' | string
  creditCost: number
  errorMsg?: string | null
  createdAt: string
  updatedAt: string
  lastCheckedAt?: string | null
  verification: {
    type: 'TXT'
    name: string
    value: string
  }
  routing: {
    type: 'CNAME'
    name: string
    value: string
    apexARecords: string[]
  }
}

export interface CustomDomainCheck {
  key: 'ownership' | 'routing' | 'tls' | 'provider'
  label: string
  ok: boolean
  pending?: boolean
  detail: string
}

export interface ProviderHealth {
  ok: boolean
  url: string
  status?: number
  latencyMs?: number
  checkedAt?: string
  error?: string
  consecutiveFailures: number
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
}

export interface SupportTicket {
  id: string
  userId?: string | null
  email: string
  title: string
  body: string
  status: 'OPEN' | 'CLOSED' | string
  createdAt: string
}

export interface AdminStatus {
  totals: {
    users: number
    generatedSites: number
    liveSites: number
    completedDeployments: number
    connectedRepos: number
    supportTickets: number
    openTickets: number
    dau: number
    mau: number
  }
  daily: {
    logins: Array<{ day: string; count: number }>
    generatedSites: Array<{ day: string; count: number }>
    deployments: Array<{ day: string; count: number }>
  }
  endpoints: Array<{ name: string; ok: boolean; detail: string }>
  topCreditOwners: Array<{
    id: string
    email: string
    credits: number
    sites: number
    connectedRepos: number
    createdAt: string
  }>
  recentTickets: SupportTicket[]
  recentErrors: Array<{ id: string; message: string; path?: string | null; method?: string | null; statusCode?: number | null; createdAt: string; userId?: string | null }>
  failedDeployments: Array<{ id: string; siteId: string; source: string; errorMsg?: string | null; updatedAt: string }>
}
