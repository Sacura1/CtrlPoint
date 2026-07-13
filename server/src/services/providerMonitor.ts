import { cfg } from '../config'

export type ProviderHealth = {
  ok: boolean
  url: string
  status?: number
  latencyMs?: number
  checkedAt?: string
  error?: string
  consecutiveFailures: number
}

let health: ProviderHealth = {
  ok: false,
  url: cfg.dewebProviderHealthUrl,
  consecutiveFailures: 0,
}
let started = false

export function getProviderHealth(): ProviderHealth {
  return health
}

export async function checkProviderHealth(): Promise<ProviderHealth> {
  const url = cfg.dewebProviderHealthUrl
  if (!url) {
    health = { ok: false, url: '', error: 'DEWEB_PROVIDER_HEALTH_URL is not configured.', consecutiveFailures: health.consecutiveFailures + 1 }
    return health
  }

  const startedAt = Date.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), cfg.dewebProviderHealthTimeoutMs)

  try {
    const response = await fetch(url, { signal: controller.signal })
    const latencyMs = Date.now() - startedAt
    const ok = response.ok
    health = {
      ok,
      url,
      status: response.status,
      latencyMs,
      checkedAt: new Date().toISOString(),
      error: ok ? undefined : `Provider returned HTTP ${response.status}.`,
      consecutiveFailures: ok ? 0 : health.consecutiveFailures + 1,
    }
  } catch (err: any) {
    health = {
      ok: false,
      url,
      latencyMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
      error: err?.name === 'AbortError' ? 'Provider health check timed out.' : (err?.message || 'Provider health check failed.'),
      consecutiveFailures: health.consecutiveFailures + 1,
    }
  } finally {
    clearTimeout(timeout)
  }

  if (!health.ok) {
    console.warn(`[provider-monitor] ${health.error} failures=${health.consecutiveFailures}`)
  }
  return health
}

export function startProviderMonitor() {
  if (started || !cfg.enableProviderMonitor) return
  started = true
  checkProviderHealth().catch(() => {})
  setInterval(() => {
    checkProviderHealth().catch(() => {})
  }, Math.max(10_000, cfg.dewebProviderHealthPollMs))
}
