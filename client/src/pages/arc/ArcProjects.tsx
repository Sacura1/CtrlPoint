import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Header from '../../components/Header'
import { arcDapps } from '../../api'
import type { ArcDapp } from '../../types'
import { ARC_BUSY_STATUSES, categoryLabel } from './arcConfig'

export default function ArcProjects() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<ArcDapp[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<ArcDapp | null>(null)

  const load = () => arcDapps.list().then(result => setProjects(result.dapps))

  useEffect(() => {
    load().finally(() => setLoading(false))
    const timer = setInterval(load, 5000)
    return () => clearInterval(timer)
  }, [])

  const remove = async () => {
    if (!deleting) return
    await arcDapps.remove(deleting.id)
    setProjects(current => current.filter(project => project.id !== deleting.id))
    setDeleting(null)
  }

  return (
    <div className="min-h-dvh overflow-x-hidden" style={{ background: 'var(--bg)' }}>
      <Header />
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-7 sm:py-10">
        <div className="mb-7">
          <Link to="/arc" className="mb-5 inline-flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--muted)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="m15 18-6-6 6-6"/></svg>
            Back to builder
          </Link>
          <div>
            <p className="arc-page-eyebrow">DApp workspace</p>
            <h1 className="arc-page-title mt-1.5">My dApps</h1>
            <p className="arc-page-subtitle mt-2">Open a project to preview, edit, publish, or manage its domain.</p>
          </div>
          <div className="mt-4">
            <Link to="/arc" className="btn-primary inline-flex px-4 py-2.5 text-sm">New dApp</Link>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">{[1, 2, 3].map(item => <div key={item} className="skeleton h-24 rounded-xl" />)}</div>
        ) : projects.length === 0 ? (
          <div className="card rounded-2xl py-20 px-6 text-center">
            <h2 className="font-bold" style={{ color: 'var(--text)' }}>No dApps yet</h2>
            <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>Start with a product type and describe the experience.</p>
            <Link to="/arc" className="btn-primary inline-flex mt-6 px-5 py-2.5 text-sm">Build your first dApp</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {projects.map(project => {
              const busy = ARC_BUSY_STATUSES.has(project.status)
              return (
                <div key={project.id} onClick={() => navigate(`/arc/build/${project.id}`)}
                  className="card card-hover rounded-xl px-5 py-4 cursor-pointer active:scale-[.995] transition-transform">
                  <div className="flex items-center gap-4">
                    <span className="h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ border: '1px solid var(--line-strong)', color: 'var(--brand-400)', background: 'var(--panel-2)' }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                        <path d="M7 7h10v10H7z"/><path d="M3 10V7a4 4 0 0 1 4-4h3M21 10V7a4 4 0 0 0-4-4h-3M3 14v3a4 4 0 0 0 4 4h3M21 14v3a4 4 0 0 1-4 4h-3"/>
                      </svg>
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="font-semibold truncate" style={{ color: 'var(--text)' }}>{project.site?.title || 'Untitled dApp'}</h2>
                        <span className="text-[10px] uppercase tracking-[.1em] font-bold px-2 py-0.5 rounded-full"
                          style={{
                            color: busy ? 'var(--brand-400)' : project.site?.status === 'LIVE' ? 'var(--success)' : 'var(--muted)',
                            background: busy ? 'rgba(var(--brand-500-rgb),.08)' : 'var(--panel-2)',
                            border: '1px solid var(--line)',
                          }}>
                          {busy ? 'Building' : project.site?.status === 'LIVE' ? 'Live' : 'Draft'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>{categoryLabel(project.category)} · {project.buildStep || 'Ready'}</p>
                      {busy && (
                        <div className="mt-2 h-1 rounded-full overflow-hidden" style={{ background: 'var(--panel-2)' }}>
                          <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(4, project.progress || 0)}%`, background: 'var(--brand-400)' }} />
                        </div>
                      )}
                    </div>
                    {!busy && (
                      <div className="flex shrink-0 items-center gap-2">
                        {project.site?.status === 'LIVE' && (
                          <Link
                            to={`/arc/build/${project.id}?publish=1`}
                            onClick={event => event.stopPropagation()}
                            className="manage-action hidden rounded-lg px-3 py-2 text-xs font-semibold sm:inline-flex"
                            style={{ color: 'var(--success)', border: '1px solid rgba(var(--success-rgb),.2)', background: 'rgba(var(--success-rgb),.07)' }}
                          >
                            Manage
                          </Link>
                        )}
                        <button onClick={event => { event.stopPropagation(); setDeleting(project) }}
                          className="h-9 w-9 rounded-lg flex items-center justify-center transition-colors"
                          style={{ color: 'var(--muted)', border: '1px solid var(--line)' }} aria-label="Delete dApp">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                            <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/>
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {deleting && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,.68)', backdropFilter: 'blur(8px)' }}>
          <div className="card rounded-2xl w-full max-w-sm p-6">
            <h2 className="font-bold" style={{ color: 'var(--text)' }}>Delete this dApp?</h2>
            <p className="mt-2 text-sm leading-6" style={{ color: 'var(--muted)' }}>The CtrlPoint project will be removed. A contract already deployed onchain cannot be deleted.</p>
            <div className="mt-6 flex gap-2">
              <button className="btn-secondary flex-1 py-2.5" onClick={() => setDeleting(null)}>Cancel</button>
              <button className="flex-1 rounded-xl py-2.5 font-semibold" onClick={remove}
                style={{ color: 'var(--danger)', border: '1px solid rgba(var(--danger-rgb),.3)', background: 'rgba(var(--danger-rgb),.08)' }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
