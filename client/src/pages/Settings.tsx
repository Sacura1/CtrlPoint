import { useState, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import Header from '../components/Header'
import { auth as authApi, sites as sitesApi, billing as billingApi, customDomains as customDomainsApi, health as healthApi } from '../api'
import { useAuth } from '../store/auth'
import { CustomDomain, CustomDomainCheck, ProviderHealth, Site } from '../types'
import { mnsPublicDomain } from '../utils/siteUrl'
import ClaimedBadge from '../components/ClaimedBadge'

const FREE_CUSTOM_DOMAINS_PER_USER = 2
const EXTRA_CUSTOM_DOMAIN_CREDITS = 5
const CUSTOM_DOMAIN_VERIFY_ATTEMPTS = 7
const CUSTOM_DOMAIN_VERIFY_INTERVAL_MS = 10000

type DomainMessage = {
  tone: 'success' | 'pending' | 'error'
  text: string
}

interface Transaction {
  id: string
  amount: number
  type: string
  note: string | null
  createdAt: string
}

export default function Settings() {
  const { user, setUser, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [massaAddress, setMassaAddress] = useState(user?.massaAddress ?? '')
  const [savingAddress, setSavingAddress] = useState(false)
  const [addressMsg, setAddressMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const [generatingWallet, setGeneratingWallet] = useState(false)
  const [newWallet, setNewWallet] = useState<{ address: string; privateKey: string } | null>(null)
  const [keyCopied, setKeyCopied] = useState(false)

  const [sites, setSites] = useState<Site[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [domains, setDomains] = useState<CustomDomain[]>([])
  const [domainInputs, setDomainInputs] = useState<Record<string, string>>({})
  const [domainBusy, setDomainBusy] = useState<string | null>(null)
  const [domainMsg, setDomainMsg] = useState<DomainMessage | null>(null)
  const [domainChecks, setDomainChecks] = useState<Record<string, CustomDomainCheck[]>>({})
  const [domainPickerOpen, setDomainPickerOpen] = useState(false)
  const [domainSiteId, setDomainSiteId] = useState<string | null>(null)
  const [providerHealth, setProviderHealth] = useState<ProviderHealth | null>(null)
  const [historyExpanded, setHistoryExpanded] = useState(false)
  const [expandedTransactions, setExpandedTransactions] = useState<Set<string>>(() => new Set())
  const [ownershipExpanded, setOwnershipExpanded] = useState(false)
  const [visibleScId, setVisibleScId] = useState<string | null>(null)
  const [claiming, setClaiming] = useState<string | null>(null)
  const [claimMsg, setClaimMsg] = useState<{ siteId: string; ok: boolean; text: string } | null>(null)
  const [claimConfirmSite, setClaimConfirmSite] = useState<Site | null>(null)
  const [claimStatus, setClaimStatus] = useState<{
    site: Site
    tone: 'running' | 'success' | 'error'
    title: string
    text: string
  } | null>(null)

  useEffect(() => {
    sitesApi.list().then(({ sites }) => {
      setSites(sites.filter(s => s.status === 'LIVE'))
      const siteId = new URLSearchParams(location.search).get('site')
      if (siteId && sites.some(site => site.id === siteId && site.status === 'LIVE')) {
        setDomainSiteId(siteId)
        setTimeout(() => document.getElementById('custom-domains')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
      }
    })
    billingApi.history().then(({ transactions }) => setTransactions(transactions))
    customDomainsApi.list().then(({ domains }) => setDomains(domains)).catch(() => {})
    healthApi.provider().then(setProviderHealth).catch(err => setProviderHealth({ ok: false, url: '', error: err.message, consecutiveFailures: 1 }))
  }, [location.search])

  const generateWallet = async () => {
    setGeneratingWallet(true)
    try {
      const { address, privateKey, user: updated } = await authApi.generateWallet()
      setUser(updated)
      setMassaAddress(address)
      setNewWallet({ address, privateKey })
    } catch (err: any) {
      setAddressMsg({ ok: false, text: err.message })
    } finally {
      setGeneratingWallet(false)
    }
  }

  const copyKey = async () => {
    if (!newWallet) return
    await navigator.clipboard.writeText(newWallet.privateKey)
    setKeyCopied(true)
    setTimeout(() => setKeyCopied(false), 2000)
  }

  const saveAddress = async () => {
    setSavingAddress(true)
    setAddressMsg(null)
    try {
      const { user: updated } = await authApi.updateProfile(massaAddress.trim())
      setUser(updated)
      setAddressMsg({ ok: true, text: 'Saved.' })
    } catch (err: any) {
      setAddressMsg({ ok: false, text: err.message })
    } finally {
      setSavingAddress(false)
    }
  }

  const requestClaimOwnership = (site: Site) => {
    if (!user?.massaAddress) {
      setAddressMsg({ ok: false, text: 'Create a wallet or add your Massa address before claiming ownership.' })
      document.getElementById('massa-wallet')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setClaimConfirmSite(site)
  }

  const claimOwnership = async (site: Site) => {
    if (!user?.massaAddress) return requestClaimOwnership(site)
    setClaimConfirmSite(null)
    setClaiming(site.id)
    setClaimMsg(null)
    setClaimStatus({
      site,
      tone: 'running',
      title: 'Transferring ownership',
      text: `MNS ownership for ${site.mnsName}.${mnsPublicDomain} is being transferred to your Massa wallet. This can take a few minutes. You can close this modal and the transfer will continue.`,
    })
    try {
      const result = await sitesApi.transferOwnership(site.id)
      setSites(prev => prev.map(s => s.id === site.id ? result.site : s))
      setClaimMsg({ siteId: site.id, ok: true, text: 'Ownership transferred to your wallet.' })
      setClaimStatus({
        site: result.site,
        tone: 'success',
        title: 'Ownership claimed',
        text: `Ownership has been transferred to ${user.massaAddress}. CtrlPoint updates and GitHub auto-deploy are now disabled for this site.`,
      })
    } catch (err: any) {
      setClaimMsg({ siteId: site.id, ok: false, text: err.message })
      setClaimStatus({
        site,
        tone: 'error',
        title: 'Transfer failed',
        text: err.message,
      })
    } finally {
      setClaiming(null)
    }
  }

  const addCustomDomain = async (site: Site) => {
    const value = domainInputs[site.id]?.trim()
    if (!value) return
    setDomainBusy(`add:${site.id}`)
    setDomainMsg(null)
    try {
      const { domain, creditsCharged, userCredits } = await customDomainsApi.add(site.id, value)
      setDomains(prev => [domain, ...prev.filter(d => d.id !== domain.id)])
      if (typeof userCredits === 'number' && user) setUser({ ...user, credits: userCredits })
      setDomainInputs(prev => ({ ...prev, [site.id]: '' }))
      setDomainMsg({ tone: 'success', text: creditsCharged > 0 ? `Domain added and ${creditsCharged} credits used. Add the DNS records below, then verify.` : 'Domain added. Add the DNS records below, then verify.' })
    } catch (err: any) {
      setDomainMsg({ tone: 'error', text: err.message })
    } finally {
      setDomainBusy(null)
    }
  }

  const verifyCustomDomain = async (domainId: string) => {
    setDomainBusy(`verify:${domainId}`)
    setDomainMsg({ tone: 'pending', text: 'Checking DNS records. This can take a few minutes after adding records.' })
    setDomains(prev => prev.map(domain => domain.id === domainId ? { ...domain, errorMsg: null } : domain))
    try {
      let lastMessage = 'DNS records were not found yet. Confirm the records are in the active DNS provider, then try again.'
      let lastDomain: CustomDomain | null = null

      for (let attempt = 1; attempt <= CUSTOM_DOMAIN_VERIFY_ATTEMPTS; attempt += 1) {
        const result = await customDomainsApi.verify(domainId)
        lastDomain = result.domain
        if (result.checks) {
          setDomainChecks(prev => ({ ...prev, [domainId]: result.checks || [] }))
        }

        if (result.openable) {
          setDomains(prev => prev.map(d => d.id === domainId ? result.domain : d))
          setDomainMsg({
            tone: 'success',
            text: 'Domain verified and active.',
          })
          return
        }

        lastMessage = result.domain.errorMsg || result.checks?.find(check => !check.ok)?.detail || lastMessage
        if (attempt < CUSTOM_DOMAIN_VERIFY_ATTEMPTS) {
          setDomainMsg({
            tone: 'pending',
            text: `Still checking domain readiness... (${attempt}/${CUSTOM_DOMAIN_VERIFY_ATTEMPTS})`,
          })
          await sleep(CUSTOM_DOMAIN_VERIFY_INTERVAL_MS)
        }
      }

      if (lastDomain) {
        setDomains(prev => prev.map(d => d.id === domainId ? lastDomain : d))
      }
      setDomainMsg({ tone: 'pending', text: lastMessage })
    } catch (err: any) {
      setDomainMsg({ tone: 'error', text: err.message })
    } finally {
      setDomainBusy(null)
    }
  }

  const removeCustomDomain = async (domainId: string) => {
    setDomainBusy(`remove:${domainId}`)
    setDomainMsg(null)
    try {
      const result = await customDomainsApi.remove(domainId)
      setDomains(prev => prev.filter(d => d.id !== domainId))
      if (typeof result.userCredits === 'number' && user) setUser({ ...user, credits: result.userCredits })
      setDomainMsg({ tone: 'success', text: result.refundedCredits ? `Domain removed. ${result.refundedCredits} credits refunded.` : 'Domain removed.' })
    } catch (err: any) {
      setDomainMsg({ tone: 'error', text: err.message })
    } finally {
      setDomainBusy(null)
    }
  }

  const openDomainProject = (siteId: string) => {
    setDomainSiteId(siteId)
    setDomainPickerOpen(false)
    setDomainMsg(null)
    setTimeout(() => document.getElementById('custom-domains')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 0)
  }

  const selectedDomainSite = sites.find(site => site.id === domainSiteId) ?? null
  const selectedSiteDomains = selectedDomainSite ? domains.filter(d => d.siteId === selectedDomainSite.id) : []
  const nextCustomDomainCost = domains.length >= FREE_CUSTOM_DOMAINS_PER_USER ? EXTRA_CUSTOM_DOMAIN_CREDITS : 0
  const freeCustomDomainsLeft = Math.max(0, FREE_CUSTOM_DOMAINS_PER_USER - domains.length)
  const canAffordCustomDomain = nextCustomDomainCost === 0 || !user || user.credits >= nextCustomDomainCost
  const visibleTransactions = historyExpanded ? transactions.slice(0, 20) : transactions.slice(0, 4)
  const visibleOwnershipSites = ownershipExpanded ? sites : sites.slice(0, 4)

  const toggleTransaction = (id: string) => {
    setExpandedTransactions(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg)' }}>
      <Header />

      {/* Ambient */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-[30%] w-[500px] h-[300px] opacity-08 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(var(--brand-600-rgb),0.3) 0%, transparent 70%)', filter: 'blur(100px)' }} />
      </div>

      <main className="relative z-10 max-w-2xl mx-auto px-4 sm:px-6 py-10 space-y-8 animate-fade-in">

        {/* Account */}
        <Section title="Account">
          {/* Email */}
          <Row label="Email" value={user?.email} />

          {/* Massa address */}
          <div id="massa-wallet" className="px-5 py-4 scroll-mt-24" style={{ borderTop: '1px solid var(--line)' }}>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-medium" style={{ color: 'var(--muted)' }}>MASSA WALLET</p>
              {!user?.massaAddress && (
                <button onClick={generateWallet} disabled={generatingWallet}
                  className="text-xs font-medium transition-colors"
                  style={{ color: 'var(--brand-400)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--brand-300)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--brand-400)')}>
                  {generatingWallet ? 'Generating…' : '+ Create wallet'}
                </button>
              )}
            </div>
            <p className="text-xs mb-3" style={{ color: 'var(--muted)' }}>
              Required to claim on-chain ownership. Starts with <span className="font-mono">AS</span>.
            </p>
            <div className="flex gap-2">
              <input className="input flex-1 text-sm font-mono" placeholder="AS1..."
                value={massaAddress}
                onChange={e => { setMassaAddress(e.target.value); setAddressMsg(null) }} />
              <button onClick={saveAddress}
                disabled={savingAddress || massaAddress.trim() === (user?.massaAddress ?? '')}
                className="btn-primary text-sm px-4 py-2 flex-shrink-0">
                {savingAddress ? 'Saving…' : 'Save'}
              </button>
            </div>
            {addressMsg && (
              <p className={`text-xs mt-2 ${addressMsg.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                {addressMsg.text}
              </p>
            )}
          </div>
        </Section>

        {/* Credits */}
        <Section title="Credits">
          <div className="px-5 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-soft)' }}>Current balance</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>Available credits for AI and short MNS names.</p>
            </div>
            <div className="flex w-fit items-center gap-2 rounded-xl px-3 py-2"
              style={{ background: 'color-mix(in srgb, var(--panel-2) 86%, transparent)', border: '1px solid var(--line)' }}>
              <span className="text-2xl font-black tabular-nums" style={{ color: 'var(--text)' }}>{user?.credits ?? 0}</span>
              <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>credits</span>
              <Link to="/credits"
                className="ml-1 flex h-7 w-7 items-center justify-center rounded-lg text-sm font-bold transition-all"
                style={{ background: 'rgba(var(--brand-600-rgb),0.12)', color: 'var(--brand-300)', border: '1px solid rgba(var(--brand-400-rgb),0.22)' }}
                aria-label="Top up credits">
                +
              </Link>
            </div>
          </div>

          {transactions.length > 0 && (
            <div className="px-5 py-4" style={{ borderTop: '1px solid var(--line)' }}>
              <div className="mb-3 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setHistoryExpanded(v => !v)}
                  className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest"
                  style={{ color: 'var(--muted)' }}>
                  History
                  <Chevron open={historyExpanded} />
                </button>
                <span className="text-xs" style={{ color: 'var(--muted-2)' }}>
                  {historyExpanded ? `${transactions.length} total` : `Showing ${visibleTransactions.length} of ${transactions.length}`}
                </span>
              </div>
              <div className="space-y-2">
                {visibleTransactions.map((tx) => {
                  const expanded = expandedTransactions.has(tx.id)
                  return (
                    <button
                      key={tx.id}
                      type="button"
                      onClick={() => toggleTransaction(tx.id)}
                      className="flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-all"
                      style={{ background: 'color-mix(in srgb, var(--panel-2) 70%, transparent)', border: '1px solid var(--line)' }}>
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-xs font-semibold leading-5 ${expanded ? 'break-words' : 'line-clamp-2'}`}
                          style={{ color: 'var(--text-soft)' }}>
                          {tx.note || tx.type}
                        </p>
                        <p className="mt-0.5 text-xs tabular-nums" style={{ color: 'var(--muted-2)' }}>
                          {formatLongDate(tx.createdAt)}
                        </p>
                      </div>
                      <span
                        className="shrink-0 rounded-lg px-2 py-1 font-mono text-xs font-bold tabular-nums"
                        style={{
                          color: tx.amount > 0 ? 'var(--success)' : 'var(--muted)',
                          background: tx.amount > 0 ? 'rgba(var(--success-rgb),0.08)' : 'color-mix(in srgb, var(--panel-2) 70%, transparent)',
                          border: `1px solid ${tx.amount > 0 ? 'rgba(var(--success-rgb),0.18)' : 'var(--line)'}`,
                        }}>
                        {tx.amount > 0 ? '+' : ''}{tx.amount}
                      </span>
                    </button>
                  )
                })}
              </div>
              {transactions.length > 4 && (
                <button
                  type="button"
                  onClick={() => setHistoryExpanded(v => !v)}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold"
                  style={{ color: 'var(--muted)', background: 'color-mix(in srgb, var(--panel-2) 64%, transparent)', border: '1px solid var(--line)' }}>
                  {historyExpanded ? 'Show less' : 'Show all history'}
                  <Chevron open={historyExpanded} />
                </button>
              )}
            </div>
          )}
        </Section>

        {/* Custom domains */}
        <Section title="Custom Domains">
          <div id="custom-domains" className="px-5 py-4">
            {!selectedDomainSite ? (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-soft)' }}>Manage custom domains</p>
                  <p className="mt-1 text-xs leading-5" style={{ color: 'var(--muted)' }}>
                    First 2 custom domains are free. Extra custom domains cost 5 credits each.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDomainPickerOpen(true)}
                  disabled={sites.length === 0}
                  className="btn-primary w-full px-4 py-2.5 text-sm sm:w-auto">
                  Custom domains
                </button>
              </div>
            ) : (
              <div>
                <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => setDomainSiteId(null)}
                      className="mb-3 inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold"
                      style={{ color: 'var(--muted)', background: 'color-mix(in srgb, var(--panel-2) 72%, transparent)', border: '1px solid var(--line)' }}>
                      ← Projects
                    </button>
                    <p className="truncate text-lg font-black" style={{ color: 'var(--text)' }}>{selectedDomainSite.title}</p>
                    <p className="mt-1 truncate font-mono text-xs" style={{ color: 'var(--muted)' }}>
                      {selectedDomainSite.mnsName}.{mnsPublicDomain}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDomainPickerOpen(true)}
                    className="rounded-xl px-3 py-2 text-xs font-semibold"
                    style={{ color: 'var(--text-soft)', background: 'color-mix(in srgb, var(--panel-2) 74%, transparent)', border: '1px solid var(--line)' }}>
                    Change project
                  </button>
                </div>

                {domainMsg && (
                  (() => {
                    const message = domainMessageStyle(domainMsg.tone)
                    return (
                      <p className={`mb-4 rounded-xl px-3 py-2 text-xs ${message.className}`} style={message.style}>
                        {domainMsg.text}
                      </p>
                    )
                  })()
                )}

                <div className="rounded-2xl p-3"
                  style={{ background: 'color-mix(in srgb, var(--panel-2) 66%, transparent)', border: '1px solid var(--line)' }}>
                  <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>Add domain</p>
                    <span className="w-fit rounded-lg px-2 py-1 text-xs font-semibold"
                      style={{
                        color: nextCustomDomainCost > 0 ? 'var(--text-soft)' : 'var(--success)',
                        background: nextCustomDomainCost > 0 ? 'color-mix(in srgb, var(--panel) 74%, transparent)' : 'rgba(var(--success-rgb),0.08)',
                        border: `1px solid ${nextCustomDomainCost > 0 ? 'var(--line)' : 'rgba(var(--success-rgb),0.18)'}`,
                      }}>
                      {nextCustomDomainCost > 0 ? `${nextCustomDomainCost} credits` : `${freeCustomDomainsLeft} free left`}
                    </span>
                  </div>
                  <p className="mb-3 text-xs leading-5" style={{ color: 'var(--muted)' }}>
                    {nextCustomDomainCost > 0
                      ? `This custom domain will use ${nextCustomDomainCost} credits. Remove it within 10 minutes before it verifies to get an automatic refund.`
                      : `You have ${freeCustomDomainsLeft} free custom domain${freeCustomDomainsLeft === 1 ? '' : 's'} left.`}
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      className="input flex-1 text-sm"
                      placeholder="www.example.com"
                      value={domainInputs[selectedDomainSite.id] || ''}
                      onChange={e => setDomainInputs(prev => ({ ...prev, [selectedDomainSite.id]: e.target.value }))}
                    />
                    <button
                      onClick={() => addCustomDomain(selectedDomainSite)}
                      disabled={domainBusy === `add:${selectedDomainSite.id}` || !domainInputs[selectedDomainSite.id]?.trim() || !canAffordCustomDomain}
                      className="btn-primary shrink-0 px-4 py-2 text-sm">
                      {domainBusy === `add:${selectedDomainSite.id}` ? 'Adding...' : 'Add domain'}
                    </button>
                  </div>
                  {!canAffordCustomDomain && (
                    <div className="mt-3 flex flex-col gap-2 rounded-xl px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                      style={{ background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.16)' }}>
                      <p className="text-xs leading-5 text-red-400">You need {nextCustomDomainCost} credits to add another custom domain.</p>
                      <Link to="/credits" className="btn-primary w-full px-3 py-2 text-center text-xs sm:w-auto">
                        Top up
                      </Link>
                    </div>
                  )}
                </div>

                <div className="mt-4 space-y-3">
                  {selectedSiteDomains.length === 0 ? (
                    <div className="rounded-2xl px-4 py-6 text-center"
                      style={{ background: 'color-mix(in srgb, var(--panel-2) 58%, transparent)', border: '1px solid var(--line)' }}>
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-soft)' }}>No custom domains yet</p>
                      <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>Add one above to get the DNS records.</p>
                    </div>
                  ) : selectedSiteDomains.map(domain => {
                    const companion = companionDomain(domain.domain)
                    const showCompanion = companion && !selectedSiteDomains.some(existing => existing.domain.replace(/\.$/, '').toLowerCase() === companion)
                    return (
                    <div key={domain.id} className="rounded-2xl p-4"
                      style={{ background: 'color-mix(in srgb, var(--panel-2) 64%, transparent)', border: '1px solid var(--line)' }}>
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <p className="min-w-0 flex-1 break-all font-mono text-xs font-semibold sm:text-sm" style={{ color: 'var(--text-soft)' }}>{domain.domain}</p>
                        <DomainStatusBadge status={domain.status} />
                      </div>

                      {domain.status === 'ACTIVE' ? (
                        <div className="rounded-xl px-3 py-3"
                          style={{ background: 'rgba(var(--success-rgb),0.07)', border: '1px solid rgba(var(--success-rgb),0.16)' }}>
                          <div className="flex items-center gap-2">
                            <span className="flex h-6 w-6 items-center justify-center rounded-full"
                              style={{ color: 'var(--success)', background: 'rgba(var(--success-rgb),0.12)', border: '1px solid rgba(var(--success-rgb),0.22)' }}>
                              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                                <path d="M3 7.2l2.4 2.4L11 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </span>
                            <div>
                              <p className="text-xs font-bold" style={{ color: 'var(--success)' }}>Verified</p>
                              <p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>Traffic is routed to this web-app. Some networks may take a few minutes to catch up after DNS changes.</p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <>
                          <DnsRecord label="Verify ownership" type={domain.verification.type} name={domain.verification.name} value={domain.verification.value} zoneDomain={domain.domain} />
                          {isApexDomain(domain.domain) && domain.routing.apexARecords.length > 0 ? (
                            domain.routing.apexARecords.map(ip => (
                              <DnsRecord key={ip} label="Route traffic" type="A" name={domain.domain} value={ip} zoneDomain={domain.domain} />
                            ))
                          ) : (
                            <DnsRecord label="Route traffic" type={domain.routing.type} name={domain.routing.name} value={domain.routing.value} zoneDomain={domain.domain} />
                          )}
                        </>
                      )}
                      {domain.errorMsg && domainBusy !== `verify:${domain.id}` && (
                        <p className="mt-2 text-xs" style={{ color: '#f87171' }}>{domain.errorMsg}</p>
                      )}
                      <CustomDomainDiagnostics checks={domainChecks[domain.id]} status={domain.status} />
                      {showCompanion && (
                        <div className="mt-3 flex flex-col gap-2 rounded-xl px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                          style={{ background: 'color-mix(in srgb, var(--panel) 78%, transparent)', border: '1px solid var(--line)' }}>
                          <p className="text-xs leading-5" style={{ color: 'var(--muted)' }}>
                            Also connect <span className="font-mono" style={{ color: 'var(--text-soft)' }}>{companion}</span> if you want both root and www to work.
                          </p>
                          <button
                            type="button"
                            onClick={() => companion && setDomainInputs(prev => ({ ...prev, [domain.siteId]: companion }))}
                            className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                            style={{ color: 'var(--accent, var(--brand-300))', border: '1px solid rgba(var(--accent-rgb, var(--brand-400-rgb)),0.22)', background: 'rgba(var(--accent-rgb, var(--brand-600-rgb)),0.08)' }}>
                            Use this
                          </button>
                        </div>
                      )}

                      <div className="mt-3 flex gap-2">
                        {domain.status !== 'ACTIVE' && (
                          <button
                            type="button"
                            onClick={() => verifyCustomDomain(domain.id)}
                            disabled={domainBusy === `verify:${domain.id}`}
                            className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                            style={{ color: 'var(--accent, var(--brand-300))', border: '1px solid rgba(var(--accent-rgb, var(--brand-400-rgb)),0.22)', background: 'rgba(var(--accent-rgb, var(--brand-600-rgb)),0.08)' }}>
                            {domainBusy === `verify:${domain.id}` ? 'Checking...' : 'Verify'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => removeCustomDomain(domain.id)}
                          disabled={domainBusy === `remove:${domain.id}`}
                          className="rounded-lg px-3 py-1.5 text-xs font-semibold"
                          style={{ color: '#f87171', border: '1px solid rgba(248,113,113,0.18)', background: 'rgba(248,113,113,0.06)' }}>
                          {domainBusy === `remove:${domain.id}` ? 'Removing...' : 'Remove'}
                        </button>
                      </div>
                    </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </Section>

        {/* Ownership */}
        {sites.length > 0 && (
          <Section title="On-chain Ownership">
            <div className="px-5 pb-3 pt-3">
              <button
                type="button"
                onClick={() => setOwnershipExpanded(v => !v)}
                className="mb-2 flex w-full items-center justify-between gap-3 text-left">
                <span className="text-sm font-semibold" style={{ color: 'var(--text-soft)' }}>Claim site ownership</span>
                <span className="flex items-center gap-2 text-xs" style={{ color: 'var(--muted)' }}>
                  {ownershipExpanded ? `${sites.length} sites` : `Showing ${visibleOwnershipSites.length} of ${sites.length}`}
                  <Chevron open={ownershipExpanded} />
                </span>
              </button>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                Sites are owned by the CtrlPoint platform wallet. Claim ownership to transfer the MNS domain to your personal address. After claiming, CtrlPoint updates and GitHub auto-deploy are disabled for that site.
              </p>
            </div>
            {visibleOwnershipSites.map((site) => {
              const msg = claimMsg?.siteId === site.id ? claimMsg : null
              return (
                <div key={site.id} className="px-5 py-4"
                  style={{ borderTop: '1px solid var(--line)' }}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <p className="text-sm font-semibold text-ink-100 truncate">{site.title}</p>
                        {site.ownershipClaimed && <ClaimedBadge compact />}
                        {site.scAddress && (
                          <button
                            type="button"
                            onClick={() => setVisibleScId(current => current === site.id ? null : site.id)}
                            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide"
                            style={{
                              color: visibleScId === site.id ? 'var(--text)' : 'var(--muted)',
                              background: visibleScId === site.id ? 'rgba(var(--accent-rgb, var(--brand-600-rgb)),0.14)' : 'color-mix(in srgb, var(--panel-2) 70%, transparent)',
                              border: `1px solid ${visibleScId === site.id ? 'rgba(var(--accent-rgb, var(--brand-400-rgb)),0.28)' : 'var(--line)'}`,
                            }}>
                            SC
                          </button>
                        )}
                      </div>
                      <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--muted)' }}>
                        {site.mnsName}.{mnsPublicDomain}
                      </p>
                      {site.scAddress && (
                        <p className="hidden">
                          {site.scAddress.slice(0, 22)}…
                        </p>
                      )}
                      {site.scAddress && visibleScId === site.id && (
                        <p className="mt-2 break-all rounded-xl px-3 py-2 font-mono text-[11px] leading-5"
                          style={{ color: 'var(--text-soft)', background: 'color-mix(in srgb, var(--panel-2) 62%, transparent)', border: '1px solid var(--line)' }}>
                          {site.scAddress}
                        </p>
                      )}
                    </div>
                    <button onClick={() => requestClaimOwnership(site)}
                      disabled={claiming === site.id || site.ownershipClaimed}
                      className="text-xs py-1.5 px-3 rounded-lg flex-shrink-0 font-medium transition-all duration-200"
                      style={{ background: 'rgba(var(--brand-600-rgb),0.1)', border: '1px solid rgba(var(--brand-600-rgb),0.2)', color: 'var(--brand-400)' }}
                      onMouseEnter={e => { if (!site.ownershipClaimed) e.currentTarget.style.background = 'rgba(var(--brand-600-rgb),0.2)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(var(--brand-600-rgb),0.1)' }}>
                      {claiming === site.id ? 'Transferring…' : site.ownershipClaimed ? 'Claimed' : 'Claim ownership'}
                    </button>
                  </div>
                  {msg && (
                    <p className={`text-xs mt-2 ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}</p>
                  )}
                </div>
              )
            })}
            {sites.length > 4 && (
              <div className="px-5 py-3" style={{ borderTop: '1px solid var(--line)' }}>
                <button
                  type="button"
                  onClick={() => setOwnershipExpanded(v => !v)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold"
                  style={{ color: 'var(--muted)', background: 'color-mix(in srgb, var(--panel-2) 64%, transparent)', border: '1px solid var(--line)' }}>
                  {ownershipExpanded ? 'Show fewer sites' : 'Show all sites'}
                  <Chevron open={ownershipExpanded} />
                </button>
              </div>
            )}
          </Section>
        )}

        {/* Provider */}
        <Section title="Provider Health">
          <div className="px-5 py-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-soft)' }}>DeWeb provider</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                {providerHealth?.url || 'Provider health URL not configured'}
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-xl px-3 py-2"
              style={{ background: providerHealth?.ok ? 'rgba(var(--success-rgb),0.08)' : 'rgba(248,113,113,0.08)', border: `1px solid ${providerHealth?.ok ? 'rgba(var(--success-rgb),0.2)' : 'rgba(248,113,113,0.2)'}` }}>
              <span className="h-2 w-2 rounded-full" style={{ background: providerHealth?.ok ? 'var(--success)' : '#f87171' }} />
              <span className="text-xs font-semibold" style={{ color: providerHealth?.ok ? 'var(--success)' : '#f87171' }}>
                {providerHealth?.ok ? `${providerHealth.latencyMs ?? 0}ms` : 'Unhealthy'}
              </span>
            </div>
          </div>
          {providerHealth?.error && (
            <div className="px-5 pb-4">
              <p className="rounded-xl px-3 py-2 text-xs" style={{ color: '#f87171', background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.16)' }}>
                {providerHealth.error}
              </p>
            </div>
          )}
        </Section>

        {/* Sign out */}
        <Section title="Session">
          <div className="px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-ink-200">Sign out</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                {user?.email}
              </p>
            </div>
            <button onClick={async () => { await logout(); navigate('/') }}
              className="btn-ghost text-sm py-1.5 px-4 text-ink-600 hover:text-red-400">
              Sign out
            </button>
          </div>
        </Section>

      </main>

      {/* Custom domain project picker */}
      {domainPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
          style={{ background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(14px)' }}>
          <div className="w-full max-w-lg overflow-hidden rounded-2xl animate-scale-in"
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--line)',
              boxShadow: '0 32px 100px rgba(0,0,0,0.72)',
            }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--line)' }}>
              <div>
                <h3 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Choose project</h3>
                <p className="mt-0.5 text-xs" style={{ color: 'var(--muted)' }}>Custom domains can only be added to live web-apps.</p>
              </div>
              <button
                type="button"
                onClick={() => setDomainPickerOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-xl"
                style={{ background: 'color-mix(in srgb, var(--panel-2) 72%, transparent)', border: '1px solid var(--line)', color: 'var(--muted)' }}
                aria-label="Close project picker">
                <svg width="13" height="13" viewBox="0 0 12 12" fill="none">
                  <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto p-3">
              {sites.length === 0 ? (
                <div className="rounded-2xl px-4 py-8 text-center"
                  style={{ background: 'color-mix(in srgb, var(--panel-2) 58%, transparent)', border: '1px solid var(--line)' }}>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-soft)' }}>No live web-apps yet</p>
                  <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>Deploy a project first, then connect a custom domain.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {sites.map(site => {
                    const count = domains.filter(domain => domain.siteId === site.id).length
                    const selected = site.id === domainSiteId
                    return (
                      <button
                        key={site.id}
                        type="button"
                        onClick={() => openDomainProject(site.id)}
                        className="flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left transition-all"
                        style={{
                          background: selected ? 'rgba(var(--accent-rgb, var(--brand-600-rgb)),0.1)' : 'color-mix(in srgb, var(--panel-2) 62%, transparent)',
                          border: `1px solid ${selected ? 'rgba(var(--accent-rgb, var(--brand-400-rgb)),0.28)' : 'var(--line)'}`,
                        }}>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold" style={{ color: 'var(--text-soft)' }}>{site.title}</p>
                          <p className="mt-0.5 truncate font-mono text-xs" style={{ color: 'var(--muted)' }}>
                            {site.mnsName}.{mnsPublicDomain}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-xl px-2.5 py-1 text-xs font-semibold"
                          style={{ color: 'var(--muted)', background: 'color-mix(in srgb, var(--panel) 78%, transparent)', border: '1px solid var(--line)' }}>
                          {count} domain{count === 1 ? '' : 's'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {claimConfirmSite && user?.massaAddress && (
        <ClaimOwnershipModal
          mode="confirm"
          site={claimConfirmSite}
          walletAddress={user.massaAddress}
          onClose={() => setClaimConfirmSite(null)}
          onConfirm={() => claimOwnership(claimConfirmSite)}
        />
      )}

      {claimStatus && (
        <ClaimOwnershipModal
          mode={claimStatus.tone}
          site={claimStatus.site}
          walletAddress={user?.massaAddress || undefined}
          title={claimStatus.title}
          text={claimStatus.text}
          onClose={() => setClaimStatus(null)}
        />
      )}

      {/* New wallet modal */}
      {newWallet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
          style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(12px)' }}>
          <div className="w-full max-w-md rounded-2xl overflow-hidden animate-scale-in"
            style={{
              background: 'var(--panel)',
              border: '1px solid var(--line)',
              boxShadow: '0 32px 100px rgba(0,0,0,0.8)',
            }}>

            {/* Header */}
            <div className="px-6 py-5" style={{ borderBottom: '1px solid var(--line)' }}>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(var(--success-rgb),0.1)', border: '1px solid rgba(var(--success-rgb),0.22)' }}>
                  <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-ink-50">Wallet created</h3>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>Save your private key — shown once only</p>
                </div>
              </div>
            </div>

            <div className="px-6 py-5 space-y-4">
              {/* Warning */}
              <div className="flex gap-3 px-4 py-3 rounded-xl"
                style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)' }}>
                <span className="text-yellow-400 text-sm flex-shrink-0">⚠</span>
                <p className="text-xs leading-relaxed" style={{ color: 'rgba(251,191,36,0.8)' }}>
                  Never share your private key. Anyone with it has full control of your wallet and any funds inside.
                </p>
              </div>

              {/* Address */}
              <div>
                <p className="text-xs mb-2 font-medium" style={{ color: 'var(--muted)' }}>PUBLIC ADDRESS</p>
                <div className="px-3.5 py-2.5 rounded-xl font-mono text-xs text-ink-200 break-all select-all"
                  style={{ background: 'color-mix(in srgb, var(--panel-2) 76%, transparent)', border: '1px solid var(--line)' }}>
                  {newWallet.address}
                </div>
              </div>

              {/* Private key */}
              <div>
                <p className="text-xs mb-2 font-medium" style={{ color: 'var(--muted)' }}>PRIVATE KEY</p>
                <div className="relative">
                  <div className="px-3.5 py-2.5 pr-20 rounded-xl font-mono text-xs text-ink-200 break-all select-all"
                    style={{ background: 'color-mix(in srgb, var(--panel-2) 76%, transparent)', border: '1px solid var(--line)' }}>
                    {newWallet.privateKey}
                  </div>
                  <button onClick={copyKey}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs py-1.5 px-3 rounded-lg font-medium transition-all duration-200"
                    style={{
                      background: keyCopied ? 'rgba(var(--success-rgb),0.15)' : 'color-mix(in srgb, var(--panel-2) 76%, transparent)',
                      border: keyCopied ? '1px solid rgba(var(--success-rgb),0.3)' : '1px solid var(--line)',
                      color: keyCopied ? 'var(--success)' : 'var(--muted)',
                    }}>
                    {keyCopied ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              <button onClick={() => setNewWallet(null)} className="btn-primary w-full py-3 text-sm">
                I've saved my private key
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ClaimOwnershipModal({
  mode,
  site,
  walletAddress,
  title,
  text,
  onClose,
  onConfirm,
}: {
  mode: 'confirm' | 'running' | 'success' | 'error'
  site: Site
  walletAddress?: string
  title?: string
  text?: string
  onClose: () => void
  onConfirm?: () => void
}) {
  const isConfirm = mode === 'confirm'
  const isRunning = mode === 'running'
  const isSuccess = mode === 'success'
  const isError = mode === 'error'
  const heading = title || 'Claim site ownership'
  const body = text || 'Transfer this MNS name from CtrlPoint to your Massa wallet.'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(14px)' }}>
      <div className="w-full max-w-lg overflow-hidden rounded-2xl animate-scale-in"
        style={{ background: 'var(--panel)', border: '1px solid var(--line)', boxShadow: '0 32px 100px rgba(0,0,0,0.72)' }}>
        <div className="flex items-start justify-between gap-4 px-5 py-4" style={{ borderBottom: '1px solid var(--line)' }}>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
              style={{
                color: isError ? '#f87171' : isSuccess ? 'var(--success)' : 'var(--text-soft)',
                background: isError ? 'rgba(248,113,113,0.08)' : isSuccess ? 'rgba(var(--success-rgb),0.1)' : 'color-mix(in srgb, var(--panel-2) 72%, transparent)',
                border: `1px solid ${isError ? 'rgba(248,113,113,0.18)' : isSuccess ? 'rgba(var(--success-rgb),0.22)' : 'var(--line)'}`,
              }}>
              {isRunning ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : isSuccess ? (
                <svg width="17" height="17" viewBox="0 0 14 14" fill="none">
                  <path d="M3 7.2l2.4 2.4L11 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : isError ? (
                <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
                  <path d="M4 4l6 6M10 4l-6 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
                </svg>
              ) : (
                <svg width="17" height="17" viewBox="0 0 16 16" fill="none">
                  <path d="M8 1.8l5 2v3.7c0 3.1-2.1 5.3-5 6.7-2.9-1.4-5-3.6-5-6.7V3.8l5-2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            <div>
              <h3 className="text-sm font-bold" style={{ color: 'var(--text)' }}>{heading}</h3>
              <p className="mt-1 text-xs leading-5" style={{ color: 'var(--muted)' }}>
                {isConfirm
                  ? 'This is an on-chain transfer. After it succeeds, CtrlPoint can no longer update this MNS record or run GitHub auto-deploys for it.'
                  : body}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
            style={{ background: 'color-mix(in srgb, var(--panel-2) 72%, transparent)', border: '1px solid var(--line)', color: 'var(--muted)' }}
            aria-label="Close ownership modal">
            <svg width="13" height="13" viewBox="0 0 12 12" fill="none">
              <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="space-y-3 px-5 py-5">
          <div className="rounded-xl px-3 py-3" style={{ background: 'color-mix(in srgb, var(--panel-2) 62%, transparent)', border: '1px solid var(--line)' }}>
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--muted-2)' }}>Site</p>
            <p className="mt-1 break-all font-mono text-xs" style={{ color: 'var(--text-soft)' }}>{site.mnsName}.{mnsPublicDomain}</p>
          </div>
          {walletAddress && (
            <div className="rounded-xl px-3 py-3" style={{ background: 'color-mix(in srgb, var(--panel-2) 62%, transparent)', border: '1px solid var(--line)' }}>
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--muted-2)' }}>Transfer to</p>
              <p className="mt-1 break-all font-mono text-xs" style={{ color: 'var(--text-soft)' }}>{walletAddress}</p>
            </div>
          )}
          {isConfirm && (
            <div className="rounded-xl px-3 py-3" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)' }}>
              <p className="text-xs leading-5" style={{ color: 'color-mix(in srgb, #fbbf24 82%, var(--text))' }}>
                Only claim ownership if you want to manage this MNS name outside CtrlPoint. Future platform redeploys, GitHub auto-deploys, and rollbacks for this site will be disabled.
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 px-5 pb-5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold"
            style={{ color: 'var(--text-soft)', background: 'color-mix(in srgb, var(--panel-2) 72%, transparent)', border: '1px solid var(--line)' }}>
            {isRunning ? 'Close, keep running' : 'Close'}
          </button>
          {isConfirm && onConfirm && (
            <button
              type="button"
              onClick={onConfirm}
              className="btn-primary px-4 py-2.5 text-sm">
              Confirm transfer
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function formatLongDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const day = date.getDate()
  const suffix = day % 10 === 1 && day % 100 !== 11 ? 'st'
    : day % 10 === 2 && day % 100 !== 12 ? 'nd'
    : day % 10 === 3 && day % 100 !== 13 ? 'rd'
    : 'th'
  const month = date.toLocaleString('en-US', { month: 'long' }).toLowerCase()
  return `${day}${suffix} ${month} ${date.getFullYear()}`
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function domainMessageStyle(tone: DomainMessage['tone']) {
  if (tone === 'success') {
    return {
      className: 'text-emerald-400',
      style: {
        background: 'rgba(var(--success-rgb),0.07)',
        border: '1px solid rgba(var(--success-rgb),0.16)',
      },
    }
  }
  if (tone === 'pending') {
    return {
      className: '',
      style: {
        color: 'var(--text-soft)',
        background: 'color-mix(in srgb, var(--panel-2) 72%, transparent)',
        border: '1px solid var(--line)',
      },
    }
  }
  return {
    className: 'text-red-400',
    style: {
      background: 'rgba(248,113,113,0.07)',
      border: '1px solid rgba(248,113,113,0.16)',
    },
  }
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 14 14"
      fill="none"
      className="transition-transform duration-150"
      style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>
      <path d="M3.5 5.5L7 9l3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}

function DomainStatusBadge({ status }: { status: string }) {
  const meta = customDomainStatusMeta(status)
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-bold"
      style={{
        color: meta.color,
        background: meta.bg,
        border: `1px solid ${meta.border}`,
      }}>
      {meta.icon === 'check' && (
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
          <path d="M3 7.2l2.4 2.4L11 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
      {meta.label}
    </span>
  )
}

function customDomainStatusMeta(status: string) {
  if (status === 'ACTIVE') {
    return {
      label: 'ACTIVE',
      icon: 'check',
      color: 'var(--success)',
      bg: 'rgba(var(--success-rgb),0.08)',
      border: 'rgba(var(--success-rgb),0.18)',
    }
  }
  if (status === 'DNS_READY') {
    return {
      label: 'DNS PROPAGATING',
      icon: 'pending',
      color: 'var(--text-soft)',
      bg: 'color-mix(in srgb, var(--panel) 76%, transparent)',
      border: 'var(--line)',
    }
  }
  if (status === 'TLS_ISSUING') {
    return {
      label: 'TLS ISSUING',
      icon: 'pending',
      color: 'var(--text-soft)',
      bg: 'color-mix(in srgb, var(--panel) 76%, transparent)',
      border: 'var(--line)',
    }
  }
  if (status === 'DEGRADED') {
    return {
      label: 'DEGRADED',
      icon: 'warning',
      color: '#f87171',
      bg: 'rgba(248,113,113,0.08)',
      border: 'rgba(248,113,113,0.18)',
    }
  }
  return {
    label: 'NEEDS DNS',
    icon: 'pending',
    color: 'var(--muted)',
    bg: 'color-mix(in srgb, var(--panel) 76%, transparent)',
    border: 'var(--line)',
  }
}

function CustomDomainDiagnostics({ checks, status }: { checks?: CustomDomainCheck[]; status: string }) {
  const [open, setOpen] = useState(false)
  const inferred = checks?.length ? checks : inferredChecksForStatus(status)
  if (inferred.length === 0) return null
  const passed = inferred.filter(check => check.ok).length
  const pending = inferred.filter(check => check.pending).length
  const failed = inferred.length - passed - pending
  return (
    <div className="mt-3 overflow-hidden rounded-xl" style={{ background: 'color-mix(in srgb, var(--panel) 76%, transparent)', border: '1px solid var(--line)' }}>
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>Checks</p>
          <p className="mt-1 text-xs" style={{ color: failed > 0 ? '#f87171' : pending > 0 ? 'var(--muted)' : 'var(--success)' }}>
            {passed}/{inferred.length} passed{pending > 0 ? `, ${pending} pending` : ''}{failed > 0 ? `, ${failed} needs attention` : ''}
          </p>
        </div>
        <Chevron open={open} />
      </button>
      {open && (
        <div className="space-y-2 px-3 pb-3">
          {inferred.map(check => (
            <div key={check.key} className="flex items-start gap-2">
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                style={{
                  color: check.ok ? 'var(--success)' : check.pending ? 'var(--muted)' : '#f87171',
                  background: check.ok ? 'rgba(var(--success-rgb),0.1)' : check.pending ? 'color-mix(in srgb, var(--panel-2) 72%, transparent)' : 'rgba(248,113,113,0.08)',
                  border: `1px solid ${check.ok ? 'rgba(var(--success-rgb),0.22)' : check.pending ? 'var(--line)' : 'rgba(248,113,113,0.18)'}`,
                }}>
                {check.ok ? (
                  <svg width="10" height="10" viewBox="0 0 14 14" fill="none">
                    <path d="M3 7.2l2.4 2.4L11 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'currentColor' }} />
                )}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold" style={{ color: 'var(--text-soft)' }}>{check.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function inferredChecksForStatus(status: string): CustomDomainCheck[] {
  if (status === 'ACTIVE') {
    return [
      { key: 'ownership', label: 'TXT ownership', ok: true, detail: 'Ownership verified.' },
      { key: 'routing', label: 'Routing DNS', ok: true, detail: 'DNS is routed to CtrlPoint.' },
      { key: 'tls', label: 'TLS certificate', ok: true, detail: 'HTTPS certificate is ready.' },
      { key: 'provider', label: 'Provider reachable', ok: true, detail: 'Provider is serving the site.' },
    ]
  }
  if (status === 'DNS_READY' || status === 'TLS_ISSUING') {
    return [
      { key: 'ownership', label: 'TXT ownership', ok: true, detail: 'Ownership verified.' },
      { key: 'routing', label: 'Routing DNS', ok: status !== 'DNS_READY', pending: status === 'DNS_READY', detail: status === 'DNS_READY' ? 'DNS is still propagating.' : 'DNS is routed to CtrlPoint.' },
      { key: 'tls', label: 'TLS certificate', ok: false, pending: true, detail: 'HTTPS certificate is being issued.' },
      { key: 'provider', label: 'Provider reachable', ok: false, pending: true, detail: 'Provider reachability will be checked after TLS is ready.' },
    ]
  }
  return []
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="animate-slide-up">
      <p className="text-xs font-semibold mb-3 uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
        {title}
      </p>
      <div className="rounded-2xl overflow-hidden"
        style={{ background: 'color-mix(in srgb, var(--panel) 82%, transparent)', border: '1px solid var(--line)' }}>
        {children}
      </div>
    </div>
  )
}

function DnsRecord({ label, type, name, value, zoneDomain }: { label: string; type: string; name: string; value: string; zoneDomain?: string }) {
  const [copied, setCopied] = useState<string | null>(null)
  const host = zoneDomain ? dnsPanelHost(name, zoneDomain) : name

  const copy = async (copyValue: string, key: string) => {
    await navigator.clipboard.writeText(copyValue)
    setCopied(key)
    setTimeout(() => setCopied(current => current === key ? null : current), 1600)
  }

  return (
    <div className="mt-2 rounded-xl px-3 py-3" style={{ background: 'color-mix(in srgb, var(--panel) 78%, transparent)', border: '1px solid var(--line)' }}>
      <div className="mb-2 flex items-center gap-2">
        <p className="text-xs font-semibold" style={{ color: 'var(--text-soft)' }}>{label}</p>
      </div>
      <div className="space-y-2">
        <DnsRecordLine label="Type" value={type} copied={copied === 'type'} onCopy={() => copy(type, 'type')} />
        <DnsRecordLine label="Host" value={host} copied={copied === 'host'} onCopy={() => copy(host, 'host')} />
        <DnsRecordLine label="Value" value={value} copied={copied === 'value'} onCopy={() => copy(value, 'value')} />
      </div>
    </div>
  )
}

function dnsPanelHost(recordName: string, customDomain: string) {
  const record = recordName.replace(/\.$/, '').toLowerCase()
  const domain = customDomain.replace(/\.$/, '').toLowerCase()
  const labels = domain.split('.')
  if (labels.length < 2) return recordName

  const zone = labels.slice(-2).join('.')
  if (record === zone) return '@'
  if (record.endsWith(`.${zone}`)) return record.slice(0, -(zone.length + 1)) || '@'
  return recordName
}

function isApexDomain(domain: string) {
  const labels = domain.replace(/\.$/, '').split('.').filter(Boolean)
  return labels.length === 2
}

function companionDomain(domain: string) {
  const normalized = domain.replace(/\.$/, '').toLowerCase()
  if (!normalized || normalized.split('.').length < 2) return null
  if (isApexDomain(normalized)) return `www.${normalized}`
  return null
}

function DnsRecordLine({ label, value, copied, onCopy }: { label: string; value: string; copied: boolean; onCopy: () => void }) {
  return (
    <div className="rounded-lg px-2.5 py-2" style={{ background: 'color-mix(in srgb, var(--panel-2) 56%, transparent)', border: '1px solid var(--line)' }}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--muted-2)' }}>{label}</span>
        <button
          type="button"
          onClick={onCopy}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-all"
          style={{
            color: copied ? 'var(--success)' : 'var(--muted)',
            background: copied ? 'rgba(var(--success-rgb),0.1)' : 'color-mix(in srgb, var(--panel) 72%, transparent)',
            border: `1px solid ${copied ? 'rgba(var(--success-rgb),0.22)' : 'var(--line)'}`,
          }}
          aria-label={`Copy ${label.toLowerCase()}`}>
          {copied ? (
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M3 7.2l2.4 2.4L11 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
              <path d="M5 4.5V3.2A1.2 1.2 0 016.2 2h4.1a1.2 1.2 0 011.2 1.2v4.1a1.2 1.2 0 01-1.2 1.2H9M3.7 5.5h4.1A1.2 1.2 0 019 6.7v4.1A1.2 1.2 0 017.8 12H3.7a1.2 1.2 0 01-1.2-1.2V6.7a1.2 1.2 0 011.2-1.2z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
          )}
        </button>
      </div>
      <p className="break-all font-mono text-[11px] leading-5 sm:text-xs" style={{ color: 'var(--text-soft)' }}>{value}</p>
    </div>
  )
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="px-5 py-4 flex items-center justify-between gap-4">
      <p className="text-xs font-medium" style={{ color: 'var(--muted)' }}>{label.toUpperCase()}</p>
      <p className="text-sm text-ink-300 truncate">{value || '—'}</p>
    </div>
  )
}
