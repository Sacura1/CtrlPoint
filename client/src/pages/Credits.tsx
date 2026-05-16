import { useEffect, useMemo, useState } from 'react'
import Header from '../components/Header'
import { billing as billingApi } from '../api'
import { useAuth } from '../store/auth'
import { CreditPackage } from '../types'

const FEATURED_PACKAGE = 'pro'

function packageTone(id: string) {
  if (id === 'starter') return { label: 'Starter', accent: '#60a5fa', bg: 'rgba(96,165,250,0.1)', border: 'rgba(96,165,250,0.22)' }
  if (id === 'builder') return { label: 'Popular', accent: '#a78bfa', bg: 'rgba(167,139,250,0.12)', border: 'rgba(167,139,250,0.28)' }
  if (id === 'pro') return { label: 'Best value', accent: '#34d399', bg: 'rgba(52,211,153,0.1)', border: 'rgba(52,211,153,0.24)' }
  return { label: 'Scale', accent: '#fbbf24', bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.22)' }
}

function formatMoney(value: number) {
  return `$${value.toFixed(2)}`
}

export default function Credits() {
  const { user } = useAuth()
  const [packages, setPackages] = useState<CreditPackage[]>([])
  const [loading, setLoading] = useState(true)
  const [checkoutId, setCheckoutId] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    billingApi.packages()
      .then(({ packages }) => setPackages(packages))
      .catch((err: any) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const starterRate = useMemo(() => {
    const starter = packages.find(pkg => pkg.id === 'starter')
    return starter ? starter.priceUsd / starter.credits : 0
  }, [packages])

  const startCheckout = async (packageId: string) => {
    setCheckoutId(packageId)
    setError('')
    try {
      const { url } = await billingApi.checkout(packageId)
      window.location.href = url
    } catch (err: any) {
      setError(err.message)
      setCheckoutId(null)
    }
  }

  return (
    <div className="min-h-dvh" style={{ background: '#05050d' }}>
      <Header />

      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-12%] left-[18%] w-[620px] h-[360px] opacity-08 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.35) 0%, transparent 70%)', filter: 'blur(100px)' }} />
        <div className="absolute bottom-[-18%] right-[12%] w-[560px] h-[340px] opacity-08 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(52,211,153,0.18) 0%, transparent 70%)', filter: 'blur(110px)' }} />
      </div>

      <main className="relative z-10 mx-auto w-full max-w-[100vw] sm:max-w-5xl px-3 sm:px-6 py-7 sm:py-10 animate-fade-in overflow-x-hidden">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-7">
          <div>
            <p className="text-xs font-semibold mb-3 uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.32)' }}>
              Billing
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold text-ink-50">Top up credits</h1>
            <p className="text-sm mt-2 max-w-xl" style={{ color: '#8888aa' }}>
              Credits power platform AI generations, edits, and premium short MNS names.
            </p>
          </div>

          <div className="rounded-2xl px-4 py-3 min-w-[180px]"
            style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(167,139,250,0.24)', boxShadow: '0 1px 0 rgba(255,255,255,0.06) inset' }}>
            <p className="text-xs font-medium" style={{ color: 'rgba(196,181,253,0.7)' }}>Current balance</p>
            <div className="flex items-end gap-2 mt-1">
              <span className="text-3xl font-bold text-brand-400 tabular-nums">{user?.credits ?? 0}</span>
              <span className="text-xs mb-1" style={{ color: 'rgba(196,181,253,0.72)' }}>credits</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-5 px-4 py-3 rounded-xl text-sm text-red-300"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)' }}>
            {error}
          </div>
        )}

        <div className="grid gap-5 items-start min-w-0">
          <section className="rounded-2xl overflow-hidden min-w-0"
            style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="px-4 sm:px-5 py-4 flex items-center justify-between gap-4"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div>
                <p className="text-sm font-semibold text-ink-100">Credit packs</p>
                <p className="text-xs mt-1" style={{ color: '#8888aa' }}>One-time purchase. No subscription.</p>
              </div>
              <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <span className="w-2 h-2 rounded-full" style={{ background: '#34d399' }} />
                <span className="text-xs font-medium" style={{ color: '#c8c8e0' }}>Secure checkout by Polar</span>
              </div>
            </div>

            <div className="p-3 sm:p-5">
              {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 min-w-0">
                  {[0, 1, 2, 3].map(i => <div key={i} className="skeleton h-48 rounded-2xl" />)}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 min-w-0">
                  {packages.map(pkg => {
                    const tone = packageTone(pkg.id)
                    const rate = pkg.priceUsd / pkg.credits
                    const savings = starterRate > 0 && rate < starterRate
                      ? Math.round((1 - rate / starterRate) * 100)
                      : 0
                    const featured = pkg.id === FEATURED_PACKAGE

                    return (
                      <button key={pkg.id} onClick={() => startCheckout(pkg.id)} disabled={checkoutId === pkg.id}
                        className="group relative block w-full max-w-full min-w-0 text-left rounded-2xl p-4 sm:p-5 transition-all duration-200 overflow-hidden disabled:cursor-wait"
                        style={{
                          background: featured ? 'rgba(52,211,153,0.065)' : 'rgba(255,255,255,0.035)',
                          border: `1px solid ${featured ? 'rgba(52,211,153,0.3)' : 'rgba(255,255,255,0.09)'}`,
                          boxShadow: featured ? '0 0 0 1px rgba(52,211,153,0.08), 0 16px 50px rgba(0,0,0,0.28)' : '0 1px 0 rgba(255,255,255,0.04) inset',
                        }}>
                        <div className="absolute inset-x-0 top-0 h-px opacity-80"
                          style={{ background: `linear-gradient(90deg, transparent, ${tone.accent}, transparent)` }} />

                        <div className="flex items-start justify-between gap-3 min-w-0">
                          <div className="min-w-0">
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold"
                              style={{ color: tone.accent, background: tone.bg, border: `1px solid ${tone.border}` }}>
                              {tone.label}
                            </span>
                            <p className="text-base sm:text-lg font-bold text-ink-50 mt-3 truncate">{pkg.name}</p>
                          </div>
                          {savings > 0 && (
                            <span className="text-[11px] font-bold px-2 py-1 rounded-lg"
                              style={{ color: '#34d399', background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.18)' }}>
                              Save {savings}%
                            </span>
                          )}
                        </div>

                        <div className="mt-5">
                          <div className="flex items-end gap-2 min-w-0">
                            <span className="text-3xl sm:text-4xl font-bold text-ink-50 tabular-nums break-all">{pkg.credits.toLocaleString()}</span>
                            <span className="text-sm mb-1.5" style={{ color: '#8888aa' }}>credits</span>
                          </div>
                          <div className="flex items-center justify-between gap-3 mt-4 pt-4 min-w-0"
                            style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                            <div className="min-w-0">
                              <p className="text-xl sm:text-2xl font-bold text-brand-400">{formatMoney(pkg.priceUsd)}</p>
                              <p className="text-xs mt-1" style={{ color: '#8888aa' }}>
                                {(rate * 100).toFixed(1)} cents per credit
                              </p>
                            </div>
                            <span className="btn-primary px-3 sm:px-4 py-2 text-xs flex-shrink-0">
                              {checkoutId === pkg.id ? 'Opening...' : 'Buy'}
                            </span>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </section>

          <aside className="min-w-0">
            <section className="rounded-2xl p-4 sm:p-5"
              style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <p className="text-sm font-semibold text-ink-100">What credits cover</p>
              <div className="mt-4 grid sm:grid-cols-3 gap-3">
                {[
                  ['AI builds', 'Platform AI generations and edits use model-based credits.'],
                  ['Short names', '6+ character MNS names are free. Shorter names use credits.'],
                  ['No expiry', 'Purchased credits stay on your account.'],
                ].map(([title, body]) => (
                  <div key={title} className="flex gap-3">
                    <div className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(167,139,250,0.18)' }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#a78bfa' }} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-ink-100">{title}</p>
                      <p className="text-xs mt-0.5 leading-relaxed" style={{ color: '#8888aa' }}>{body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </main>
    </div>
  )
}
