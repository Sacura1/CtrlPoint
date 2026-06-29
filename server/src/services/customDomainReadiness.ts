import dns from 'dns/promises'
import https from 'https'
import { cfg } from '../config'

export const CUSTOM_DOMAIN_PUBLIC_RESOLVERS = ['1.1.1.1', '8.8.8.8', '9.9.9.9']
export const ROUTABLE_CUSTOM_DOMAIN_STATUSES = ['DNS_READY', 'TLS_ISSUING', 'ACTIVE', 'DEGRADED']

export type CustomDomainCheck = {
  key: 'ownership' | 'routing' | 'tls' | 'provider'
  label: string
  ok: boolean
  pending?: boolean
  detail: string
}

export type CustomDomainReadiness = {
  status: 'PENDING' | 'DNS_READY' | 'TLS_ISSUING' | 'ACTIVE' | 'DEGRADED'
  verified: boolean
  openable: boolean
  errorMsg: string | null
  checks: CustomDomainCheck[]
}

export function verificationName(domain: string) {
  return `_ctrlpoint.${domain}`
}

export function verificationValue(token: string) {
  return `ctrlpoint-verify=${token}`
}

export function targetHostForSite(mnsName: string) {
  return `${mnsName}.${cfg.mnsPublicDomain}`
}

function dnsPendingMessage(recordType: string, recordName: string) {
  return `${recordType} record was not found at ${recordName}. If you just added it, DNS can take a few minutes. If it has been longer, make sure the record was added in the domain's active DNS provider.`
}

export async function checkTxt(domain: string, token: string): Promise<{ ok: boolean; detail: string }> {
  try {
    const records = await dns.resolveTxt(verificationName(domain))
    const values = records.map(parts => parts.join(''))
    const ok = values.includes(verificationValue(token)) || values.includes(token)
    return ok
      ? { ok: true, detail: 'TXT ownership record found.' }
      : { ok: false, detail: `TXT record found at ${verificationName(domain)}, but the value does not match.` }
  } catch {
    return { ok: false, detail: dnsPendingMessage('TXT', verificationName(domain)) }
  }
}

export async function checkRouting(domain: string, expectedTarget: string): Promise<{ ok: boolean; detail: string }> {
  const normalizedExpected = expectedTarget.replace(/\.$/, '').toLowerCase()
  try {
    const cname = await dns.resolveCname(domain)
    const normalized = cname.map(v => v.replace(/\.$/, '').toLowerCase())
    if (normalized.includes(normalizedExpected) || normalized.includes(cfg.customDomainCnameTarget)) {
      return { ok: true, detail: `CNAME points to ${normalized[0]}.` }
    }
    return { ok: false, detail: `CNAME found, but it points to ${normalized.join(', ')}.` }
  } catch {
    if (cfg.customDomainARecords.length === 0) {
      return { ok: true, detail: 'Routing target was not enforced because CUSTOM_DOMAIN_A_RECORDS is not configured.' }
    }
    try {
      const records = await dns.resolve4(domain)
      const ok = records.some(ip => cfg.customDomainARecords.includes(ip))
      return ok
        ? { ok: true, detail: `A record points to ${records.join(', ')}.` }
        : { ok: false, detail: `A record points to ${records.join(', ')}, not the configured provider IP.` }
    } catch {
      return { ok: false, detail: `Point ${domain} to ${expectedTarget} with CNAME, or configure apex A records.` }
    }
  }
}

async function checkRoutingWithResolver(domain: string, expectedTarget: string, server: string): Promise<boolean> {
  const resolver = new dns.Resolver()
  resolver.setServers([server])
  const normalizedExpected = expectedTarget.replace(/\.$/, '').toLowerCase()
  try {
    const cname = await resolver.resolveCname(domain)
    const normalized = cname.map(v => v.replace(/\.$/, '').toLowerCase())
    return normalized.includes(normalizedExpected) || normalized.includes(cfg.customDomainCnameTarget)
  } catch {
    if (cfg.customDomainARecords.length === 0) return true
    try {
      const records = await resolver.resolve4(domain)
      return records.some(ip => cfg.customDomainARecords.includes(ip))
    } catch {
      return false
    }
  }
}

