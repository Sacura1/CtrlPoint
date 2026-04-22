import { User, Site, DeployStatus, CreditPackage } from '../types'

const BASE = (import.meta.env.VITE_API_URL || '') + '/api'

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(BASE + url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  const data = await res.json()
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
}

// Auth
export const auth = {
  google: (idToken: string) =>
    request<{ user: User }>('/auth/google', { method: 'POST', body: JSON.stringify({ idToken }) }),
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
  chat: (history: ChatMessage[]) =>
    request<AIResponse>('/generate', { method: 'POST', body: JSON.stringify({ history }) }),
  update: (siteId: string, history: ChatMessage[]) =>
    request<AIResponse>(`/generate/update/${siteId}`, { method: 'POST', body: JSON.stringify({ history }) }),
  revert: (siteId: string) =>
    request<AIResponse>(`/generate/revert/${siteId}`, { method: 'POST' }),
}

// Sites
export const sites = {
  list: () => request<{ sites: Site[] }>('/sites'),
  get: (id: string) => request<{ site: Site }>(`/sites/${id}`),
  create: (data: { mnsName: string; generatedCode: string; title: string; description: string; lastPrompt?: string }) =>
    request<{ site: Site }>('/sites', { method: 'POST', body: JSON.stringify(data) }),
  delete: (id: string) => request(`/sites/${id}`, { method: 'DELETE' }),
  transferOwnership: (id: string) => request(`/sites/${id}/transfer-ownership`, { method: 'POST' }),
}

// Deploy
export const deploy = {
  checkMns: (name: string) =>
    request<{ available: boolean; error?: string }>(`/deploy/check-mns/${name}`),
  start: (siteId: string) =>
    request<{ deploymentId: string }>('/deploy', { method: 'POST', body: JSON.stringify({ siteId }) }),
  status: (deploymentId: string) => request<DeployStatus>(`/deploy/status/${deploymentId}`),
}

// Billing
export const billing = {
  packages: () => request<{ packages: CreditPackage[] }>('/billing/packages'),
  checkout: (packageId: string) => request<{ url: string }>('/billing/checkout', { method: 'POST', body: JSON.stringify({ packageId }) }),
  history: () => request<{ transactions: any[] }>('/billing/history'),
}
