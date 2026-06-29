import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import ThemeToggle from '../components/ThemeToggle'
import { AgentAnalytics as AgentAnalyticsPayload, publicAgentAnalytics } from '../api'

function formatUsd(value: number) {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: value > 0 && value < 1 ? 3 : 2, maximumFractionDigits: 4 })}`
}

function formatPaymentAmount(value: string | null) {
  if (!value) return 'USDC'
  const raw = value.trim()
  const match = raw.match(/([0-9]+(?:\.[0-9]+)?)/)
  if (!match) return raw
  if (!raw.includes('$') && /^[0-9]+$/.test(match[1])) {
    const usdc = Number(match[1]) / 1_000_000
    return `${usdc.toLocaleString(undefined, { minimumFractionDigits: usdc > 0 && usdc < 1 ? 3 : 2, maximumFractionDigits: 6 })} USDC`
  }
  return raw.replace(/^\$/, '') + ' USDC'
}

function formatSeconds(value: number | null) {
  if (value === null) return 'No complete deploys yet'
  if (value < 60) return `${value}s`
  const minutes = Math.floor(value / 60)
  const seconds = value % 60
  return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function statusLabel(status: string) {
  if (status === 'delivered') return 'Delivered'
  if (status === 'failed') return 'Failed'
  if (status === 'superseded') return 'Superseded'
  return 'Processing'
}

function statusClass(status: string) {
  if (status === 'delivered') return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
  if (status === 'failed') return 'border-red-400/20 bg-red-400/10 text-red-400'
  return 'border-white/10 bg-white/[0.04] text-[var(--text-soft)]'
}

function explorerAddress(base: string | undefined, address: string | null) {
  if (!base || !address || !/^0x[a-fA-F0-9]{40}$/.test(address)) return null
  return `${base.replace(/\/+$/, '')}/address/${address}`
}

export default function AgentAnalytics() {
  const [data, setData] = useState<AgentAnalyticsPayload | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    publicAgentAnalytics.get()
      .then(payload => { if (live) setData(payload) })
      .catch(err => { if (live) setError(err instanceof Error ? err.message : 'Could not load analytics.') })
    return () => { live = false }
  }, [])

  const maxDaily = useMemo(() => {
    return Math.max(1, ...(data?.daily || []).map(day => day.deployments))
  }, [data])

  return (
    <div className="min-h-dvh bg-[var(--bg)] text-[var(--text)]">
      <header className="sticky top-0 z-30 border-b border-white/10 backdrop-blur-xl" style={{ background: 'color-mix(in srgb, var(--bg) 90%, transparent)' }}>
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <Link to="/" aria-label="CtrlPoint home">
            <img src="/logo.png" className="brand-logo-dark h-7 w-auto" alt="CtrlPoint" />
            <img src="/logo-black.png" className="brand-logo-light h-7 w-auto" alt="CtrlPoint" />
          </Link>
          <nav className="flex items-center gap-2">
            <ThemeToggle compact />
            <Link to="/agents" className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-[var(--muted)] transition hover:text-[var(--text)] sm:inline-flex">
              Agent API
            </Link>
            <Link to="/auth" className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-[var(--text-soft)] transition hover:bg-white/[0.08] sm:px-4">
              Open app
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12">
        <section className="grid gap-6 lg:grid-cols-[0.74fr_1.26fr] lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--muted)]">Public Arc proof ledger</p>
            <h1 className="mt-4 max-w-3xl text-[2.35rem] font-black leading-[1.02] tracking-normal sm:text-5xl">
              Agent deploys, paid by x402 and verified on Arc.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--muted)] sm:text-lg">
              A public view of CtrlPoint AI-agent deploys: payer wallet, delivery status, USDC amount, and Arcscan proof transaction.
            </p>
          </div>

          <div className="rounded-[8px] border border-white/10 bg-[var(--panel)] p-4 sm:p-5 shadow-2xl shadow-black/20">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--muted)]">14-day activity</p>
                <p className="mt-1 text-sm text-[var(--text-soft)]">{data ? `Last updated ${formatDate(data.generatedAt)}` : 'Loading public ledger data'}</p>
              </div>
              {data?.proofContract && (
                <a href={`${data.explorerUrl}/address/${data.proofContract}`} target="_blank" rel="noopener noreferrer"
                  className="shrink-0 rounded-xl border border-white/10 px-3 py-2 text-xs font-bold text-[var(--brand-300)] transition hover:bg-white/[0.06]">
                  Arcscan contract
                </a>
              )}
            </div>
            <div className="flex h-28 items-end gap-1.5 border-t border-white/10 pt-4">
              {(data?.daily || Array.from({ length: 14 }, (_, index) => ({ date: String(index), deployments: 0, delivered: 0, volumeUsd: 0 }))).map(day => (
                <div key={day.date} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-2">
                  <div
                    className="w-full rounded-t-[3px] border border-emerald-400/20 bg-emerald-400/20 transition group-hover:bg-emerald-400/35"
                    style={{ height: `${Math.max(8, (day.deployments / maxDaily) * 86)}px` }}
                    title={`${day.date}: ${day.deployments} deploys, ${formatUsd(day.volumeUsd)}`}
                  />
                </div>
              ))}
            </div>
          </div>
        </section>

        {error && (
          <div className="mt-8 rounded-[8px] border border-red-400/20 bg-red-400/10 p-4 text-sm font-semibold text-red-400">
            {error}
          </div>
        )}

        <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Metric label="Paid requests" value={data ? data.stats.totalDeployments.toLocaleString() : '...'} />
          <Metric label="Delivered" value={data ? data.stats.delivered.toLocaleString() : '...'} />
          <Metric label="USDC volume" value={data ? formatUsd(data.stats.volumeUsd) : '...'} />
          <Metric label="Avg. delivery" value={data ? formatSeconds(data.stats.averageDeploySeconds) : '...'} />
          <Metric label="Onchain proofs" value={data ? data.stats.proofCount.toLocaleString() : '...'} />
        </section>

        <section className="mt-8 grid gap-4 lg:grid-cols-[1fr_0.42fr]">
          <div className="overflow-hidden rounded-[8px] border border-white/10 bg-[var(--panel)]">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-4 sm:px-5">
              <div>
                <h2 className="text-xl font-black">Recent Agent Deploys</h2>
                {/* <p className="mt-1 text-sm text-[var(--muted)]">Payment rows are public. Prompts, source files, and user accounts are not exposed.</p> */}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left">
                <thead className="border-b border-white/10 text-xs uppercase tracking-[0.12em] text-[var(--muted)]">
                  <tr>
                    <th className="px-5 py-3 font-black">Deployment</th>
                    <th className="px-5 py-3 font-black">Status</th>
                    <th className="px-5 py-3 font-black">Payer</th>
                    <th className="px-5 py-3 font-black">Amount</th>
                    <th className="px-5 py-3 font-black">Proof</th>
                    <th className="px-5 py-3 font-black">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {(data?.recent || []).map(row => {
                    const payerUrl = explorerAddress(data?.explorerUrl, row.payer)
                    return (
                    <tr key={row.id} className="transition hover:bg-white/[0.025]">
                      <td className="px-5 py-4 align-top">
                        <div className="max-w-[260px]">
                          <p className="truncate text-sm font-black text-[var(--text)]">{row.mnsName || row.title}</p>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
                            {row.url && <a className="text-[var(--brand-300)] hover:underline" href={row.url} target="_blank" rel="noopener noreferrer">Open site</a>}
                            {row.artifactAddress && <span className="text-[var(--muted)]">artifact {row.artifactAddress.slice(0, 8)}...</span>}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 align-top">
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${statusClass(row.status)}`}>
                          {statusLabel(row.status)}
                        </span>
                      </td>
                      <td className="px-5 py-4 align-top">
                        {payerUrl ? (
                          <a href={payerUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-xs font-bold text-[var(--brand-300)] hover:underline">
                            {row.payerLabel}
                          </a>
                        ) : (
                          <p className="font-mono text-xs font-bold text-[var(--text-soft)]">{row.payerLabel}</p>
                        )}
                        <p className="mt-1 text-xs text-[var(--muted)]">{row.network || 'x402'}</p>
                      </td>
                      <td className="px-5 py-4 align-top">
                        <p className="text-sm font-black text-[var(--text)]">{formatPaymentAmount(row.amount)}</p>
                        {row.paymentExplorerUrl && <a href={row.paymentExplorerUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex text-xs font-bold text-[var(--brand-300)] hover:underline">Arcscan payment</a>}
                      </td>
                      <td className="px-5 py-4 align-top">
                        {row.proofExplorerUrl ? (
                          <a href={row.proofExplorerUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-black text-[var(--brand-300)] hover:underline">Arcscan proof</a>
                        ) : row.proofError ? (
                          <span className="text-xs font-bold text-yellow-400">Pending retry</span>
                        ) : (
                          <span className="text-xs font-bold text-[var(--muted)]">Not recorded</span>
                        )}
                      </td>
                      <td className="px-5 py-4 align-top">
                        <p className="text-xs font-bold text-[var(--text-soft)]">{formatDate(row.createdAt)}</p>
                      </td>
                    </tr>
                    )
                  })}
                  {!data && Array.from({ length: 5 }, (_, index) => (
                    <tr key={index}>
                      <td colSpan={6} className="px-5 py-4">
                        <div className="skeleton h-8 w-full" />
                      </td>
                    </tr>
                  ))}
                  {data && data.recent.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-5 py-10 text-center text-sm font-semibold text-[var(--muted)]">
                        No x402 agent deploys have been recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-[8px] border border-white/10 bg-[var(--panel)] p-5">
              <h2 className="text-lg font-black">Top Payer Wallets</h2>
              <div className="mt-4 space-y-3">
                {(data?.topPayers || []).map(item => {
                  const payerUrl = explorerAddress(data?.explorerUrl, item.payer)
                  return (
                  <div key={item.payer} className="border-b border-white/10 pb-3 last:border-b-0 last:pb-0">
                    <div className="flex items-center justify-between gap-3">
                      {payerUrl ? (
                        <a href={payerUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-xs font-bold text-[var(--brand-300)] hover:underline">{item.label}</a>
                      ) : (
                        <p className="font-mono text-xs font-bold text-[var(--text-soft)]">{item.label}</p>
                      )}
                      <p className="text-sm font-black">{item.deployments}</p>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-[var(--muted)]">{formatUsd(item.volumeUsd)} paid</p>
                  </div>
                  )
                })}
                {!data && <div className="skeleton h-24 w-full" />}
                {data && data.topPayers.length === 0 && <p className="text-sm text-[var(--muted)]">No payer activity yet.</p>}
              </div>
            </div>

            <div className="rounded-[8px] border border-white/10 bg-[var(--panel)] p-5">
              <h2 className="text-lg font-black">Verification</h2>
              <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                x402 handles payment. CtrlPoint records delivered agent deploys on Arc so reviewers can verify the payer, amount, and deployment proof without seeing private prompts or source files.
              </p>
              <div className="mt-4 flex flex-col gap-2">
                {data?.proofContract && (
                  <a href={`${data.explorerUrl}/address/${data.proofContract}`} target="_blank" rel="noopener noreferrer" className="inline-flex w-fit rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-[var(--brand-300)] transition hover:bg-white/[0.06]">
                    Arcscan contract
                  </a>
                )}
                <Link to="/agents" className="inline-flex w-fit rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-[var(--text-soft)] transition hover:bg-white/[0.06]">
                Agent API docs
                </Link>
              </div>
            </div>
          </aside>
        </section>
      </main>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-white/10 bg-[var(--panel)] p-4 sm:p-5">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--muted)]">{label}</p>
      <p className="mt-3 text-2xl font-black tracking-[-0.03em] sm:text-3xl">{value}</p>
    </div>
  )
}
