import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Header from '../../components/Header'
import { arcDapps, sites } from '../../api'
import type { ArcDapp, SiteDeployment } from '../../types'
import { getSiteDomain, getSiteUrl } from '../../utils/siteUrl'
import { ARC_BUSY_STATUSES } from './arcConfig'

const ACTIVE_DEPLOYMENTS = new Set(['QUEUED', 'BUILDING', 'UPLOADING', 'MNS_REGISTERING'])

function projectIsBuilding(project: ArcDapp) {
  return ARC_BUSY_STATUSES.has(project.status) && project.status !== 'DEPLOYING_CONTRACT'
}

type DeploymentRow = {
  project: ArcDapp
  deployments: SiteDeployment[]
}

export default function ArcDeployments() {
  const [rows, setRows] = useState<DeploymentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const { dapps } = await arcDapps.list()
      const deploymentRows = await Promise.all(dapps.map(async project => {
        const result = await sites.deployments(project.siteId).catch(() => ({ deployments: [] }))
        return {
          project,
          deployments: [...result.deployments].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
        }
      }))
      setRows(deploymentRows.sort((a, b) => {
        const aTime = a.deployments[0]?.updatedAt || a.project.updatedAt
        const bTime = b.deployments[0]?.updatedAt || b.project.updatedAt
        return +new Date(bTime) - +new Date(aTime)
      }))
      setError('')
    } catch (err: any) {
      setError(err.message || 'Could not load DApp deployments.')
    }
  }, [])

  useEffect(() => {
    load().finally(() => setLoading(false))
  }, [load])

  const hasActive = useMemo(
    () => rows.some(row =>
      projectIsBuilding(row.project)
      || row.deployments.some(deployment => ACTIVE_DEPLOYMENTS.has(deployment.status))
    ),
    [rows],
  )

  useEffect(() => {
    if (!hasActive) return
    const timer = setInterval(() => load().catch(() => {}), 3000)
    return () => clearInterval(timer)
  }, [hasActive, load])

  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg)' }}>
      <Header />
      <main className="mx-auto max-w-5xl px-4 py-7 sm:px-6 sm:py-10">
        <div className="mb-7">
          <Link to="/arc" className="mb-5 inline-flex items-center gap-2 text-xs font-semibold"
            style={{ color: 'var(--muted)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"><path d="m15 18-6-6 6-6"/></svg>
            Back to builder
          </Link>
          <div>
            <p className="arc-page-eyebrow">DApp workspace</p>
            <h1 className="arc-page-title mt-1.5">Deployments</h1>
            <p className="arc-page-subtitle mt-2">Track publishing progress, open live DApps, and manage releases.</p>
          </div>
          <div className="mt-4 flex">
          <button type="button" onClick={() => { setLoading(true); load().finally(() => setLoading(false)) }}
              className="btn-secondary px-3 py-2 text-xs">Refresh deployments</button>
          </div>
        </div>

        {error && <p className="mb-4 rounded-xl px-4 py-3 text-sm" style={{ color: 'var(--danger)', background: 'rgba(var(--danger-rgb),.08)', border: '1px solid rgba(var(--danger-rgb),.2)' }}>{error}</p>}

        {loading ? (
          <div className="space-y-3">{[1, 2, 3].map(item => <div key={item} className="skeleton h-32 rounded-2xl" />)}</div>
        ) : rows.length === 0 ? (
          <div className="card rounded-2xl px-6 py-20 text-center">
            <h2 className="font-bold" style={{ color: 'var(--text)' }}>No DApp deployments yet</h2>
            <p className="mt-2 text-sm" style={{ color: 'var(--muted)' }}>Build a DApp, preview it, then publish when it is ready.</p>
            <Link to="/arc" className="btn-primary mt-6 inline-flex px-5 py-2.5 text-sm">Build a DApp</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map(({ project, deployments }) => (
              <DeploymentCard key={project.id} project={project} deployments={deployments} />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

function DeploymentCard({ project, deployments }: { project: ArcDapp; deployments: SiteDeployment[] }) {
  const latest = deployments[0]
  const building = projectIsBuilding(project)
  const active = latest && ACTIVE_DEPLOYMENTS.has(latest.status)
  const complete = latest?.status === 'COMPLETE' || project.site?.status === 'LIVE'
  const failed = latest?.status === 'FAILED'
  const siteUrl = project.site ? getSiteUrl(project.site.mnsName, project.site.customDomain) : ''
  const siteDomain = project.site ? getSiteDomain(project.site.mnsName, project.site.customDomain) : ''

  return (
    <article className="card rounded-2xl p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-bold break-words" style={{ color: 'var(--text)' }}>{project.site?.title || 'Untitled DApp'}</h2>
            <StatusBadge building={building} active={!!active} complete={complete} failed={failed} />
          </div>
          <p className="mt-1 text-sm" style={{ color: building || active ? 'var(--brand-400)' : failed ? 'var(--danger)' : 'var(--muted)' }}>
            {building ? project.buildStep || 'Building DApp' : latest?.step || (complete ? 'Live on DeWeb' : project.buildStep || 'Ready to publish')}
          </p>
          {complete && (
            <a href={siteUrl} target="_blank" rel="noreferrer" className="mt-2 block break-all font-mono text-xs hover:underline" style={{ color: 'var(--success)' }}>
              {siteDomain}
            </a>
          )}
          {failed && latest?.errorMsg && <p className="mt-2 text-xs leading-5" style={{ color: 'var(--danger)' }}>{latest.errorMsg}</p>}
        </div>

        <div className="flex flex-wrap gap-2 sm:justify-end">
          {complete && <a href={siteUrl} target="_blank" rel="noreferrer" className="btn-secondary px-3 py-2 text-xs">Open</a>}
          <Link to={`/arc/build/${project.id}`} className="btn-secondary px-3 py-2 text-xs">Preview & edit</Link>
          {building ? (
            <button
              type="button"
              disabled
              title="Publishing becomes available when the DApp build finishes."
              className="btn-primary px-3 py-2 text-xs cursor-not-allowed opacity-50"
            >
              Building...
            </button>
          ) : (
            <Link to={`/arc/build/${project.id}?publish=1`} className="manage-action btn-primary px-3 py-2 text-xs">
              {complete ? 'Manage' : active ? 'View progress' : 'Publish'}
            </Link>
          )}
        </div>
      </div>

      {(building || active) && (
        <div className="mt-4 h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--panel-2)' }}>
          <div
            className="h-full animate-pulse rounded-full transition-all duration-500"
            style={{ width: building ? `${Math.max(4, project.progress || 0)}%` : '66%', background: 'var(--brand-400)' }}
          />
        </div>
      )}
    </article>
  )
}

function StatusBadge({ building, active, complete, failed }: { building: boolean; active: boolean; complete: boolean; failed: boolean }) {
  const label = building ? 'Building' : active ? 'Publishing' : failed ? 'Failed' : complete ? 'Live' : 'Draft'
  const color = building || active ? 'var(--brand-400)' : failed ? 'var(--danger)' : complete ? 'var(--success)' : 'var(--muted)'
  return (
    <span className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.1em]"
      style={{ color, border: '1px solid var(--line)', background: 'var(--panel-2)' }}>
      {label}
    </span>
  )
}
