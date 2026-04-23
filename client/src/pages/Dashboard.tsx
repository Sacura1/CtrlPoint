import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Header from '../components/Header'
import { sites as sitesApi } from '../api'
import { Site } from '../types'
import { getSiteUrl, mnsPublicDomain } from '../utils/siteUrl'

const STATUS = {
  DRAFT:     { label: 'Draft',      color: 'rgba(74,74,106,0.6)',  dot: '#4a4a6a',  glow: 'none' },
  DEPLOYING: { label: 'Deploying',  color: 'rgba(234,179,8,0.1)',  dot: '#eab308',  glow: '0 0 8px rgba(234,179,8,0.4)' },
  LIVE:      { label: 'Live',       color: 'rgba(52,211,153,0.1)', dot: '#34d399',  glow: '0 0 8px rgba(52,211,153,0.5)' },
  ERROR:     { label: 'Error',      color: 'rgba(248,113,113,0.1)',dot: '#f87171',  glow: '0 0 8px rgba(248,113,113,0.4)' },
  UPDATING:  { label: 'Updating',   color: 'rgba(99,102,241,0.1)', dot: '#818cf8',  glow: '0 0 8px rgba(99,102,241,0.4)' },
} as const

export default function Dashboard() {
  const [siteList, setSiteList] = useState<Site[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState<Site | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    sitesApi.list()
      .then(({ sites }) => setSiteList(sites))
      .finally(() => setLoading(false))
  }, [])

  const handleDelete = async (site: Site) => {
    setDeletingId(site.id)
    try {
      await sitesApi.delete(site.id)
      setSiteList(prev => prev.filter(s => s.id !== site.id))
    } catch (err: any) {
      alert(err.message)
    } finally {
      setDeletingId(null)
      setConfirmDelete(null)
    }
  }

  return (
    <div className="min-h-dvh" style={{ background: '#05050d' }}>
      <Header />

      {/* Ambient */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 right-[20%] w-[400px] h-[300px] opacity-10 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.5) 0%, transparent 70%)', filter: 'blur(80px)' }} />
      </div>

      <main className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 py-10">

        {/* Title row */}
        <div className="flex items-center justify-between mb-8 animate-fade-in">
          <div>
            <h1 className="text-2xl font-bold text-ink-50">My Sites</h1>
            {!loading && (
              <p className="text-ink-600 text-sm mt-0.5">
                {siteList.length === 0 ? 'No sites yet' : `${siteList.length} site${siteList.length !== 1 ? 's' : ''} deployed`}
              </p>
            )}
          </div>
          <Link to="/editor" className="btn-primary text-sm py-2 px-4">
            + New site
          </Link>
        </div>

        {/* List */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="skeleton h-20 rounded-2xl" style={{ animationDelay: `${i * 0.1}s` }} />
            ))}
          </div>
        ) : siteList.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-2 animate-fade-in">
            {siteList.map((site, i) => {
              const s = STATUS[site.status] ?? STATUS.DRAFT
              const isPulsing = site.status === 'DEPLOYING' || site.status === 'UPDATING'
              return (
                <div key={site.id}
                  onClick={() => navigate(`/editor/${site.id}`)}
                  className="group relative flex items-center gap-4 px-5 py-4 rounded-2xl cursor-pointer card card-hover animate-fade-in"
                  style={{ animationDelay: `${i * 0.05}s` }}
                >
                  {/* Status dot */}
                  <div className="relative flex-shrink-0">
                    <div className={`w-2.5 h-2.5 rounded-full ${isPulsing ? 'animate-pulse' : ''}`}
                      style={{ background: s.dot, boxShadow: s.glow }} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-semibold text-ink-100 truncate text-sm">{site.title}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0 font-medium"
                        style={{ background: s.color, color: s.dot }}>
                        {s.label}
                      </span>
                    </div>
                    <span className="text-ink-600 text-xs font-mono">{site.mnsName}.{mnsPublicDomain}</span>
                  </div>

                  {/* Actions — appear on hover */}
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-200 flex-shrink-0">
                    {site.status === 'LIVE' && (
                      <a href={getSiteUrl(site.mnsName)} target="_blank" rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="btn-ghost py-1 px-2.5 text-xs text-ink-400 hover:text-brand-400" title="Visit">
                        ↗
                      </a>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); setConfirmDelete(site) }}
                      className="btn-ghost py-1 px-2.5 text-xs text-red-500/60 hover:text-red-400"
                      style={{ '--tw-bg-opacity': '0' } as any}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* Delete confirm modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
          style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}>
          <div className="card w-full max-w-sm p-6 animate-scale-in"
            style={{ background: 'rgba(10,10,24,0.95)', boxShadow: '0 24px 80px rgba(0,0,0,0.8)' }}>
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z"/>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15.75h.007v.008H12v-.008z"/>
              </svg>
            </div>
            <h3 className="font-semibold text-ink-50 mb-1">Delete "{confirmDelete.title}"?</h3>
            <p className="text-ink-600 text-sm mb-6">
              This removes the site from CtrlPoint. The on-chain MNS record will remain unchanged.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)} className="btn-secondary flex-1 text-sm py-2">
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDelete)}
                disabled={deletingId === confirmDelete.id}
                className="flex-1 text-sm py-2 rounded-xl font-semibold transition-all duration-200"
                style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171' }}
              >
                {deletingId === confirmDelete.id ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="card flex flex-col items-center justify-center py-24 text-center animate-fade-in">
      <div className="w-16 h-16 rounded-3xl flex items-center justify-center mb-6"
        style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.2)' }}>
        <svg width="24" height="24" viewBox="0 0 20 20" fill="none">
          <path d="M10 4v12M4 10h12" stroke="#7c3aed" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      </div>
      <p className="text-ink-200 font-semibold text-base mb-2">No sites yet</p>
      <p className="text-ink-600 text-sm mb-8 max-w-xs">Describe what you want to build. AI does the rest.</p>
      <Link to="/editor" className="btn-primary text-sm px-6">Build your first site</Link>
    </div>
  )
}
