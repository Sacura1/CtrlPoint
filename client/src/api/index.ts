import { User, Site, DeployStatus, CreditPackage } from '../types'

function normalizeApiOrigin(raw: string | undefined): string {
  if (!raw) return ''
  let value = raw.trim().replace(/\\n/g, '\n').replace(/\/n(?=VITE_[A-Z0-9_]+=)/gi, '\n')
  const embeddedEnvAt = value.search(/(?:\n|\s|--)(?=VITE_[A-Z0-9_]+=)/i)
  if (embeddedEnvAt > 0) value = value.slice(0, embeddedEnvAt)
  value = value.replace(/\/+$/, '')

  if (!value) return ''
  try {
    const parsed = new URL(value)
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Invalid protocol')
    return value
  } catch {
    console.error(`Invalid VITE_API_URL "${raw}". Use only the backend origin, for example https://api.example.com.`)
    return value
  }
}

export const API_ORIGIN = normalizeApiOrigin(import.meta.env.VITE_API_URL)
const BASE = API_ORIGIN + '/api'

export function apiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return BASE + normalized
}

async function parseResponse(res: Response): Promise<any> {
  const text = await res.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    if (!res.ok) return { error: text }
    throw new Error('Server returned an invalid response.')
  }
}

function apiConnectionError(err: unknown): Error {
  if (err instanceof Error && err.message !== 'Failed to fetch') return err
  const target = API_ORIGIN || window.location.origin
  return new Error(`Could not reach the CtrlPoint API at ${target}. Check the frontend build env VITE_API_URL.`)
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(apiUrl(url), {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...options?.headers },
      ...options,
    })
  } catch (err) {
    throw apiConnectionError(err)
  }
  const data = await parseResponse(res)
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

export interface ChatMessage { role: 'user' | 'assistant'; content: string }
export interface AIResponse {
  type: 'chat' | 'site'
  text?: string
  html?: string
  title?: string
  description?: string
  credits?: number
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

// Auth
export const appConfig = {
  get: () => request<{ enableModelSelection: boolean; activeModel: string; models: ModelOption[]; reasoningEfforts: { openai: ReasoningEffortOption[]; anthropic: ReasoningEffortOption[] } }>('/config'),
}

export const auth = {
  google: (token: string, type: 'idToken' | 'accessToken' = 'accessToken') =>
    request<{ user: User }>('/auth/google', { method: 'POST', body: JSON.stringify({ [type]: token }) }),
  register: (email: string, password: string, massaAddress?: string) =>
    request<{ user: User }>('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, massaAddress }) }),
  login: (email: string, password: string) =>
    request<{ user: User }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  me: () => request<{ user: User }>('/auth/me'),
  updateProfile: (massaAddress: string) =>
    request<{ user: User }>('/auth/me', { method: 'PATCH', body: JSON.stringify({ massaAddress }) }),
  generateWallet: () =>
    request<{ address: string; privateKey: string; user: User }>('/auth/wallet/generate', { method: 'POST' }),
}

// AI Chat
export const generate = {
  chat: (history: ChatMessage[], model?: string, currentHtml?: string, reasoningEffort?: string) =>
    request<AIResponse>('/generate', { method: 'POST', body: JSON.stringify({ history, model, currentHtml, reasoningEffort }) }),
  update: (siteId: string, history: ChatMessage[], model?: string, reasoningEffort?: string) =>
    request<AIResponse>(`/generate/update/${siteId}`, { method: 'POST', body: JSON.stringify({ history, model, reasoningEffort }) }),
  revert: (siteId: string) =>
    request<AIResponse>(`/generate/revert/${siteId}`, { method: 'POST' }),
}

// Sites
export const sites = {
  list: () => request<{ sites: Site[] }>('/sites'),
  get: (id: string) => request<{ site: Site }>(`/sites/${id}`),
  create: (data: { mnsName: string; generatedCode: string; title: string; description: string; lastPrompt?: string }) =>
    request<{ site: Site }>('/sites', { method: 'POST', body: JSON.stringify(data) }),
  updateDraft: (id: string, data: { mnsName?: string; generatedCode?: string; title?: string; description?: string; lastPrompt?: string }) =>
    request<{ site: Site }>(`/sites/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/sites/${id}`, { method: 'DELETE' }),
  deployments: (id: string) => request<{ deployments: import('../types').SiteDeployment[] }>(`/sites/${id}/deployments`),
  transferOwnership: (id: string) => request<{ ok: boolean; site: Site; message: string }>(`/sites/${id}/transfer-ownership`, { method: 'POST' }),
}

// Deploy
export const deploy = {
  checkMns: (name: string) =>
    request<{ available: boolean; error?: string }>(`/deploy/check-mns/${name}`),
  start: (siteId: string) =>
    request<{ deploymentId: string }>('/deploy', { method: 'POST', body: JSON.stringify({ siteId }) }),
  status: (deploymentId: string) => request<DeployStatus>(`/deploy/status/${deploymentId}`),
}

// GitHub
export const github = {
  status: () => request<{ connected: boolean }>('/github/status'),
  repos: () => request<{ repos: any[] }>('/github/repos'),
  connection: (siteId: string) => request<any>(`/github/connection/${siteId}`).catch(() => null),
  deployNew: (data: { mnsName: string; repoOwner: string; repoName: string; branch: string; projectType: string; projectRoot?: string; buildCommand: string; outputDir: string; buildEnv?: string; githubInstallationId?: string }) =>
    request<{ siteId: string; mnsName: string }>('/github/deploy-new', { method: 'POST', body: JSON.stringify(data) }),
  connect: (data: { siteId: string; repoOwner: string; repoName: string; branch: string; projectType: string; projectRoot?: string; buildCommand: string; outputDir: string; buildEnv?: string; githubInstallationId?: string }) =>
    request<{ connection: any }>('/github/connect', { method: 'POST', body: JSON.stringify(data) }),
  disconnect: (siteId: string) =>
    request<{ ok: boolean }>(`/github/connect/${siteId}`, { method: 'DELETE' }),
  disconnectAccount: () =>
    request<{ ok: boolean }>('/github/account', { method: 'DELETE' }),
  redeploy: (siteId: string) =>
    request<{ deploymentId: string }>(`/github/redeploy/${siteId}`, { method: 'POST' }),
}

// File upload
export const upload = {
  file: async (file: File): Promise<{ html?: string; title?: string; multiFile?: boolean; message?: string }> => {
    const form = new FormData()
    form.append('file', file)
    let res: Response
    try {
      res = await fetch(apiUrl('/upload'), {
        method: 'POST',
        credentials: 'include',
        body: form,
      })
    } catch (err) {
      throw apiConnectionError(err)
    }
    const data = await parseResponse(res)
    if (!res.ok) throw new Error(data.error || 'Upload failed')
    return data
  },
}

// User API Keys
export const keys = {
  list: () => request<{ keys: Record<string, boolean> }>('/keys'),
  save: (provider: string, apiKey: string) =>
    request<{ ok: boolean }>('/keys', { method: 'POST', body: JSON.stringify({ provider, apiKey }) }),
  remove: (provider: string) =>
    request<{ ok: boolean }>(`/keys/${provider}`, { method: 'DELETE' }),
}

// Billing
export const billing = {
  packages: () => request<{ packages: CreditPackage[] }>('/billing/packages'),
  checkout: (packageId: string) => request<{ url: string }>('/billing/checkout', { method: 'POST', body: JSON.stringify({ packageId }) }),
  history: () => request<{ transactions: any[] }>('/billing/history'),
}