async function checkPublicRouting(domain: string, expectedTarget: string) {
  const checks = await Promise.all(CUSTOM_DOMAIN_PUBLIC_RESOLVERS.map(async server => ({
    server,
    ok: await checkRoutingWithResolver(domain, expectedTarget, server),
  })))
  const passed = checks.filter(check => check.ok).length
  const ok = passed === checks.length
  return {
    ok,
    checks,
    detail: ok
      ? 'DNS is visible on major public resolvers.'
      : `DNS is correct but still propagating on ${checks.length - passed} public resolver${checks.length - passed === 1 ? '' : 's'}.`,
  }
}

function requestViaProvider(domain: string, path = '/', timeoutMs = 8000): Promise<{ tlsOk: boolean; providerOk: boolean; status?: number; detail: string }> {
  return new Promise(resolve => {
    const directProviderIp = cfg.customDomainARecords[0]
    const req = https.request({
      host: directProviderIp || domain,
      port: 443,
      path,
      method: 'GET',
      servername: domain,
      headers: { Host: domain },
      timeout: timeoutMs,
      rejectUnauthorized: true,
    }, res => {
      res.resume()
      const status = res.statusCode || 0
      resolve({
        tlsOk: true,
        providerOk: status >= 200 && status < 400,
        status,
        detail: status >= 200 && status < 500
          ? `Provider responded with HTTP ${status}.`
          : `Provider returned HTTP ${status}.`,
      })
    })
    req.on('timeout', () => {
      req.destroy()
      resolve({ tlsOk: false, providerOk: false, detail: 'Provider check timed out.' })
    })
    req.on('error', err => {
      resolve({ tlsOk: false, providerOk: false, detail: err.message || 'Provider check failed.' })
    })
    req.end()
  })
}

export async function checkCustomDomainReadiness(params: {
  domain: string
  verificationToken: string
  mnsName: string
  currentStatus?: string | null
}): Promise<CustomDomainReadiness> {
  const expectedTarget = targetHostForSite(params.mnsName)
  const ownership = await checkTxt(params.domain, params.verificationToken)
  const routing = ownership.ok ? await checkRouting(params.domain, expectedTarget) : { ok: false, detail: 'Add the TXT ownership record before routing is checked.' }
  const publicRouting = ownership.ok && routing.ok
    ? await checkPublicRouting(params.domain, expectedTarget)
    : { ok: false, checks: [], detail: 'DNS records are not ready yet.' }
  const liveCheck = ownership.ok && routing.ok
    ? await requestViaProvider(params.domain)
    : { tlsOk: false, providerOk: false, detail: 'TLS will be checked after ownership and routing records are correct.' }

  const checks: CustomDomainCheck[] = [
    { key: 'ownership', label: 'TXT ownership', ok: ownership.ok, detail: ownership.detail },
    {
      key: 'routing',
      label: 'Routing DNS',
      ok: routing.ok && publicRouting.ok,
      pending: routing.ok && !publicRouting.ok,
      detail: routing.ok ? publicRouting.detail : routing.detail,
    },
    {
      key: 'tls',
      label: 'TLS certificate',
      ok: liveCheck.tlsOk,
      pending: ownership.ok && routing.ok && !liveCheck.tlsOk,
      detail: liveCheck.tlsOk ? 'HTTPS certificate is valid.' : liveCheck.detail,
    },
    {
      key: 'provider',
      label: 'Provider reachable',
      ok: liveCheck.providerOk,
      pending: ownership.ok && routing.ok && liveCheck.tlsOk && !liveCheck.providerOk,
      detail: liveCheck.detail,
    },
  ]

  const verified = ownership.ok && routing.ok
  const openable = verified && publicRouting.ok && liveCheck.tlsOk && liveCheck.providerOk
  const wasActive = params.currentStatus === 'ACTIVE' || params.currentStatus === 'DEGRADED'
  const status: CustomDomainReadiness['status'] = openable ? 'ACTIVE'
    : wasActive ? 'DEGRADED'
    : verified && !liveCheck.tlsOk ? 'TLS_ISSUING'
      : verified ? 'DNS_READY'
        : 'PENDING'
  const firstBlocking = checks.find(check => !check.ok)

  return {
    status,
    verified,
    openable,
    errorMsg: openable ? null : (firstBlocking?.detail || null),
    checks,
  }
}
