import { useState, useEffect, useCallback } from 'react'
import Header from '../components/Header'
import { arcDapps as arcDappsApi, github as githubApi, sites as sitesApi } from '../api'
import { ArcDapp, GitHubConnection, Site, SiteDeployment } from '../types'
import { getSiteDomain, getSiteUrl, mnsPublicDomain } from '../utils/siteUrl'
import ClaimedBadge from '../components/ClaimedBadge'

const SOURCE_LABELS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  agent:             { label: 'Agent',       color: 'var(--success)', bg: 'rgba(var(--success-rgb),0.08)',  border: 'rgba(var(--success-rgb),0.2)'  },
  agent_api:         { label: 'Agent',       color: 'var(--success)', bg: 'rgba(var(--success-rgb),0.08)',  border: 'rgba(var(--success-rgb),0.2)'  },
  agent_x402:        { label: 'Agent x402',  color: 'var(--success)', bg: 'rgba(var(--success-rgb),0.08)',  border: 'rgba(var(--success-rgb),0.2)'  },
  upload:            { label: 'File Upload', color: 'var(--muted)', bg: 'color-mix(in srgb, var(--panel-2) 72%, transparent)',  border: 'var(--line)'  },
  github_push:       { label: 'GitHub Push', color: 'var(--accent, var(--brand-400))', bg: 'rgba(var(--accent-rgb, var(--brand-400-rgb)),0.08)', border: 'rgba(var(--accent-rgb, var(--brand-400-rgb)),0.2)' },
  github_new:        { label: 'GitHub',      color: 'var(--accent, var(--brand-400))', bg: 'rgba(var(--accent-rgb, var(--brand-400-rgb)),0.08)', border: 'rgba(var(--accent-rgb, var(--brand-400-rgb)),0.2)' },
  github_rollback:   { label: 'Rollback',    color: 'var(--accent, var(--brand-300))', bg: 'rgba(var(--accent-rgb, var(--brand-300-rgb)),0.08)', border: 'rgba(var(--accent-rgb, var(--brand-300-rgb)),0.2)' },
}

type GitHubForm = {
  siteId: string
  repoOwner: string
  repoName: string
  githubInstallationId?: string | null
  branch: string
  projectType: string
  projectRoot: string
  buildCommand: string
  outputDir: string
  buildEnv: string
  autoDeployOnPush: boolean
}

type EnvEntry = {
  key: string
  value: string
}

type ConfirmAction = {
  title: string
  body: string
  confirmLabel: string
  destructive?: boolean
  disabled?: boolean
  onConfirm: () => void
}

function timeAgo(date: string) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

function isActive(status: string) {
  return status === 'QUEUED' || status === 'BUILDING' || status === 'UPLOADING' || status === 'MNS_REGISTERING'
}

function isGithubDeployment(d: SiteDeployment) {
  return d.source === 'github_new' || d.source === 'github_push' || d.source === 'github_rollback'
}

function deploymentTime(deployment: SiteDeployment | undefined) {
  if (!deployment) return 0
  return new Date(deployment.updatedAt || deployment.createdAt).getTime()
}

function sortDeployments(deployments: SiteDeployment[]) {
  return [...deployments].sort((a, b) => {
    const activeDelta = Number(isActive(b.status)) - Number(isActive(a.status))
    if (activeDelta !== 0) return activeDelta
    return deploymentTime(b) - deploymentTime(a)
  })
}

function siteActivityTime(site: Site, deployments: SiteDeployment[]) {
  const latestDeployment = deployments[0]
  return Math.max(
    new Date(site.updatedAt || site.createdAt).getTime(),
    deploymentTime(latestDeployment)
  )
}

function parseBuildEnvEntries(raw: string): EnvEntry[] {
  const normalized = raw
    .replace(/\\n/g, '\n')
    .replace(/\/n/g, '\n')
    .replace(/--(?=vite_[a-z0-9_]+=)/gi, '\n')
    .replace(/\s+(?=[A-Za-z_][A-Za-z0-9_]*=)/g, '\n')

  return normalized
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && line.includes('='))
    .map(line => {
      const eq = line.indexOf('=')
      return {
        key: line.slice(0, eq).trim(),
        value: line.slice(eq + 1).trim(),
      }
    })
    .filter(entry => entry.key)
}

function stringifyBuildEnvEntries(entries: EnvEntry[]): string {
  return entries
    .filter(entry => entry.key.trim())
    .map(entry => `${entry.key.trim()}=${entry.value}`)
    .join('\n')
}

function maskedValue(value: string): string {
  if (!value) return 'empty'
  return value.length <= 4 ? '****' : `${value.slice(0, 2)}****${value.slice(-2)}`
}

