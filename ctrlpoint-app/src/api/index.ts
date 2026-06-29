import Constants from 'expo-constants'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  AIResponse,
  ChatMessage,
  CreditPackage,
  DeployStatus,
  ModelOption,
  ReasoningEffortOption,
  Site,
  User,
} from '../types'
import type { BuildTemplate } from '../templates/templateRegistry'

const TOKEN_KEY = 'ctrlpoint_token'

function normalizeApiOrigin(raw: string | undefined): string {
  const value = (raw || '').trim().replace(/\/+$/, '')
  if (!value) return ''
  try {
    const parsed = new URL(value)
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Invalid protocol')
    return value
  } catch {
    return value
  }
}

const extra = Constants.expoConfig?.extra as Record<string, string | undefined> | undefined
export const API_ORIGIN = normalizeApiOrigin(process.env.EXPO_PUBLIC_API_URL || extra?.apiUrl || 'http://localhost:3001')
export const WEB_ORIGIN = normalizeApiOrigin(process.env.EXPO_PUBLIC_WEB_URL || extra?.webUrl || 'https://ctrlpoint.dev')
const BASE = `${API_ORIGIN}/api`

export function apiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return BASE + normalized
}

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY)
}

export async function setToken(token: string | null): Promise<void> {
  if (token) await AsyncStorage.setItem(TOKEN_KEY, token)
  else await AsyncStorage.removeItem(TOKEN_KEY)
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

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  let res: Response
  const token = await getToken()
  try {
    res = await fetch(apiUrl(url), {
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options?.headers,
      },
      ...options,
    })
  } catch (err) {
    const localHint = API_ORIGIN.includes('localhost') || API_ORIGIN.includes('127.0.0.1')
      ? ' For an Android phone connected by USB, run: adb reverse tcp:3001 tcp:3001'
      : ''
    if (err instanceof Error) throw new Error(`Could not reach the CtrlPoint API at ${API_ORIGIN}. ${err.message}.${localHint}`)
    throw new Error(`Could not reach the CtrlPoint API at ${API_ORIGIN}.${localHint}`)
  }

  const data = await parseResponse(res)
  if (!res.ok) {
    const message = data.error || `Request failed with ${res.status} ${res.statusText || ''}`.trim()
    throw new Error(`${message} (${res.status})`)
  }
  return data
}

export const appConfig = {
  get: () =>
    request<{
      enableModelSelection: boolean
      activeModel: string
      models: ModelOption[]
      reasoningEfforts: { openai: ReasoningEffortOption[]; anthropic: ReasoningEffortOption[] }
    }>('/config'),
}

export const auth = {
  guest: () => request<{ user: User; token?: string }>('/auth/guest', { method: 'POST' }),
  google: (token: string, type: 'idToken' | 'accessToken' = 'accessToken') =>
    request<{ user: User; token?: string }>('/auth/google', { method: 'POST', body: JSON.stringify({ [type]: token }) }),
  startEmail: (email: string, purpose: 'register' | 'reset') =>
    request<{ ok: boolean; devCode?: string }>('/auth/email/start', { method: 'POST', body: JSON.stringify({ email, purpose }) }),
  verifyRegister: (email: string, password: string, code: string, massaAddress?: string) =>
    request<{ user: User; token?: string }>('/auth/register/verify', {
      method: 'POST',
      body: JSON.stringify({ email, password, code, massaAddress }),
    }),
  register: (email: string, password: string, massaAddress?: string) =>
    request<{ user: User; token?: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, massaAddress }),
    }),
  login: (email: string, password: string) =>
    request<{ user: User; token?: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  resetPassword: (email: string, code: string, password: string) =>
    request<{ user: User; token?: string }>('/auth/password/reset', { method: 'POST', body: JSON.stringify({ email, code, password }) }),
  logout: () => request('/auth/logout', { method: 'POST' }),
  deleteAccount: () => request<{ ok: boolean }>('/auth/me', { method: 'DELETE' }),
  me: () => request<{ user: User }>('/auth/me'),
  updateProfile: (massaAddress: string) =>
    request<{ user: User }>('/auth/me', { method: 'PATCH', body: JSON.stringify({ massaAddress }) }),
  generateWallet: () =>
    request<{ address: string; privateKey: string; user: User }>('/auth/wallet/generate', { method: 'POST' }),
}

export const generate = {
  chat: (history: ChatMessage[], model?: string, currentHtml?: string, reasoningEffort?: string) =>
    request<AIResponse>('/generate', { method: 'POST', body: JSON.stringify({ history, model, currentHtml, reasoningEffort }) }),
  draft: (history: ChatMessage[], model?: string, reasoningEffort?: string, assets?: Record<string, string>) =>
    request<{ site: Site }>('/generate/draft', { method: 'POST', body: JSON.stringify({ history, model, reasoningEffort, assets }) }),
  update: (siteId: string, history: ChatMessage[], model?: string, reasoningEffort?: string) =>
    request<AIResponse>(`/generate/update/${siteId}`, {
      method: 'POST',
      body: JSON.stringify({ history, model, reasoningEffort }),
    }),
  updateBackground: (siteId: string, history: ChatMessage[], model?: string, reasoningEffort?: string) =>
    request<{ site: Site }>(`/generate/update-background/${siteId}`, {
      method: 'POST',
      body: JSON.stringify({ history, model, reasoningEffort }),
    }),
  revert: (siteId: string) => request<AIResponse>(`/generate/revert/${siteId}`, { method: 'POST' }),
}

