import { useState, useEffect, useCallback } from 'react'
import Header from '../components/Header'
import { sites as sitesApi } from '../api'
import { Site, SiteDeployment } from '../types'
import { mnsPublicDomain } from '../utils/siteUrl'

const SOURCE_LABELS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  agent:       { label: 'Agent',       color: '#34d399', bg: 'rgba(52,211,153,0.08)',  border: 'rgba(52,211,153,0.2)'  },
  upload:      { label: 'File Upload', color: '#63b3ed', bg: 'rgba(99,179,237,0.08)',  border: 'rgba(99,179,237,0.2)'  },
  github_push: { label: 'GitHub Push', color: '#a78bfa', bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.2)' },
  github_new:  { label: 'GitHub',      color: '#a78bfa', bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.2)' },
}

function timeAgo(date: string) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function isActive(status: string) {
  return status === 'QUEUED' || status === 'UPLOADING' || status === 'MNS_REGISTERING'
}

export default function Deployments() {
  const [sites, setSites] = useState<Site[]>([])
  const [deployMap, setDeployMap] = useState<Record<string, SiteDeployment[]>>({})
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const loadAll = useCallback(async () => {
    const { sites: s } = await sitesApi.list()
    setSites(s)
    const results = await Promise.all(
      s.map(site =>
        sitesApi.deployments(site.id)
          .then(({ deployments }) => ({ id: site.id, deployments }))
          .catch(() => ({ id: site.id, deployments: [] }))
      )
    )
    const map: Record<string, SiteDeployment[]> = {}
    results.forEach(r => { map[r.id] = r.deployments })
    setDeployMap(map)
  }, [])

  useEffect(() => {
    setLoading(true)
    loadAll().finally(() => setLoading(false))
  }, [loadAll])

  // Poll in the background so GitHub webhook deployments appear without manual refresh.
  // Poll faster while a deployment is active.
  useEffect(() => {
    const hasActive = Object.values(deployMap).flat().some(d => isActive(d.status))
    const iv = setInterval(loadAll, hasActive ? 3000 : 10000)
    return () => clearInterval(iv)
  }, [deployMap, loadAll])

  const sitesWithDeploys = sites.filter(s => (deployMap[s.id]?.length ?? 0) > 0)
  const sitesNoDeploys = sites.filter(s => (deployMap[s.id]?.length ?? 0) === 0)

  return (
    <div className="min-h-dvh" style={{ background: '#05050d' }}>
      <Header />

      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-[30%] w-[500px] h-[300px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.12) 0%, transparent 70%)', filter: 'blur(100px)' }} />
      </div>

      <main className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 py-10 animate-fade-in">

        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: '#f0f0ff' }}>Deployments</h1>
            <p className="mt-1 text-sm" style={{ color: '#8888aa' }}>
              Live activity across all your web-apps.
            </p>
          </div>
          <button onClick={() => { setLoading(true); loadAll().finally(() => setLoading(false)) }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', color: '#8888aa' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#c8c8e0')}
            onMouseLeave={e => (e.currentTarget.style.color = '#8888aa')}>
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M1 7A6 6 0 1 0 3 3.5"/><path d="M1 1v3h3"/>
            </svg>
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="skeleton h-24 rounded-2xl" style={{ animationDelay: `${i * 0.1}s` }} />
            ))}
          </div>
        ) : sites.length === 0 ? (
          <div className="card flex flex-col items-center justify-center py-24 text-center">
            <p className="text-sm font-medium mb-1" style={{ color: '#c8c8e0' }}>No web-apps yet</p>
            <p className="text-xs" style={{ color: '#4a4a6a' }}>Deploy your first web-app to see activity here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sitesWithDeploys.map(site => {
              const deploys = deployMap[site.id] ?? []
              const latest = deploys[0]
              const rest = deploys.slice(1)
              const isOpen = expanded[site.id]
              const hasAnyActive = deploys.some(d => isActive(d.status))

              return (
                <div key={site.id} className="rounded-2xl overflow-hidden"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>

                  {/* Site header */}
                  <div className="flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1 px-4 py-3"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${hasAnyActive ? 'animate-pulse' : ''}`}
                      style={{ background: hasAnyActive ? '#eab308' : site.status === 'LIVE' ? '#34d399' : site.status === 'ERROR' ? '#f87171' : '#4a4a6a',
                        boxShadow: hasAnyActive ? '0 0 6px rgba(234,179,8,0.4)' : 'none' }} />
                    <span className="text-sm font-semibold font-mono min-w-0 flex-1 truncate" style={{ color: '#f0f0ff' }}>
                      {site.mnsName}.{mnsPublicDomain}
                    </span>
                    <span className="text-xs flex-shrink-0 basis-full sm:basis-auto pl-5 sm:pl-0 sm:ml-auto" style={{ color: '#4a4a6a' }}>{deploys.length} deployment{deploys.length !== 1 ? 's' : ''}</span>
                  </div>

                  {/* Latest deployment */}
                  <DeployRow d={latest} />

                  {/* Older deployments (collapsible) */}
                  {rest.length > 0 && (
                    <>
                      {isOpen && rest.map(d => <DeployRow key={d.id} d={d} faded />)}
                      <button
                        onClick={() => setExpanded(p => ({ ...p, [site.id]: !p[site.id] }))}
                        className="w-full px-4 py-2 text-xs text-center transition-colors"
                        style={{ color: '#4a4a6a', borderTop: '1px solid rgba(255,255,255,0.04)' }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#8888aa')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#4a4a6a')}>
                        {isOpen ? 'Show less' : `Show ${rest.length} older deployment${rest.length !== 1 ? 's' : ''}`}
                      </button>
                    </>
                  )}
                </div>
              )
            })}

            {/* Sites with no deployments yet */}
            {sitesNoDeploys.map(site => (
              <div key={site.id} className="rounded-2xl px-4 py-3 flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#4a4a6a' }} />
                <span className="text-sm font-mono min-w-0 flex-1 truncate" style={{ color: '#8888aa' }}>{site.mnsName}.{mnsPublicDomain}</span>
                <span className="text-xs flex-shrink-0 basis-full sm:basis-auto pl-5 sm:pl-0 sm:ml-auto" style={{ color: '#4a4a6a' }}>No deployments</span>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function DeployRow({ d, faded = false }: { d: SiteDeployment; faded?: boolean }) {
  const src = SOURCE_LABELS[d.source] ?? SOURCE_LABELS.agent
  const active = isActive(d.status)
  const live = d.status === 'COMPLETE'
  const failed = d.status === 'FAILED'

  return (
    <div className="px-4 py-3" style={{ opacity: faded ? 0.6 : 1, borderTop: faded ? '1px solid rgba(255,255,255,0.04)' : undefined }}>
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${active ? 'animate-pulse' : ''}`}
          style={{ background: live ? '#34d399' : failed ? '#f87171' : active ? '#eab308' : '#4a4a6a' }} />
        <span className="text-xs px-1.5 py-0.5 rounded font-medium"
          style={{ background: src.bg, border: `1px solid ${src.border}`, color: src.color }}>
          {src.label}
        </span>
        {d.commitSha && (
          <span className="text-xs font-mono" style={{ color: '#4a4a6a' }}>{d.commitSha}</span>
        )}
        <span className="ml-auto text-xs" style={{ color: '#4a4a6a' }}>{timeAgo(d.createdAt)}</span>
      </div>
      <p className="text-xs pl-3.5" style={{ color: live ? 'rgba(52,211,153,0.7)' : failed ? '#f87171' : active ? '#c8c8e0' : '#8888aa' }}>
        {live ? '✓ Live' : failed ? (d.errorMsg || 'Failed') : active ? (d.step || 'In progress…') : (d.step || d.status)}
      </p>
    </div>
  )
}
