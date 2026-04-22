import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '../components/Header'
import { auth as authApi, sites as sitesApi, billing as billingApi } from '../api'
import { useAuth } from '../store/auth'
import { Site } from '../types'

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

  const [massaAddress, setMassaAddress] = useState(user?.massaAddress ?? '')
  const [savingAddress, setSavingAddress] = useState(false)
  const [addressMsg, setAddressMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const [generatingWallet, setGeneratingWallet] = useState(false)
  const [newWallet, setNewWallet] = useState<{ address: string; privateKey: string } | null>(null)
  const [keyCopied, setKeyCopied] = useState(false)

  const [sites, setSites] = useState<Site[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [claiming, setClaiming] = useState<string | null>(null)
  const [claimMsg, setClaimMsg] = useState<{ siteId: string; ok: boolean; text: string } | null>(null)

  useEffect(() => {
    sitesApi.list().then(({ sites }) => setSites(sites.filter(s => s.status === 'LIVE')))
    billingApi.history().then(({ transactions }) => setTransactions(transactions))
  }, [])

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

  const claimOwnership = async (site: Site) => {
    if (!user?.massaAddress) {
      setAddressMsg({ ok: false, text: 'Save your Massa address above before claiming ownership.' })
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    setClaiming(site.id)
    setClaimMsg(null)
    try {
      await sitesApi.transferOwnership(site.id)
      setClaimMsg({ siteId: site.id, ok: true, text: 'Ownership transferred to your wallet.' })
    } catch (err: any) {
      setClaimMsg({ siteId: site.id, ok: false, text: err.message })
    } finally {
      setClaiming(null)
    }
  }

  return (
    <div className="min-h-dvh" style={{ background: '#05050d' }}>
      <Header />

      {/* Ambient */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-[30%] w-[500px] h-[300px] opacity-08 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.3) 0%, transparent 70%)', filter: 'blur(100px)' }} />
      </div>

      <main className="relative z-10 max-w-2xl mx-auto px-4 sm:px-6 py-10 space-y-8 animate-fade-in">

        {/* Account */}
        <Section title="Account">
          {/* Email */}
          <Row label="Email" value={user?.email} />

          {/* Massa address */}
          <div className="px-5 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.3)' }}>MASSA WALLET</p>
              {!user?.massaAddress && (
                <button onClick={generateWallet} disabled={generatingWallet}
                  className="text-xs font-medium transition-colors"
                  style={{ color: '#a78bfa' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#c4b5fd')}
                  onMouseLeave={e => (e.currentTarget.style.color = '#a78bfa')}>
                  {generatingWallet ? 'Generating…' : '+ Create wallet'}
                </button>
              )}
            </div>
            <p className="text-xs mb-3" style={{ color: 'rgba(255,255,255,0.2)' }}>
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
          <div className="px-5 py-4 flex items-center justify-between">
            <p className="text-sm text-ink-400">Current balance</p>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl"
              style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.2)' }}>
              <span className="text-xl font-bold text-brand-400 tabular-nums">{user?.credits ?? 0}</span>
              <span className="text-xs text-ink-600">credits</span>
            </div>
          </div>

          {transactions.length > 0 && (
            <div className="px-5 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
              <p className="text-xs font-medium mb-3" style={{ color: 'rgba(255,255,255,0.25)' }}>HISTORY</p>
              <div className="space-y-2.5">
                {transactions.slice(0, 20).map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between text-sm">
                    <span className="text-ink-400 text-xs">{tx.note || tx.type}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-xs tabular-nums" style={{ color: 'rgba(255,255,255,0.2)' }}>
                        {new Date(tx.createdAt).toLocaleDateString()}
                      </span>
                      <span className={`font-mono font-semibold text-xs tabular-nums ${tx.amount > 0 ? 'text-emerald-400' : 'text-ink-600'}`}>
                        {tx.amount > 0 ? '+' : ''}{tx.amount}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Section>

        {/* Ownership */}
        {sites.length > 0 && (
          <Section title="On-chain Ownership">
            <div className="px-5 pb-1 pt-2">
              <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.25)' }}>
                Sites are owned by the CtrlPoint platform wallet. Claim ownership to transfer the MNS domain to your personal address.
              </p>
            </div>
            {sites.map((site, i) => {
              const msg = claimMsg?.siteId === site.id ? claimMsg : null
              return (
                <div key={site.id} className="px-5 py-4"
                  style={{ borderTop: i === 0 ? '1px solid rgba(255,255,255,0.05)' : '1px solid rgba(255,255,255,0.04)' }}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink-100 truncate">{site.title}</p>
                      <p className="text-xs font-mono mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
                        {site.mnsName}.massa.network
                      </p>
                      {site.scAddress && (
                        <p className="text-xs font-mono mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.15)' }}>
                          {site.scAddress.slice(0, 22)}…
                        </p>
                      )}
                    </div>
                    <button onClick={() => claimOwnership(site)}
                      disabled={claiming === site.id || msg?.ok === true}
                      className="text-xs py-1.5 px-3 rounded-lg flex-shrink-0 font-medium transition-all duration-200"
                      style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.2)', color: '#a78bfa' }}
                      onMouseEnter={e => { if (!msg?.ok) e.currentTarget.style.background = 'rgba(124,58,237,0.2)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(124,58,237,0.1)' }}>
                      {claiming === site.id ? 'Transferring…' : msg?.ok ? 'Claimed ✓' : 'Claim ownership'}
                    </button>
                  </div>
                  {msg && (
                    <p className={`text-xs mt-2 ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}</p>
                  )}
                </div>
              )
            })}
          </Section>
        )}

        {/* Sign out */}
        <Section title="Session">
          <div className="px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-ink-200">Sign out</p>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.2)' }}>
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

      {/* New wallet modal */}
      {newWallet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
          style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(12px)' }}>
          <div className="w-full max-w-md rounded-2xl overflow-hidden animate-scale-in"
            style={{
              background: 'rgba(8,8,26,0.98)',
              border: '1px solid rgba(255,255,255,0.1)',
              boxShadow: '0 32px 100px rgba(0,0,0,0.8)',
            }}>

            {/* Header */}
            <div className="px-6 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-center gap-3 mb-1">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                  style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)' }}>
                  <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-ink-50">Wallet created</h3>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Save your private key — shown once only</p>
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
                <p className="text-xs mb-2 font-medium" style={{ color: 'rgba(255,255,255,0.3)' }}>PUBLIC ADDRESS</p>
                <div className="px-3.5 py-2.5 rounded-xl font-mono text-xs text-ink-200 break-all select-all"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  {newWallet.address}
                </div>
              </div>

              {/* Private key */}
              <div>
                <p className="text-xs mb-2 font-medium" style={{ color: 'rgba(255,255,255,0.3)' }}>PRIVATE KEY</p>
                <div className="relative">
                  <div className="px-3.5 py-2.5 pr-20 rounded-xl font-mono text-xs text-ink-200 break-all select-all"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                    {newWallet.privateKey}
                  </div>
                  <button onClick={copyKey}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs py-1.5 px-3 rounded-lg font-medium transition-all duration-200"
                    style={{
                      background: keyCopied ? 'rgba(52,211,153,0.15)' : 'rgba(255,255,255,0.07)',
                      border: keyCopied ? '1px solid rgba(52,211,153,0.3)' : '1px solid rgba(255,255,255,0.1)',
                      color: keyCopied ? '#34d399' : 'rgba(255,255,255,0.6)',
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="animate-slide-up">
      <p className="text-xs font-semibold mb-3 uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.2)' }}>
        {title}
      </p>
      <div className="rounded-2xl overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
        {children}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="px-5 py-4 flex items-center justify-between gap-4">
      <p className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.3)' }}>{label.toUpperCase()}</p>
      <p className="text-sm text-ink-300 truncate">{value || '—'}</p>
    </div>
  )
}
