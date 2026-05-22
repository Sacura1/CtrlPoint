import { useEffect, useState } from 'react'
import Header from '../components/Header'
import { admin as adminApi } from '../api'
import { AdminStatus as AdminStatusData } from '../types'

export default function AdminStatus() {
  const [data, setData] = useState<AdminStatusData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = async (manual = false) => {
    if (manual) setRefreshing(true)
    setError('')
    try {
      setData(await adminApi.status())
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
      if (manual) setRefreshing(false)
    }
  }

  useEffect(() => {
    load()
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg)' }}>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-black" style={{ color: 'var(--text)' }}>Admin Status</h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>Product metrics, health checks, errors, and support inbox.</p>
          </div>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="rounded-xl px-4 py-2 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-70"
            style={{ color: 'var(--text-soft)', background: 'color-mix(in srgb, var(--panel-2) 72%, transparent)', border: '1px solid var(--line)' }}>
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}
          </div>
        ) : error ? (
          <div className="rounded-2xl p-5 text-sm" style={{ color: '#f87171', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.18)' }}>{error}</div>
        ) : data && (
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="DAU" value={data.totals.dau} />
              <Metric label="MAU" value={data.totals.mau} />
              <Metric label="Generated sites" value={data.totals.generatedSites} />
              <Metric label="Live sites" value={data.totals.liveSites} />
              <Metric label="Completed deploys" value={data.totals.completedDeployments} />
              <Metric label="Connected repos" value={data.totals.connectedRepos} />
              <Metric label="Open tickets" value={data.totals.openTickets} />
              <Metric label="Users" value={data.totals.users} />
            </div>

            <Panel title="Endpoint status" subtitle="Live checks for the API process, database query path, and DeWeb provider.">
              <div className="grid gap-2 sm:grid-cols-3">
                {data.endpoints.map(endpoint => (
                  <div key={endpoint.name} className="rounded-xl px-3 py-3"
                    style={{ background: endpoint.ok ? 'rgba(var(--success-rgb),0.07)' : 'rgba(248,113,113,0.08)', border: `1px solid ${endpoint.ok ? 'rgba(var(--success-rgb),0.16)' : 'rgba(248,113,113,0.18)'}` }}>
                    <p className="text-sm font-bold" style={{ color: endpoint.ok ? 'var(--success)' : '#f87171' }}>{endpoint.name}</p>
                    <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>{endpoint.detail}</p>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Top credit owners" subtitle="Users ranked by current credit balance.">
              {data.topCreditOwners.length === 0 ? <Empty text="No users with credits yet." /> : (
                <div className="overflow-hidden rounded-xl" style={{ border: '1px solid var(--line)' }}>
                  <div className="hidden grid-cols-[44px_minmax(0,1fr)_110px_90px_90px_120px] gap-3 px-3 py-2 text-[11px] font-bold uppercase tracking-widest sm:grid"
                    style={{ color: 'var(--muted)', background: 'color-mix(in srgb, var(--panel-2) 70%, transparent)', borderBottom: '1px solid var(--line)' }}>
                    <span>#</span>
                    <span>User</span>
                    <span className="text-right">Credits</span>
                    <span className="text-right">Sites</span>
                    <span className="text-right">Repos</span>
                    <span>Joined</span>
                  </div>
                  <div className="divide-y" style={{ borderColor: 'var(--line)' }}>
                    {data.topCreditOwners.map((owner, index) => (
                      <div key={owner.id} className="grid gap-2 px-3 py-3 text-sm sm:grid-cols-[44px_minmax(0,1fr)_110px_90px_90px_120px] sm:items-center sm:gap-3">
                        <div className="flex items-center justify-between gap-3 sm:block">
                          <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-lg px-2 text-xs font-black tabular-nums"
                            style={{ color: index < 3 ? 'var(--success)' : 'var(--muted)', background: index < 3 ? 'rgba(var(--success-rgb),0.09)' : 'color-mix(in srgb, var(--panel-2) 62%, transparent)', border: `1px solid ${index < 3 ? 'rgba(var(--success-rgb),0.18)' : 'var(--line)'}` }}>
                            {index + 1}
                          </span>
                          <span className="font-mono text-sm font-black tabular-nums sm:hidden" style={{ color: 'var(--text)' }}>{owner.credits.toLocaleString()} credits</span>
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold" style={{ color: 'var(--text-soft)' }}>{owner.email}</p>
                          <p className="mt-0.5 break-all font-mono text-[11px] sm:hidden" style={{ color: 'var(--muted)' }}>{owner.id}</p>
                        </div>
                        <p className="hidden text-right font-mono text-sm font-black tabular-nums sm:block" style={{ color: 'var(--text)' }}>{owner.credits.toLocaleString()}</p>
                        <p className="text-xs sm:text-right sm:text-sm" style={{ color: 'var(--muted)' }}>
                          <span className="sm:hidden">Sites: </span>{owner.sites.toLocaleString()}
                        </p>
                        <p className="text-xs sm:text-right sm:text-sm" style={{ color: 'var(--muted)' }}>
                          <span className="sm:hidden">Repos: </span>{owner.connectedRepos.toLocaleString()}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--muted)' }}>{formatDate(owner.createdAt)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Panel>

            <div className="grid gap-6 lg:grid-cols-3">
              <Panel title="Daily logins" subtitle="Login events recorded per UTC day. DAU/MAU above are unique users.">
                <MiniBars rows={data.daily.logins} emptyText="No login events recorded yet." />
              </Panel>
              <Panel title="Generated Per Day" subtitle="Daily site records created, including AI-generated drafts.">
                <MiniBars rows={data.daily.generatedSites} emptyText="No site creation events in this range." />
              </Panel>
              <Panel title="Deployed Per Day" subtitle="Daily successful deployment completions, including updates and redeploys.">
                <MiniBars rows={data.daily.deployments} emptyText="No completed deployments in this range." />
              </Panel>
            </div>

            <Panel title="Support inbox" subtitle={`${data.totals.openTickets} open of ${data.totals.supportTickets} total tickets.`}>
              <div className="space-y-2">
                {data.recentTickets.length === 0 ? <Empty text="No support tickets." /> : data.recentTickets.map(ticket => (
                  <div key={ticket.id} className="rounded-xl p-3" style={{ background: 'color-mix(in srgb, var(--panel-2) 62%, transparent)', border: '1px solid var(--line)' }}>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="break-words text-sm font-bold" style={{ color: 'var(--text)' }}>{ticket.title}</p>
                        <p className="mt-0.5 break-all text-xs" style={{ color: 'var(--muted)' }}>{ticket.email} · {formatDate(ticket.createdAt)}</p>
                      </div>
                      <button
                        onClick={async () => { await adminApi.updateTicket(ticket.id, ticket.status === 'OPEN' ? 'CLOSED' : 'OPEN'); load() }}
                        className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold"
                        style={{ color: ticket.status === 'OPEN' ? 'var(--success)' : 'var(--muted)', border: '1px solid var(--line)' }}>
                        {ticket.status}
                      </button>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-5" style={{ color: 'var(--text-soft)' }}>{ticket.body}</p>
                  </div>
                ))}
              </div>
            </Panel>

            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title="Recent server errors" subtitle="Unhandled backend errors captured by the API error handler.">
                <div className="space-y-2">
                  {data.recentErrors.length === 0 ? <Empty text="No logged server errors." /> : data.recentErrors.map(err => (
                    <LogRow key={err.id} title={err.message} meta={`${err.statusCode ?? 500} ${err.method ?? ''} ${err.path ?? ''} · ${formatDate(err.createdAt)}`} />
                  ))}
                </div>
              </Panel>

              <Panel title="Failed deployments" subtitle="Latest deployment jobs that ended in FAILED.">
                <div className="space-y-2">
                  {data.failedDeployments.length === 0 ? <Empty text="No failed deployments." /> : data.failedDeployments.map(dep => (
                    <LogRow key={dep.id} title={dep.errorMsg || 'Deployment failed'} meta={`${dep.source} · ${formatDate(dep.updatedAt)} · ${dep.siteId}`} />
                  ))}
                </div>
              </Panel>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: 'color-mix(in srgb, var(--panel) 80%, transparent)', border: '1px solid var(--line)' }}>
      <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>{label}</p>
      <p className="mt-2 text-3xl font-black tabular-nums" style={{ color: 'var(--text)' }}>{value.toLocaleString()}</p>
    </div>
  )
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl p-4" style={{ background: 'color-mix(in srgb, var(--panel) 82%, transparent)', border: '1px solid var(--line)', boxShadow: '0 18px 50px rgba(0,0,0,0.08)' }}>
      <div className="mb-3">
        <h2 className="text-sm font-bold" style={{ color: 'var(--text)' }}>{title}</h2>
        {subtitle && <p className="mt-1 text-xs leading-5" style={{ color: 'var(--muted)' }}>{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}

function MiniBars({ rows, emptyText = 'No data yet.' }: { rows: Array<{ day: string; count: number }>; emptyText?: string }) {
  const max = Math.max(1, ...rows.map(row => row.count))
  const total = rows.reduce((sum, row) => sum + row.count, 0)
  if (rows.length === 0) return <Empty text={emptyText} />
  return (
    <div>
      <div className="mb-3 flex items-center justify-between rounded-xl px-3 py-2"
        style={{ background: 'color-mix(in srgb, var(--panel-2) 62%, transparent)', border: '1px solid var(--line)' }}>
        <span className="text-xs" style={{ color: 'var(--muted)' }}>Last {rows.length} days</span>
        <span className="font-mono text-xs font-bold" style={{ color: 'var(--text-soft)' }}>{total.toLocaleString()} total</span>
      </div>
      <div className="space-y-2">
      {rows.map(row => (
        <div key={row.day} className="grid grid-cols-[118px_1fr_44px] items-center gap-2 text-xs">
          <span style={{ color: 'var(--muted)' }}>{formatDay(row.day)}</span>
          <div className="h-2.5 overflow-hidden rounded-full" style={{ background: 'color-mix(in srgb, var(--panel-2) 70%, transparent)' }}>
            <div className="h-full rounded-full" style={{ width: `${Math.max(4, row.count / max * 100)}%`, background: 'var(--accent, var(--brand-500))' }} />
          </div>
          <span className="text-right font-mono font-bold" style={{ color: 'var(--text-soft)' }}>{row.count}</span>
        </div>
      ))}
      </div>
    </div>
  )
}

function LogRow({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: 'color-mix(in srgb, var(--panel-2) 62%, transparent)', border: '1px solid var(--line)' }}>
      <p className="break-words text-xs font-semibold" style={{ color: 'var(--text-soft)' }}>{title}</p>
      <p className="mt-1 break-all text-[11px]" style={{ color: 'var(--muted)' }}>{meta}</p>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="text-xs" style={{ color: 'var(--muted)' }}>{text}</p>
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function formatDay(value: string) {
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)
}