export default function Deployments() {
  const [sites, setSites] = useState<Site[]>([])
  const [view, setView] = useState<'deployments' | 'arc-dapps'>('deployments')
  const [arcDapps, setArcDapps] = useState<ArcDapp[]>([])
  const [arcOwnerInputs, setArcOwnerInputs] = useState<Record<string, string>>({})
  const [deployingContractId, setDeployingContractId] = useState<string | null>(null)
  const [deployMap, setDeployMap] = useState<Record<string, SiteDeployment[]>>({})
  const [connectionMap, setConnectionMap] = useState<Record<string, GitHubConnection>>({})
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [repos, setRepos] = useState<any[]>([])
  const [loadingRepos, setLoadingRepos] = useState(false)
  const [settingsForm, setSettingsForm] = useState<GitHubForm | null>(null)
  const [savingSettings, setSavingSettings] = useState(false)
  const [redeploying, setRedeploying] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [deletingSite, setDeletingSite] = useState(false)
  const [rollingBackId, setRollingBackId] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [rollbackTarget, setRollbackTarget] = useState<SiteDeployment | null>(null)
  const [logsTarget, setLogsTarget] = useState<{ site: Site; deployment: SiteDeployment } | null>(null)
  const [logsText, setLogsText] = useState('')
  const [logsLoading, setLogsLoading] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const loadAll = useCallback(async () => {
    const { sites: s } = await sitesApi.list()
    setSites(s)
    setArcDapps([])
    const [deploymentResults, connectionResults] = await Promise.all([
      Promise.all(
        s.map(site =>
          sitesApi.deployments(site.id)
            .then(({ deployments }) => ({ id: site.id, deployments }))
            .catch(() => ({ id: site.id, deployments: [] }))
        )
      ),
      Promise.all(
        s.map(site =>
          githubApi.connection(site.id)
            .then(connection => connection ? ({ id: site.id, connection }) : null)
            .catch(() => null)
        )
      ),
    ])

    const deployments: Record<string, SiteDeployment[]> = {}
    deploymentResults.forEach(r => { deployments[r.id] = sortDeployments(r.deployments) })
    setDeployMap(deployments)

    const connections: Record<string, GitHubConnection> = {}
    connectionResults.forEach(r => { if (r?.connection) connections[r.id] = r.connection })
    setConnectionMap(connections)
  }, [])

  useEffect(() => {
    setLoading(true)
    loadAll().finally(() => setLoading(false))
  }, [loadAll])

  useEffect(() => {
    const hasActive = Object.values(deployMap).flat().some(d => isActive(d.status))
    const iv = setInterval(loadAll, hasActive ? 3000 : 10000)
    return () => clearInterval(iv)
  }, [deployMap, loadAll])

  const loadRepos = async () => {
    setLoadingRepos(true)
    try {
      const { repos } = await githubApi.repos()
      setRepos(repos)
    } catch (err: any) {
      setMessage({ ok: false, text: err.message })
    } finally {
      setLoadingRepos(false)
    }
  }

  const openGithubSettings = (site: Site) => {
    const conn = connectionMap[site.id]
    if (!conn || site.ownershipClaimed) return
    setSettingsForm({
      siteId: site.id,
      repoOwner: conn.repoOwner,
      repoName: conn.repoName,
      githubInstallationId: conn.githubInstallationId,
      branch: conn.branch || 'main',
      projectType: conn.projectType || 'framework',
      projectRoot: conn.projectRoot || '',
      buildCommand: conn.buildCommand || 'npm run build',
      outputDir: conn.outputDir || 'dist',
      buildEnv: conn.buildEnv || '',
      autoDeployOnPush: conn.autoDeployOnPush !== false,
    })
    setMessage(null)
    if (repos.length === 0) loadRepos()
  }

  const saveGithubSettings = async () => {
    if (!settingsForm) return
    setSavingSettings(true)
    setMessage(null)
    try {
      const { connection } = await githubApi.connect(settingsForm)
      setConnectionMap(prev => ({ ...prev, [settingsForm.siteId]: connection }))
      setSettingsForm(null)
      setMessage({ ok: true, text: 'GitHub deployment settings updated.' })
      await loadAll()
    } catch (err: any) {
      setMessage({ ok: false, text: err.message })
    } finally {
      setSavingSettings(false)
    }
  }

  const redeployLatest = async () => {
    if (!settingsForm) return
    setRedeploying(true)
    setMessage(null)
    try {
      await githubApi.redeploy(settingsForm.siteId)
      setSettingsForm(null)
      setMessage({ ok: true, text: 'Redeploy queued from the latest branch commit.' })
      await loadAll()
    } catch (err: any) {
      setMessage({ ok: false, text: err.message })
    } finally {
      setRedeploying(false)
    }
  }

  const disconnectRepo = async () => {
    if (!settingsForm) return
    setDisconnecting(true)
    setConfirmAction(null)
    setMessage(null)
    try {
      await githubApi.disconnect(settingsForm.siteId)
      setConnectionMap(prev => { const next = { ...prev }; delete next[settingsForm.siteId]; return next })
      setSettingsForm(null)
      setMessage({ ok: true, text: 'Repository disconnected from this web-app.' })
      await loadAll()
    } catch (err: any) {
      setMessage({ ok: false, text: err.message })
    } finally {
      setDisconnecting(false)
    }
  }

  const deleteDeploymentSite = async () => {
    if (!settingsForm) return
    setDeletingSite(true)
    setConfirmAction(null)
    setMessage(null)
    try {
      await sitesApi.delete(settingsForm.siteId)
      setSites(prev => prev.filter(site => site.id !== settingsForm.siteId))
      setDeployMap(prev => { const next = { ...prev }; delete next[settingsForm.siteId]; return next })
      setConnectionMap(prev => { const next = { ...prev }; delete next[settingsForm.siteId]; return next })
      setSettingsForm(null)
      setMessage({ ok: true, text: 'Deployment deleted from CtrlPoint.' })
      await loadAll()
    } catch (err: any) {
      setMessage({ ok: false, text: err.message })
    } finally {
      setDeletingSite(false)
    }
  }

  const rollbackDeployment = async (deployment: SiteDeployment) => {
    setRollingBackId(deployment.id)
    setRollbackTarget(null)
    setMessage(null)
    try {
      await githubApi.rollback(deployment.id)
      setMessage({ ok: true, text: 'Rollback queued.' })
      await loadAll()
    } catch (err: any) {
      setMessage({ ok: false, text: err.message })
    } finally {
      setRollingBackId(null)
    }
  }

  const openBuildLogs = async (site: Site, deployment: SiteDeployment) => {
    setLogsTarget({ site, deployment })
    setLogsText('')
    setLogsLoading(true)
    try {
      const { logs } = await sitesApi.deploymentLogs(site.id, deployment.id)
      setLogsText(logs || 'No build logs are available for this deployment yet.')
    } catch (err: any) {
      setLogsText(err.message || 'Could not load build logs.')
    } finally {
      setLogsLoading(false)
    }
  }

  const deployArcContract = async (dapp: ArcDapp) => {
    const ownerAddress = (arcOwnerInputs[dapp.id] || '').trim()
    setDeployingContractId(dapp.id)
    setMessage(null)
    try {
      const { dapp: updated } = await arcDappsApi.deployContract(dapp.id, ownerAddress)
      setArcDapps(prev => prev.map(item => item.id === updated.id ? updated : item))
      setMessage({ ok: true, text: 'Arc contract deployed.' })
    } catch (err: any) {
      setMessage({ ok: false, text: err.message })
      await loadAll()
    } finally {
      setDeployingContractId(null)
    }
  }

  const sortedSites = [...sites].sort((a, b) => {
    const aDeploys = deployMap[a.id] ?? []
    const bDeploys = deployMap[b.id] ?? []
    const activeDelta = Number(bDeploys.some(d => isActive(d.status))) - Number(aDeploys.some(d => isActive(d.status)))
    if (activeDelta !== 0) return activeDelta
    return siteActivityTime(b, bDeploys) - siteActivityTime(a, aDeploys)
  })
  const sitesWithDeploys = sortedSites.filter(s => (deployMap[s.id]?.length ?? 0) > 0)
  const sitesNoDeploys = sortedSites.filter(s => (deployMap[s.id]?.length ?? 0) === 0)

  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg)' }}>
      <Header />

      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-[30%] w-[500px] h-[300px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(var(--brand-600-rgb),0.12) 0%, transparent 70%)', filter: 'blur(100px)' }} />
      </div>

      <main className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 py-10 animate-fade-in">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>Deployments</h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
              Live activity across all your web-apps.
            </p>
          </div>
          <button onClick={() => { setLoading(true); loadAll().finally(() => setLoading(false)) }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-all"
            style={{ background: 'color-mix(in srgb, var(--panel-2) 78%, transparent)', border: '1px solid var(--line)', color: 'var(--muted)' }}>
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
              <path d="M1 7A6 6 0 1 0 3 3.5"/><path d="M1 1v3h3"/>
            </svg>
            Refresh
          </button>
        </div>

        {message && !settingsForm && (
          <p className={`text-xs mb-4 ${message.ok ? 'text-emerald-400' : 'text-red-400'}`}>{message.text}</p>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="skeleton h-24 rounded-2xl" style={{ animationDelay: `${i * 0.1}s` }} />
            ))}
          </div>
        ) : view === 'arc-dapps' ? (
          <div className="space-y-3">
            {arcDapps.length === 0 ? (
              <div className="card flex flex-col items-center justify-center py-20 text-center">
                <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-soft)' }}>No Arc dApps yet</p>
                <p className="text-xs" style={{ color: 'var(--muted-2)' }}>Use Arc Web3 mode in the editor to generate one.</p>
              </div>
            ) : arcDapps.map(dapp => (
              <ArcDappCard
                key={dapp.id}
                dapp={dapp}
                ownerInput={arcOwnerInputs[dapp.id] || ''}
                onOwnerInput={value => setArcOwnerInputs(prev => ({ ...prev, [dapp.id]: value }))}
                onDeployContract={() => deployArcContract(dapp)}
                deploying={deployingContractId === dapp.id}
              />
            ))}
          </div>
        ) : sites.length === 0 ? (
          <div className="card flex flex-col items-center justify-center py-24 text-center">
            <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-soft)' }}>No web-apps yet</p>
            <p className="text-xs" style={{ color: 'var(--muted-2)' }}>Deploy your first web-app to see activity here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {sitesWithDeploys.map(site => {
              const deploys = deployMap[site.id] ?? []
              const latest = deploys[0]
              const rest = deploys.slice(1)
              const isOpen = expanded[site.id]
              const hasAnyActive = deploys.some(d => isActive(d.status))
              const connection = connectionMap[site.id]

              return (
                <div key={site.id} className="rounded-2xl overflow-hidden"
                  style={{ background: 'color-mix(in srgb, var(--panel) 82%, transparent)', border: '1px solid var(--line)' }}>
                  <div className="flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1 px-4 py-3"
                    style={{ borderBottom: '1px solid var(--line)' }}>
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${hasAnyActive ? 'animate-pulse' : ''}`}
                      style={{ background: hasAnyActive ? '#eab308' : site.status === 'LIVE' ? 'var(--success)' : site.status === 'ERROR' ? '#f87171' : 'var(--muted-2)',
                        boxShadow: hasAnyActive ? '0 0 6px rgba(234,179,8,0.4)' : 'none' }} />
                    <div className="min-w-0 flex-1">
                      <a
                        href={getSiteUrl(site.mnsName, site.customDomain)}
                        target="_blank"
                        rel="noreferrer"
                        className="block text-sm font-semibold font-mono transition-colors hover:underline"
                        style={{ color: 'var(--text)' }}>
                        {getSiteDomain(site.mnsName, site.customDomain)}
                      </a>
                      {site.customDomain && (
                        <p className="mt-0.5 break-all font-mono text-[11px] leading-4" style={{ color: 'var(--muted-2)' }}>
                          {site.mnsName}.{mnsPublicDomain}
                        </p>
                      )}
                    </div>
                    {site.ownershipClaimed && <ClaimedBadge compact />}
                    <a
                      href={`/settings?site=${site.id}#custom-domains`}
                      className="text-xs flex-shrink-0 rounded-lg px-2.5 py-1 font-semibold"
                      style={{ color: 'var(--muted)', border: '1px solid var(--line)', background: 'color-mix(in srgb, var(--panel-2) 68%, transparent)' }}>
                      Domains
                    </a>
                    <span className="text-xs flex-shrink-0 basis-full sm:basis-auto pl-5 sm:pl-0 sm:ml-auto" style={{ color: 'var(--muted-2)' }}>{deploys.length} deployment{deploys.length !== 1 ? 's' : ''}</span>
                  </div>

                  {connection && (
                    <div className="flex flex-wrap items-center gap-2 px-4 py-2"
                      style={{ borderBottom: '1px solid var(--line)', background: 'rgba(var(--brand-600-rgb),0.055)' }}>
                      <span className="text-xs font-mono truncate max-w-full" style={{ color: 'var(--muted)' }}>
                        {connection.repoOwner}/{connection.repoName} <span style={{ color: 'var(--muted-2)' }}>@ {connection.branch}</span>
                      </span>
                      {connection.lastDeployedSha && (
                        <span className="text-xs font-mono" style={{ color: 'var(--muted-2)' }}>{connection.lastDeployedSha.slice(0, 7)}</span>
                      )}
                      <span className="text-xs px-1.5 py-0.5 rounded font-medium"
                        style={{
                          background: connection.autoDeployOnPush ? 'rgba(var(--success-rgb),0.08)' : 'rgba(251,191,36,0.08)',
                          border: `1px solid ${connection.autoDeployOnPush ? 'rgba(var(--success-rgb),0.18)' : 'rgba(251,191,36,0.16)'}`,
                          color: connection.autoDeployOnPush ? 'var(--success)' : '#b7791f',
                        }}>
                        auto-redeploy {connection.autoDeployOnPush ? 'on' : 'off'}
                      </span>
                      {!site.ownershipClaimed && (
                        <button onClick={() => openGithubSettings(site)}
                          className="ml-auto text-xs px-3 py-1.5 rounded-lg transition-all duration-200"
                          style={{ color: 'var(--accent, var(--brand-400))', border: '1px solid rgba(var(--accent-rgb, var(--brand-400-rgb)),0.24)', background: 'rgba(var(--accent-rgb, var(--brand-600-rgb)),0.08)' }}>
                          Settings
                        </button>
                      )}
                    </div>
                  )}

                  <DeployRow d={latest} onShowLogs={() => openBuildLogs(site, latest)} />

                  {rest.length > 0 && (
                    <>
                      {isOpen && rest.map(d => (
                        <DeployRow
                          key={d.id}
                          d={d}
                          faded
                          onRollback={connection && d.commitSha && isGithubDeployment(d) && ['COMPLETE', 'SUPERSEDED'].includes(d.status)
                            ? () => setRollbackTarget(d)
                            : undefined}
                          rollingBack={rollingBackId === d.id}
                          onShowLogs={() => openBuildLogs(site, d)}
                        />
                      ))}
                      <button
                        onClick={() => setExpanded(p => ({ ...p, [site.id]: !p[site.id] }))}
                        className="w-full px-4 py-2 text-xs text-center transition-colors"
                        style={{ color: 'var(--muted-2)', borderTop: '1px solid var(--line)' }}>
                        {isOpen ? 'Show less' : `Show ${rest.length} older deployment${rest.length !== 1 ? 's' : ''}`}
                      </button>
                    </>
                  )}
                </div>
              )
            })}

            {sitesNoDeploys.map(site => (
              <div key={site.id} className="rounded-2xl px-4 py-3 flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1"
                style={{ background: 'color-mix(in srgb, var(--panel) 78%, transparent)', border: '1px solid var(--line)' }}>
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: 'var(--muted-2)' }} />
                <div className="min-w-0 flex-1">
                  <a
                    href={getSiteUrl(site.mnsName, site.customDomain)}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-sm font-mono transition-colors hover:underline"
                    style={{ color: 'var(--muted)' }}>
                    {getSiteDomain(site.mnsName, site.customDomain)}
                  </a>
                  {site.customDomain && (
                    <p className="mt-0.5 break-all font-mono text-[11px] leading-4" style={{ color: 'var(--muted-2)' }}>
                      {site.mnsName}.{mnsPublicDomain}
                    </p>
                  )}
                </div>
                {site.ownershipClaimed && <ClaimedBadge compact />}
                <a
                  href={`/settings?site=${site.id}#custom-domains`}
                  className="text-xs flex-shrink-0 rounded-lg px-2.5 py-1 font-semibold"
                  style={{ color: 'var(--muted)', border: '1px solid var(--line)', background: 'color-mix(in srgb, var(--panel-2) 68%, transparent)' }}>
                  Domains
                </a>
                <span className="text-xs flex-shrink-0 basis-full sm:basis-auto pl-5 sm:pl-0 sm:ml-auto" style={{ color: 'var(--muted-2)' }}>No deployments</span>
              </div>
            ))}
          </div>
        )}
      </main>

      {settingsForm && (
        <div className="fixed inset-0 z-50 overflow-y-auto px-3 py-4 sm:px-6 sm:py-8"
          style={{ background: 'color-mix(in srgb, var(--bg) 94%, rgba(0,0,0,0.7))' }}>
          <div className="mx-auto min-h-[calc(100dvh-32px)] w-full max-w-5xl rounded-2xl"
            style={{ background: 'var(--panel)', border: '1px solid var(--line)', boxShadow: '0 24px 90px rgba(0,0,0,0.55)' }}>
            <div className="sticky top-0 z-10 rounded-t-2xl p-4 sm:p-5"
              style={{ background: 'color-mix(in srgb, var(--panel) 92%, transparent)', borderBottom: '1px solid var(--line)', backdropFilter: 'blur(18px)' }}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-base font-bold text-ink-100">GitHub deployment settings</p>
                  <p className="text-xs mt-1 truncate" style={{ color: 'var(--muted)' }}>
                    {settingsForm.repoOwner}/{settingsForm.repoName}
                  </p>
                </div>
                <button onClick={() => setSettingsForm(null)}
                  className="text-xs px-3 py-1.5 rounded-lg"
                  style={{ color: 'var(--muted)', border: '1px solid var(--line)' }}>
                  Close
                </button>
              </div>
            </div>

            <div className="grid gap-5 p-4 sm:p-5 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="space-y-4">
              <div className="flex items-center justify-between gap-4 rounded-xl px-4 py-3"
                style={{ background: 'color-mix(in srgb, var(--panel-2) 74%, transparent)', border: '1px solid var(--line)' }}>
                <div className="min-w-0">
                  <span className="text-sm font-medium text-ink-100">Auto redeploy on push</span>
                  <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
                    When off, pushes are ignored and you can redeploy manually.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSettingsForm(f => f ? { ...f, autoDeployOnPush: !f.autoDeployOnPush } : f)}
                  className="relative h-7 w-14 min-w-14 shrink-0 rounded-full transition-all duration-200"
                  style={{
                    background: settingsForm.autoDeployOnPush
                      ? 'var(--accent, var(--brand-600))'
                      : 'color-mix(in srgb, var(--panel-2) 92%, transparent)',
                    border: `1px solid ${settingsForm.autoDeployOnPush ? 'rgba(var(--accent-rgb, var(--brand-400-rgb)),0.42)' : 'var(--line-strong)'}`,
                    boxShadow: settingsForm.autoDeployOnPush ? '0 8px 20px rgba(var(--accent-rgb, var(--brand-600-rgb)),0.2)' : 'none',
                  }}
                  aria-pressed={settingsForm.autoDeployOnPush}
                >
                  <span
                    className="absolute top-1 h-5 w-5 rounded-full transition-all duration-200"
                    style={{
                      left: settingsForm.autoDeployOnPush ? 30 : 4,
                      background: settingsForm.autoDeployOnPush ? '#fffdfa' : 'var(--muted)',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.24)',
                    }}
                  />
                </button>
              </div>

              <div>
                <label className="text-xs mb-1.5 block" style={{ color: 'var(--muted)' }}>Repository</label>
                {loadingRepos ? (
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>Loading repos...</p>
                ) : (
                  <select
                    className="input text-sm w-full"
                    style={{ background: 'var(--input-bg)', color: 'var(--text)' }}
                    value={`${settingsForm.repoOwner}/${settingsForm.repoName}`}
                    onChange={e => {
                      const [owner, ...rest] = e.target.value.split('/')
                      const name = rest.join('/')
                      const repo = repos.find(r => r.owner === owner && r.name === name)
                      setSettingsForm(f => f ? { ...f, repoOwner: owner, repoName: name, githubInstallationId: repo?.installationId, branch: repo?.defaultBranch || 'main' } : f)
                    }}>
                    <option value={`${settingsForm.repoOwner}/${settingsForm.repoName}`} style={{ background: 'var(--input-bg)', color: 'var(--text)' }}>
                      {settingsForm.repoOwner}/{settingsForm.repoName}
                    </option>
                    {repos.map(r => (
                      <option key={r.id} value={`${r.owner}/${r.name}`} style={{ background: 'var(--input-bg)', color: 'var(--text)' }}>
                        {r.fullName}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="text-xs mb-1.5 block" style={{ color: 'var(--muted)' }}>Branch</label>
                <input className="input text-sm w-full" value={settingsForm.branch}
                  onChange={e => setSettingsForm(f => f ? { ...f, branch: e.target.value } : f)} placeholder="main" />
              </div>

              <div>
                <label className="text-xs mb-2 block" style={{ color: 'var(--muted)' }}>Project type</label>
                <div className="flex gap-2">
                  {[{ v: 'static', l: 'Static HTML' }, { v: 'framework', l: 'Framework' }].map(opt => (
                    <button key={opt.v} onClick={() => setSettingsForm(f => f ? { ...f, projectType: opt.v } : f)}
                      className="flex-1 py-2 rounded-xl text-xs font-medium transition-all duration-150"
                      style={{
                        background: settingsForm.projectType === opt.v ? 'var(--accent, var(--brand-600))' : 'color-mix(in srgb, var(--panel-2) 70%, transparent)',
                        border: `1px solid ${settingsForm.projectType === opt.v ? 'rgba(var(--accent-rgb, var(--brand-600-rgb)),0.5)' : 'var(--line)'}`,
                        color: settingsForm.projectType === opt.v ? '#fffdfa' : 'var(--muted)',
                        boxShadow: settingsForm.projectType === opt.v ? '0 8px 20px rgba(var(--accent-rgb, var(--brand-600-rgb)),0.18)' : 'none',
                      }}>
                      <span className="inline-flex items-center justify-center gap-1.5">
                        {settingsForm.projectType === opt.v && (
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: '#fffdfa' }} />
                        )}
                        {opt.l}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {settingsForm.projectType === 'framework' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs mb-1.5 block" style={{ color: 'var(--muted)' }}>Project root</label>
                      <input className="input text-sm w-full font-mono" value={settingsForm.projectRoot}
                        onChange={e => setSettingsForm(f => f ? { ...f, projectRoot: e.target.value.replace(/^\/+/, '') } : f)} placeholder="client" />
                    </div>
                    <div>
                      <label className="text-xs mb-1.5 block" style={{ color: 'var(--muted)' }}>Output dir</label>
                      <input className="input text-sm w-full font-mono" value={settingsForm.outputDir}
                        onChange={e => setSettingsForm(f => f ? { ...f, outputDir: e.target.value.replace(/^\/+/, '') } : f)} placeholder="dist" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs mb-1.5 block" style={{ color: 'var(--muted)' }}>Build command</label>
                    <input className="input text-sm w-full font-mono" value={settingsForm.buildCommand}
                      onChange={e => setSettingsForm(f => f ? { ...f, buildCommand: e.target.value } : f)} placeholder="npm run build" />
                  </div>
                </div>
              )}
              </div>

              <div className="space-y-4">
                <BuildEnvEditor
                  value={settingsForm.buildEnv}
                  onChange={buildEnv => setSettingsForm(f => f ? { ...f, buildEnv } : f)}
                />

              {message && (
                <p className={`text-xs ${message.ok ? 'text-emerald-400' : 'text-red-400'}`}>{message.text}</p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                <button onClick={saveGithubSettings} disabled={savingSettings || !settingsForm.repoName}
                  className="btn-primary text-xs py-2.5">
                  {savingSettings ? 'Saving...' : 'Save settings'}
                </button>
                <button onClick={redeployLatest} disabled={redeploying}
                  className="text-xs py-2.5 rounded-xl font-medium"
                  style={{ color: 'var(--success)', border: '1px solid rgba(var(--success-rgb),0.28)', background: 'rgba(var(--success-rgb),0.09)' }}>
                  {redeploying ? 'Queueing...' : 'Redeploy latest commit'}
                </button>
                <button
                  onClick={() => setConfirmAction({
                    title: 'Disconnect repository',
                    body: 'Disconnect this repository from the web-app? GitHub pushes will stop deploying it, but the deployed site and deployment history will stay in CtrlPoint.',
                    confirmLabel: disconnecting ? 'Disconnecting...' : 'Disconnect',
                    destructive: true,
                    disabled: disconnecting,
                    onConfirm: disconnectRepo,
                  })}
                  disabled={disconnecting}
                  className="text-xs py-2.5 rounded-xl font-medium"
                  style={{ color: 'rgba(248,113,113,0.75)', border: '1px solid rgba(248,113,113,0.18)', background: 'rgba(248,113,113,0.06)' }}>
                  {disconnecting ? 'Disconnecting...' : 'Disconnect repo'}
                </button>
                <button
                  onClick={() => setConfirmAction({
                    title: 'Delete deployment',
                    body: 'Delete this deployment from CtrlPoint? This removes it from your dashboard and disconnects its GitHub settings. The onchain site may remain accessible, but CtrlPoint will no longer manage it.',
                    confirmLabel: deletingSite ? 'Deleting...' : 'Delete',
                    destructive: true,
                    disabled: deletingSite,
                    onConfirm: deleteDeploymentSite,
                  })}
                  disabled={deletingSite}
                  className="text-xs py-2.5 rounded-xl font-semibold"
                  style={{ color: 'var(--danger)', border: '1px solid rgba(var(--danger-rgb),0.34)', background: 'rgba(var(--danger-rgb),0.09)' }}>
                  {deletingSite ? 'Deleting...' : 'Delete deployment'}
                </button>
              </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {logsTarget && (
        <BuildLogsModal
          title={getSiteDomain(logsTarget.site.mnsName, logsTarget.site.customDomain)}
          deployment={logsTarget.deployment}
          logs={logsText}
          loading={logsLoading}
          onClose={() => setLogsTarget(null)}
        />
      )}

      {rollbackTarget && (
        <ConfirmModal
          title="Roll back deployment"
          body={`Roll back this web-app to commit ${rollbackTarget.commitSha?.slice(0, 7)}? A new rollback deployment will be queued.`}
          confirmLabel={rollingBackId === rollbackTarget.id ? 'Queueing...' : 'Roll back'}
          destructive={false}
          disabled={rollingBackId === rollbackTarget.id}
          onCancel={() => setRollbackTarget(null)}
          onConfirm={() => rollbackDeployment(rollbackTarget)}
        />
      )}

      {confirmAction && (
        <ConfirmModal
          title={confirmAction.title}
          body={confirmAction.body}
          confirmLabel={confirmAction.confirmLabel}
          destructive={confirmAction.destructive}
          disabled={confirmAction.disabled}
          onCancel={() => setConfirmAction(null)}
          onConfirm={confirmAction.onConfirm}
        />
      )}
    </div>
  )
}

function BuildLogsModal({
  title,
  deployment,
  logs,
  loading,
  onClose,
}: {
  title: string
  deployment: SiteDeployment
  logs: string
  loading: boolean
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4 py-6 animate-fade-in"
      style={{ background: 'color-mix(in srgb, var(--bg) 76%, rgba(0,0,0,0.48))', backdropFilter: 'blur(14px)' }}>
      <div className="w-full max-w-3xl overflow-hidden rounded-2xl animate-scale-in"
        style={{ background: 'var(--panel)', border: '1px solid var(--line)', boxShadow: '0 24px 80px rgba(0,0,0,0.35)' }}>
        <div className="flex items-start justify-between gap-4 px-5 py-4" style={{ borderBottom: '1px solid var(--line)' }}>
          <div className="min-w-0">
            <p className="text-base font-bold" style={{ color: 'var(--text)' }}>Build logs</p>
            <p className="mt-1 truncate font-mono text-xs" style={{ color: 'var(--muted)' }}>
              {title} · {deployment.commitSha ? deployment.commitSha.slice(0, 7) : deployment.source}
            </p>
          </div>
          <button type="button" onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold"
            style={{ color: 'var(--muted)', border: '1px solid var(--line)', background: 'color-mix(in srgb, var(--panel-2) 72%, transparent)' }}>
            Close
          </button>
        </div>
        <div className="p-4">
          <pre className="max-h-[60dvh] overflow-auto rounded-xl p-4 text-xs leading-5 whitespace-pre-wrap"
            style={{ background: 'color-mix(in srgb, var(--bg) 72%, #000 8%)', border: '1px solid var(--line)', color: 'var(--text-soft)' }}>
            {loading ? 'Loading build logs...' : logs}
          </pre>
        </div>
      </div>
    </div>
  )
}

function ArcDappCard({
  dapp,
  ownerInput,
  onOwnerInput,
  onDeployContract,
  deploying,
}: {
  dapp: ArcDapp
  ownerInput: string
  onOwnerInput: (value: string) => void
  onDeployContract: () => void
  deploying: boolean
}) {
  const [copied, setCopied] = useState<string | null>(null)
  const site = dapp.site
  const siteUrl = site ? getSiteUrl(site.mnsName, site.customDomain) : ''
  const siteDomain = site ? getSiteDomain(site.mnsName, site.customDomain) : ''
  const needsContract = ['split-payments', 'voting-polls', 'membership', 'games'].includes(dapp.category) && !dapp.contractAddress
  const deployTxUrl = dapp.deployTxHash ? `https://testnet.arcscan.app/tx/${dapp.deployTxHash}` : undefined

  const copy = async (value: string, key: string) => {
    await navigator.clipboard.writeText(value)
    setCopied(key)
    setTimeout(() => setCopied(current => current === key ? null : current), 1600)
  }

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ background: 'color-mix(in srgb, var(--panel) 82%, transparent)', border: '1px solid var(--line)' }}>
      <div className="flex flex-wrap items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--line)' }}>
        <span className="rounded-xl px-2.5 py-1 text-xs font-bold"
          style={{ color: 'var(--success)', background: 'rgba(var(--success-rgb),0.08)', border: '1px solid rgba(var(--success-rgb),0.18)' }}>
          {arcCategoryLabel(dapp.category)}
        </span>
        <div className="min-w-0 flex-1">
          {site ? (
            <>
              <a href={siteUrl} target="_blank" rel="noreferrer" className="block truncate text-sm font-bold hover:underline" style={{ color: 'var(--text)' }}>
                {site.title}
              </a>
              <a href={siteUrl} target="_blank" rel="noreferrer" className="mt-0.5 block break-all font-mono text-xs hover:underline" style={{ color: 'var(--muted)' }}>
                {siteDomain}
              </a>
            </>
          ) : (
            <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>Arc dApp</p>
          )}
        </div>
        <span className="rounded-lg px-2 py-1 text-xs font-semibold"
          style={{ color: dapp.contractAddress ? 'var(--success)' : needsContract ? '#d97706' : 'var(--muted)', background: 'color-mix(in srgb, var(--panel-2) 74%, transparent)', border: '1px solid var(--line)' }}>
          {dapp.contractAddress ? 'Contract live' : needsContract ? 'Contract optional' : 'Frontend only'}
        </span>
      </div>

      <div className="space-y-3 px-4 py-4">
        {dapp.contractAddress ? (
          <div className="grid gap-2">
            <div className="rounded-xl px-3 py-2" style={{ background: 'color-mix(in srgb, var(--panel-2) 66%, transparent)', border: '1px solid var(--line)' }}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--muted-2)' }}>Contract</p>
                <button
                  type="button"
                  onClick={() => copy(dapp.contractAddress!, 'contract')}
                  className="flex h-7 w-7 items-center justify-center rounded-lg"
                  style={{
                    color: copied === 'contract' ? 'var(--success)' : 'var(--muted)',
                    background: copied === 'contract' ? 'rgba(var(--success-rgb),0.1)' : 'color-mix(in srgb, var(--panel) 72%, transparent)',
                    border: `1px solid ${copied === 'contract' ? 'rgba(var(--success-rgb),0.22)' : 'var(--line)'}`,
                  }}
                  aria-label="Copy contract address">
                  {copied === 'contract' ? (
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
              <p className="break-all font-mono text-xs" style={{ color: 'var(--text-soft)' }}>{dapp.contractAddress}</p>
            </div>
            {dapp.deployTxHash && <InfoLine label="Deploy tx" value={dapp.deployTxHash} href={deployTxUrl} externalLabel="Open on ArcScan" />}
            {dapp.ownerAddress && <InfoLine label="Owner" value={dapp.ownerAddress} />}
            {site?.needsDeploy && (
              <p className="rounded-xl px-3 py-2 text-xs leading-5"
                style={{ color: 'var(--success)', background: 'rgba(var(--success-rgb),0.07)', border: '1px solid rgba(var(--success-rgb),0.16)' }}>
                Contract config has been added to the frontend. Open the editor and push the site update to make it live.
              </p>
            )}
          </div>
        ) : needsContract ? (
          <div className="rounded-2xl p-3"
            style={{ background: 'color-mix(in srgb, var(--panel-2) 68%, transparent)', border: '1px solid var(--line)' }}>
            <p className="text-sm font-bold" style={{ color: 'var(--text-soft)' }}>Deploy Arc contract</p>
            <p className="mt-1 text-xs leading-5" style={{ color: 'var(--muted)' }}>
              CtrlPoint deploys the approved template, but the contract owner/admin is your EVM wallet.
            </p>
            {deploying && (
              <div className="mt-3 flex items-start gap-2 rounded-xl px-3 py-2"
                style={{ color: 'var(--success)', background: 'rgba(var(--success-rgb),0.07)', border: '1px solid rgba(var(--success-rgb),0.16)' }}>
                <span className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
                <p className="text-xs leading-5">Deploying contract on Arc Testnet. This can take a moment; keep this tab open.</p>
              </div>
            )}
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                className="input flex-1 font-mono text-xs"
                placeholder="0x owner wallet"
                value={ownerInput}
                disabled={deploying}
                onChange={e => onOwnerInput(e.target.value)}
              />
              <button type="button" onClick={onDeployContract} disabled={deploying || !ownerInput.trim()}
                className="btn-primary px-4 py-2 text-xs">
                {deploying ? 'Deploying...' : 'Deploy contract'}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs leading-5" style={{ color: 'var(--muted)' }}>
            This dApp works as a static frontend with wallet/RPC logic. No contract deployment is required.
          </p>
        )}

        {dapp.errorMsg && (
          <p className="rounded-xl px-3 py-2 text-xs text-red-400" style={{ background: 'rgba(248,113,113,0.07)', border: '1px solid rgba(248,113,113,0.16)' }}>
            {dapp.errorMsg}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {site && (
            <a href={`/editor/${site.id}`} className="rounded-xl px-3 py-2 text-xs font-semibold"
              style={{ color: 'var(--text-soft)', border: '1px solid var(--line)', background: 'color-mix(in srgb, var(--panel-2) 70%, transparent)' }}>
              Update site
            </a>
          )}
          {site && (
            <a href={`/settings?site=${site.id}#custom-domains`} className="rounded-xl px-3 py-2 text-xs font-semibold"
              style={{ color: 'var(--muted)', border: '1px solid var(--line)', background: 'color-mix(in srgb, var(--panel-2) 70%, transparent)' }}>
              Custom domains
            </a>
          )}
          {dapp.explorerUrl && (
            <a href={dapp.explorerUrl} target="_blank" rel="noreferrer" className="rounded-xl px-3 py-2 text-xs font-semibold"
              style={{ color: 'var(--success)', border: '1px solid rgba(var(--success-rgb),0.22)', background: 'rgba(var(--success-rgb),0.08)' }}>
              Explorer
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

function InfoLine({ label, value, href, externalLabel = 'Open' }: { label: string; value: string; href?: string; externalLabel?: string }) {
  const content = <span className="break-all font-mono text-xs" style={{ color: 'var(--text-soft)' }}>{value}</span>
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: 'color-mix(in srgb, var(--panel-2) 66%, transparent)', border: '1px solid var(--line)' }}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--muted-2)' }}>{label}</p>
        {href && (
          <a href={href} target="_blank" rel="noreferrer" className="text-[10px] font-bold uppercase tracking-wide hover:underline"
            style={{ color: 'var(--success)' }}>
            {externalLabel}
          </a>
        )}
      </div>
      {href ? <a href={href} target="_blank" rel="noreferrer" className="hover:underline">{content}</a> : content}
    </div>
  )
}

function arcCategoryLabel(category: string) {
  const labels: Record<string, string> = {
    'wallet-tools': 'Wallet Tools',
    'payment-links': 'Payment Links',
    'tip-jar': 'Tip Jar',
    'split-payments': 'Split Payments',
    'voting-polls': 'Voting',
    membership: 'Membership',
    games: 'Game',
    eligibility: 'Eligibility',
    dashboards: 'Dashboard',
  }
  return labels[category] || category
}

function ConfirmModal({
  title,
  body,
  confirmLabel,
  destructive,
  disabled,
  onCancel,
  onConfirm,
}: {
  title: string
  body: string
  confirmLabel: string
  destructive?: boolean
  disabled?: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4 py-6 animate-fade-in"
      style={{ background: 'color-mix(in srgb, var(--bg) 76%, rgba(0,0,0,0.48))', backdropFilter: 'blur(14px)' }}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden animate-scale-in"
        style={{ background: 'var(--panel)', border: '1px solid var(--line)', boxShadow: '0 24px 80px rgba(0,0,0,0.35)' }}>
        <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--line)' }}>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl"
              style={{ background: destructive ? 'rgba(248,113,113,0.1)' : 'rgba(var(--accent-rgb, var(--brand-600-rgb)),0.12)', border: `1px solid ${destructive ? 'rgba(248,113,113,0.22)' : 'rgba(var(--accent-rgb, var(--brand-600-rgb)),0.24)'}` }}>
              {destructive ? (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18" />
                  <path d="M8 6V4h8v2" />
                  <path d="M19 6l-1 14H6L5 6" />
                  <path d="M10 11v5" />
                  <path d="M14 11v5" />
                </svg>
              ) : (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--accent, var(--brand-400))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 7v6h6" />
                  <path d="M21 17a9 9 0 0 0-15-6.7L3 13" />
                </svg>
              )}
            </div>
            <p className="text-base font-bold" style={{ color: 'var(--text)' }}>{title}</p>
          </div>
        </div>
        <div className="px-5 py-4">
          <p className="text-sm leading-6" style={{ color: 'var(--muted)' }}>{body}</p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button type="button" onClick={onCancel} disabled={disabled}
              className="rounded-xl px-4 py-2.5 text-sm font-semibold"
              style={{ color: 'var(--text-soft)', background: 'color-mix(in srgb, var(--panel-2) 72%, transparent)', border: '1px solid var(--line)' }}>
              Cancel
            </button>
            <button type="button" onClick={onConfirm} disabled={disabled}
              className={destructive ? 'rounded-xl px-4 py-2.5 text-sm font-semibold' : 'btn-primary px-4 py-2.5 text-sm'}
              style={destructive ? { color: '#fffdfa', background: 'var(--danger)', border: '1px solid rgba(var(--danger-rgb),0.38)' } : undefined}>
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function DeployRow({
  d,
  faded = false,
  onRollback,
  rollingBack,
  onShowLogs,
}: {
  d: SiteDeployment
  faded?: boolean
  onRollback?: () => void
  rollingBack?: boolean
  onShowLogs?: () => void
}) {
  const src = SOURCE_LABELS[d.source] ?? SOURCE_LABELS.agent
  const active = isActive(d.status)
  const live = d.status === 'COMPLETE'
  const superseded = d.status === 'SUPERSEDED'
  const failed = d.status === 'FAILED'
  const canShowLogs = Boolean(onShowLogs && (d.buildLogAvailable || active || failed))

  return (
    <div className="px-4 py-3" style={{ opacity: faded ? 0.72 : 1, borderTop: faded ? '1px solid var(--line)' : undefined }}>
      <div className="flex items-center gap-2 mb-1">
        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${active ? 'animate-pulse' : ''}`}
          style={{ background: live ? 'var(--success)' : superseded ? '#64748b' : failed ? '#f87171' : active ? '#eab308' : 'var(--muted-2)' }} />
        <span className="text-xs px-1.5 py-0.5 rounded font-medium"
          style={{ background: src.bg, border: `1px solid ${src.border}`, color: src.color }}>
          {src.label}
        </span>
        {d.commitSha && (
          <span className="text-xs font-mono" style={{ color: 'var(--muted-2)' }}>{d.commitSha.slice(0, 7)}</span>
        )}
        <span className="ml-auto text-xs" style={{ color: 'var(--muted-2)' }}>{timeAgo(d.createdAt)}</span>
      </div>
      <div className="flex items-center gap-2 pl-3.5">
        <p className="text-xs min-w-0 flex-1"
          style={{ color: live ? 'var(--success)' : superseded ? '#64748b' : failed ? '#f87171' : active ? 'var(--text-soft)' : 'var(--muted)' }}>
          {live ? 'Live'
            : superseded ? 'Previous deployment'
              : failed ? (d.errorMsg || 'Failed')
                : active ? (d.step || 'In progress...')
                  : (d.step || d.status)}
        </p>
        {onRollback && (
          <button onClick={onRollback} disabled={rollingBack}
            className="text-xs px-2.5 py-1 rounded-lg flex-shrink-0"
            style={{ color: 'var(--accent, var(--brand-300))', border: '1px solid rgba(var(--accent-rgb, var(--brand-300-rgb)),0.24)', background: 'rgba(var(--accent-rgb, var(--brand-300-rgb)),0.08)' }}>
            {rollingBack ? 'Queueing...' : 'Rollback'}
          </button>
        )}
        {canShowLogs && (
          <button onClick={onShowLogs}
            className="text-xs px-2.5 py-1 rounded-lg flex-shrink-0"
            style={{ color: 'var(--text-soft)', border: '1px solid var(--line)', background: 'color-mix(in srgb, var(--panel-2) 72%, transparent)' }}>
            Logs
          </button>
        )}
      </div>
    </div>
  )
}

function BuildEnvEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [menuIndex, setMenuIndex] = useState<number | null>(null)
  const [edit, setEdit] = useState<{ index: number | 'new'; key: string; value: string } | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const entries = parseBuildEnvEntries(value)
  const normalizedValue = stringifyBuildEnvEntries(entries)

  const updateEntries = (next: EnvEntry[]) => onChange(stringifyBuildEnvEntries(next))

  const saveEdit = () => {
    if (!edit?.key.trim()) return
    const next = [...entries]
    const entry = { key: edit.key.trim(), value: edit.value }
    if (edit.index === 'new') next.push(entry)
    else next[edit.index] = entry
    updateEntries(next)
    setEdit(null)
    setMenuIndex(null)
  }

  const deleteEntry = (index: number) => {
    const next = [...entries]
    next.splice(index, 1)
    updateEntries(next)
    setMenuIndex(null)
  }

  return (
    <div className="rounded-2xl p-4"
      style={{ background: 'color-mix(in srgb, var(--panel-2) 68%, transparent)', border: '1px solid var(--line)' }}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink-100">Build env</p>
          <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>
            Values are hidden here. Use bulk update for raw KEY=value editing.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              if (!bulkOpen && normalizedValue !== value) onChange(normalizedValue)
              setBulkOpen(true)
              setEdit(null)
              setMenuIndex(null)
            }}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold"
            style={{
              color: bulkOpen ? 'var(--accent, var(--brand-300))' : 'var(--text-soft)',
              border: `1px solid ${bulkOpen ? 'rgba(var(--accent-rgb, var(--brand-400-rgb)),0.35)' : 'var(--line)'}`,
              background: bulkOpen ? 'rgba(var(--accent-rgb, var(--brand-600-rgb)),0.12)' : 'color-mix(in srgb, var(--panel-2) 70%, transparent)',
            }}>
            Bulk update
          </button>
          {bulkOpen && (
            <button
              type="button"
              onClick={() => {
                onChange(stringifyBuildEnvEntries(parseBuildEnvEntries(value)))
                setBulkOpen(false)
              }}
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ color: 'var(--accent, var(--brand-300))', border: '1px solid rgba(var(--accent-rgb, var(--brand-400-rgb)),0.28)', background: 'rgba(var(--accent-rgb, var(--brand-600-rgb)),0.08)' }}
              aria-label="Back to variables"
              title="Back to variables">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5" />
                <path d="M12 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={() => { setEdit({ index: 'new', key: '', value: '' }); setBulkOpen(false); setMenuIndex(null) }}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold"
            style={{ color: 'var(--accent, var(--brand-300))', border: '1px solid rgba(var(--accent-rgb, var(--brand-400-rgb)),0.22)', background: 'rgba(var(--accent-rgb, var(--brand-600-rgb)),0.08)' }}>
            Add variable
          </button>
        </div>
      </div>

      {bulkOpen ? (
        <div className="space-y-2">
          <textarea
            className="input min-h-[180px] resize-y font-mono text-xs leading-5"
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={'VITE_API_URL=https://api.example.com\nVITE_GOOGLE_CLIENT_ID=...'}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs" style={{ color: 'var(--muted-2)' }}>One variable per line. Keep secrets out of frontend env when possible.</p>
          </div>
        </div>
      ) : edit ? (
        <div className="space-y-3 rounded-xl p-3"
          style={{ background: 'color-mix(in srgb, var(--panel) 82%, transparent)', border: '1px solid var(--line)' }}>
          <div>
            <label className="mb-1.5 block text-xs" style={{ color: 'var(--muted)' }}>Key</label>
            <input
              className="input font-mono text-sm"
              value={edit.key}
              onChange={e => setEdit(current => current ? { ...current, key: e.target.value.replace(/\s/g, '') } : current)}
              placeholder="VITE_API_URL"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs" style={{ color: 'var(--muted)' }}>Value</label>
            <input
              className="input font-mono text-sm"
              value={edit.value}
              onChange={e => setEdit(current => current ? { ...current, value: e.target.value } : current)}
              placeholder="https://api.example.com"
            />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setEdit(null)} className="btn-secondary flex-1 py-2 text-xs">Cancel</button>
            <button type="button" onClick={saveEdit} disabled={!edit.key.trim()} className="btn-primary flex-1 py-2 text-xs">Save variable</button>
          </div>
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-xl px-3 py-6 text-center"
          style={{ background: 'color-mix(in srgb, var(--panel) 74%, transparent)', border: '1px dashed var(--line)' }}>
          <p className="text-sm font-semibold" style={{ color: 'var(--text-soft)' }}>No build env variables</p>
          <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>Add variables individually or use bulk update.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry, index) => (
            <div key={`${entry.key}-${index}`} className="relative flex items-center gap-3 rounded-xl px-3 py-2.5"
              style={{ background: 'color-mix(in srgb, var(--panel) 82%, transparent)', border: '1px solid var(--line)' }}>
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-xs font-bold" style={{ color: 'var(--text-soft)' }}>{entry.key}</p>
                <p className="mt-0.5 truncate font-mono text-xs" style={{ color: 'var(--muted-2)' }}>{maskedValue(entry.value)}</p>
              </div>
              <button
                type="button"
                onClick={() => setMenuIndex(menuIndex === index ? null : index)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-lg leading-none"
                style={{ color: 'var(--muted)', border: '1px solid var(--line)', background: 'color-mix(in srgb, var(--panel-2) 72%, transparent)' }}
                aria-label={`Manage ${entry.key}`}
              >
                ...
              </button>
              {menuIndex === index && (
                <div className="absolute right-3 top-11 z-20 w-32 overflow-hidden rounded-xl"
                  style={{ background: 'var(--panel)', border: '1px solid var(--line)', boxShadow: '0 16px 42px rgba(0,0,0,0.38)' }}>
                  <button
                    type="button"
                    onClick={() => { setEdit({ index, key: entry.key, value: entry.value }); setMenuIndex(null) }}
                    className="block w-full px-3 py-2 text-left text-xs font-semibold"
                    style={{ color: 'var(--text-soft)' }}>
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteEntry(index)}
                    className="block w-full px-3 py-2 text-left text-xs font-semibold"
                    style={{ color: '#f87171', borderTop: '1px solid var(--line)' }}>
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