export const sites = {
  list: () => request<{ sites: Site[] }>('/sites'),
  get: (id: string) => request<{ site: Site }>(`/sites/${id}`),
  create: (data: { mnsName: string; generatedCode: string; title: string; description: string; lastPrompt?: string }) =>
    request<{ site: Site }>('/sites', { method: 'POST', body: JSON.stringify(data) }),
  updateDraft: (
    id: string,
    data: { mnsName?: string; generatedCode?: string; title?: string; description?: string; lastPrompt?: string },
  ) => request<{ site: Site }>(`/sites/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/sites/${id}`, { method: 'DELETE' }),
  deployments: (id: string) => request<{ deployments: import('../types').SiteDeployment[] }>(`/sites/${id}/deployments`),
  transferOwnership: (id: string) =>
    request<{ ok: boolean; site: Site; message: string }>(`/sites/${id}/transfer-ownership`, { method: 'POST' }),
}

export const deploy = {
  checkMns: (name: string) =>
    request<{ available: boolean; error?: string; creditCost: number; free: boolean; message?: string }>(`/deploy/check-mns/${name}`),
  start: (siteId: string) =>
    request<{ deploymentId: string; creditsCharged?: number }>('/deploy', { method: 'POST', body: JSON.stringify({ siteId }) }),
  status: (deploymentId: string) => request<DeployStatus>(`/deploy/status/${deploymentId}`),
}

export const github = {
  status: () => request<{ connected: boolean }>('/github/status'),
  installUrl: () => request<{ url: string }>('/github/install-url'),
  repos: () => request<{ repos: any[] }>('/github/repos'),
  connection: (siteId: string) => request<any>(`/github/connection/${siteId}`).catch(() => null),
  deployNew: (data: {
    mnsName: string
    repoOwner: string
    repoName: string
    branch: string
    projectType: string
    projectRoot?: string
    buildCommand: string
    outputDir: string
    buildEnv?: string
    githubInstallationId?: string
  }) => request<{ siteId: string; mnsName: string; creditsCharged?: number }>('/github/deploy-new', { method: 'POST', body: JSON.stringify(data) }),
  connect: (data: {
    siteId: string
    repoOwner: string
    repoName: string
    branch: string
    projectType: string
    projectRoot?: string
    buildCommand: string
    outputDir: string
    buildEnv?: string
    githubInstallationId?: string
  }) => request<{ connection: any }>('/github/connect', { method: 'POST', body: JSON.stringify(data) }),
  disconnect: (siteId: string) => request<{ ok: boolean }>(`/github/connect/${siteId}`, { method: 'DELETE' }),
  disconnectAccount: () => request<{ ok: boolean }>('/github/account', { method: 'DELETE' }),
  redeploy: (siteId: string) => request<{ deploymentId: string }>(`/github/redeploy/${siteId}`, { method: 'POST' }),
}

export const upload = {
  file: async (file: { uri: string; name: string; mimeType?: string }): Promise<{ html?: string; title?: string; multiFile?: boolean; message?: string }> => {
    const form = new FormData()
    form.append('file', {
      uri: file.uri,
      name: file.name,
      type: file.mimeType || 'application/octet-stream',
    } as any)
    const token = await getToken()
    const res = await fetch(apiUrl('/upload'), {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form,
    })
    const data = await parseResponse(res)
    if (!res.ok) throw new Error(data.error || 'Upload failed')
    return data
  },
}

export const keys = {
  list: () => request<{ keys: Record<string, boolean> }>('/keys'),
  save: (provider: string, apiKey: string) =>
    request<{ ok: boolean }>('/keys', { method: 'POST', body: JSON.stringify({ provider, apiKey }) }),
  remove: (provider: string) => request<{ ok: boolean }>(`/keys/${provider}`, { method: 'DELETE' }),
}

export const billing = {
  packages: () => request<{ packages: CreditPackage[] }>('/billing/packages'),
  checkout: (packageId: string) => request<{ url: string }>('/billing/checkout', { method: 'POST', body: JSON.stringify({ packageId }) }),
  fulfillPlayPurchase: (data: { productId: string; purchaseToken: string }) =>
    request<{ ok: boolean; credits: number; user?: User; orderId?: string | null }>('/billing/play/fulfill', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  history: () => request<{ transactions: any[] }>('/billing/history'),
}

export const support = {
  createTicket: (data: { email: string; title: string; body: string }) =>
    request<{ ticket: { id: string; status: string; createdAt: string } }>('/support/tickets', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
}

export const notifications = {
  registerToken: (data: { token: string; platform: string }) =>
    request<{ ok: boolean }>('/notifications/tokens', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  unregisterToken: (token: string) =>
    request<{ ok: boolean }>('/notifications/tokens', {
      method: 'DELETE',
      body: JSON.stringify({ token }),
    }),
}

export const templates = {
  mobile: () => request<{ templates: BuildTemplate[] }>('/templates/mobile'),
}
