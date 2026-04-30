import { useState, useEffect } from 'react'
import Header from '../components/Header'
import { apiUrl, sites as sitesApi, github as githubApi } from '../api'
import { Site } from '../types'

export default function GitHub() {
  const [sites, setSites] = useState<Site[]>([])
  const [githubConnected, setGithubConnected] = useState(false)
  const [repos, setRepos] = useState<any[]>([])
  const [loadingRepos, setLoadingRepos] = useState(false)
  const [connectForm, setConnectForm] = useState<{
    siteId: string; repoOwner: string; repoName: string; githubInstallationId?: string; branch: string
    projectType: string; buildCommand: string; outputDir: string
  } | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [connectMsg, setConnectMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [siteConnections, setSiteConnections] = useState<Record<string, any>>({})

  useEffect(() => {
    githubApi.status().then(({ connected }) => setGithubConnected(connected))
    sitesApi.list().then(({ sites }) => {
      const liveSites = sites.filter(s => s.status === 'LIVE')
      setSites(liveSites)
      Promise.all(
        liveSites.map(s => githubApi.connection(s.id).then(c => c ? [s.id, c] : null).catch(() => null))
      ).then(results => {
        const map: Record<string, any> = {}
        results.forEach(r => { if (r) map[r[0] as string] = r[1] })
        setSiteConnections(map)
      })
    })
  }, [])

  const loadRepos = async () => {
    setLoadingRepos(true)
    try {
      const { repos } = await githubApi.repos()
      setRepos(repos)
    } catch (err: any) {
      setConnectMsg({ ok: false, text: err.message })
    } finally {
      setLoadingRepos(false)
    }
  }

  const startConnect = (siteId: string) => {
    setConnectForm({ siteId, repoOwner: '', repoName: '', githubInstallationId: undefined, branch: 'main', projectType: 'static', buildCommand: 'npm run build', outputDir: 'dist' })
    setConnectMsg(null)
    if (repos.length === 0) loadRepos()
  }

  const saveConnect = async () => {
    if (!connectForm) return
    setConnecting(true)
    setConnectMsg(null)
    try {
      const { connection } = await githubApi.connect(connectForm)
      setSiteConnections(prev => ({ ...prev, [connectForm.siteId]: connection }))
      setConnectForm(null)
      setConnectMsg({ ok: true, text: 'Repo connected. Auto-deploy is active.' })
    } catch (err: any) {
      setConnectMsg({ ok: false, text: err.message })
    } finally {
      setConnecting(false)
    }
  }

  const disconnectRepo = async (siteId: string) => {
    try {
      await githubApi.disconnect(siteId)
      setSiteConnections(prev => { const n = { ...prev }; delete n[siteId]; return n })
    } catch (err: any) {
      setConnectMsg({ ok: false, text: err.message })
    }
  }

  return (
    <div className="min-h-dvh" style={{ background: '#05050d' }}>
      <Header />

      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-[30%] w-[500px] h-[300px] opacity-08 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.3) 0%, transparent 70%)', filter: 'blur(100px)' }} />
      </div>

      <main className="relative z-10 max-w-2xl mx-auto px-4 sm:px-6 py-10 space-y-8 animate-fade-in">

        <div className="animate-slide-up">
          <p className="text-xs font-semibold mb-3 uppercase tracking-widest" style={{ color: 'rgba(255,255,255,0.2)' }}>
            GitHub
          </p>
          <div className="rounded-2xl overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="px-5 py-4">

              {/* Account status */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ color: 'rgba(255,255,255,0.7)' }}>
                      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-ink-200">GitHub account</p>
                    <p className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
                      {githubConnected ? 'Installed - auto-deploy is available' : 'Not installed'}
                    </p>
                  </div>
                </div>
                {githubConnected ? (
                  <span className="text-xs px-2 py-1 rounded-lg font-medium"
                    style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)', color: '#34d399' }}>
                    Connected
                  </span>
                ) : (
                  <a href={apiUrl('/github/install')}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg transition-all duration-200"
                    style={{ background: 'rgba(124,58,237,0.15)', border: '1px solid rgba(124,58,237,0.3)', color: '#a78bfa' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(124,58,237,0.25)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(124,58,237,0.15)')}>
                    Connect GitHub →
                  </a>
                )}
              </div>

              {/* Per-site repo connections */}
              {githubConnected && sites.length > 0 && (
                <div className="space-y-2.5">
                  <p className="text-xs font-medium mb-3" style={{ color: 'rgba(255,255,255,0.25)' }}>WEB-APP REPO CONNECTIONS</p>
                  {sites.map(site => {
                    const conn = siteConnections[site.id]
                    return (
                      <div key={site.id} className="px-4 py-3.5 rounded-xl"
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs mb-0.5 font-medium" style={{ color: 'rgba(255,255,255,0.25)' }}>WEB-APP</p>
                            <p className="text-sm font-medium text-ink-100 truncate">{site.title}</p>
                            {conn ? (
                              <div className="flex items-center gap-1.5 mt-1">
                                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style={{ color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>
                                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                                </svg>
                                <p className="text-xs font-mono" style={{ color: 'rgba(255,255,255,0.35)' }}>
                                  {conn.repoOwner}/{conn.repoName} <span style={{ color: 'rgba(255,255,255,0.2)' }}>@ {conn.branch}</span>
                                </p>
                                <span className="text-xs px-1.5 py-0.5 rounded font-medium ml-1"
                                  style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.15)', color: '#34d399' }}>
                                  auto-deploy on
                                </span>
                              </div>
                            ) : (
                              <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.2)' }}>No repo connected yet</p>
                            )}
                          </div>
                          {conn ? (
                            <button onClick={() => disconnectRepo(site.id)}
                              className="text-xs flex-shrink-0 px-3 py-1.5 rounded-lg transition-all duration-200"
                              style={{ color: 'rgba(248,113,113,0.6)', border: '1px solid rgba(248,113,113,0.15)', background: 'rgba(248,113,113,0.05)' }}
                              onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.borderColor = 'rgba(248,113,113,0.3)' }}
                              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(248,113,113,0.6)'; e.currentTarget.style.borderColor = 'rgba(248,113,113,0.15)' }}>
                              Disconnect
                            </button>
                          ) : (
                            <button onClick={() => startConnect(site.id)}
                              className="text-xs flex-shrink-0 font-medium px-3 py-1.5 rounded-lg transition-all duration-200"
                              style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.25)', color: '#a78bfa' }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(124,58,237,0.22)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(124,58,237,0.12)')}>
                              Launch Web-App
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {githubConnected && sites.length === 0 && (
                <div className="py-6 text-center">
                  <p className="text-sm" style={{ color: 'rgba(255,255,255,0.2)' }}>
                    Deploy a web-app first, then come back to connect a repo for auto-deploy.
                  </p>
                </div>
              )}

              {/* Connect form */}
              {connectForm && (
                <div className="mt-4 p-4 rounded-xl animate-fade-in"
                  style={{ background: 'rgba(124,58,237,0.05)', border: '1px solid rgba(124,58,237,0.2)' }}>
                  <p className="text-xs font-semibold text-ink-200 mb-4">Configure auto-deploy</p>

                  <div className="mb-3">
                    <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.35)' }}>Repository</label>
                    {loadingRepos ? (
                      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Loading repos…</p>
                    ) : (
                      <select
                        className="input text-sm w-full"
                        style={{ background: '#0d0d1f', color: 'rgba(255,255,255,0.85)' }}
                        value={`${connectForm.repoOwner}/${connectForm.repoName}`}
                        onChange={e => {
                          const [owner, ...rest] = e.target.value.split('/')
                          const name = rest.join('/')
                          const repo = repos.find(r => r.owner === owner && r.name === name)
                          setConnectForm(f => f ? { ...f, repoOwner: owner, repoName: name, githubInstallationId: repo?.installationId, branch: repo?.defaultBranch || 'main' } : f)
                        }}>
                        <option value="/" style={{ background: '#0d0d1f', color: 'rgba(255,255,255,0.5)' }}>— select a repo —</option>
                        {repos.map(r => (
                          <option key={r.id} value={`${r.owner}/${r.name}`} style={{ background: '#0d0d1f', color: 'rgba(255,255,255,0.85)' }}>
                            {r.fullName}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="mb-3">
                    <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.35)' }}>Branch</label>
                    <input className="input text-sm w-full" value={connectForm.branch}
                      onChange={e => setConnectForm(f => f ? { ...f, branch: e.target.value } : f)} placeholder="main" />
                  </div>

                  <div className="mb-4">
                    <label className="text-xs mb-2 block" style={{ color: 'rgba(255,255,255,0.35)' }}>Project type</label>
                    <div className="flex gap-2">
                      {[{ v: 'static', l: 'Static HTML' }, { v: 'framework', l: 'Framework (React, Vue…)' }].map(opt => (
                        <button key={opt.v} onClick={() => setConnectForm(f => f ? { ...f, projectType: opt.v } : f)}
                          className="flex-1 py-2 rounded-xl text-xs font-medium transition-all duration-150"
                          style={{
                            background: connectForm.projectType === opt.v ? 'rgba(124,58,237,0.2)' : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${connectForm.projectType === opt.v ? 'rgba(124,58,237,0.4)' : 'rgba(255,255,255,0.08)'}`,
                            color: connectForm.projectType === opt.v ? '#c4b5fd' : 'rgba(255,255,255,0.5)',
                          }}>
                          {opt.l}
                        </button>
                      ))}
                    </div>
                  </div>

                  {connectForm.projectType === 'framework' && (
                    <div className="grid grid-cols-2 gap-2 mb-4 animate-fade-in">
                      <div>
                        <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.35)' }}>Build command</label>
                        <input className="input text-sm w-full font-mono" value={connectForm.buildCommand}
                          onChange={e => setConnectForm(f => f ? { ...f, buildCommand: e.target.value } : f)} placeholder="npm run build" />
                      </div>
                      <div>
                        <label className="text-xs mb-1.5 block" style={{ color: 'rgba(255,255,255,0.35)' }}>Output dir</label>
                        <input className="input text-sm w-full font-mono" value={connectForm.outputDir}
                          onChange={e => setConnectForm(f => f ? { ...f, outputDir: e.target.value } : f)} placeholder="dist" />
                      </div>
                    </div>
                  )}

                  {connectMsg && (
                    <p className={`text-xs mb-3 ${connectMsg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{connectMsg.text}</p>
                  )}

                  <div className="flex gap-2">
                    <button onClick={() => setConnectForm(null)} className="btn-secondary flex-1 text-xs py-2">Cancel</button>
                    <button onClick={saveConnect} disabled={connecting || !connectForm.repoName}
                      className="btn-primary flex-1 text-xs py-2">
                      {connecting ? 'Connecting…' : 'Activate auto-deploy'}
                    </button>
                  </div>
                </div>
              )}

              {connectMsg && !connectForm && (
                <p className={`text-xs mt-3 ${connectMsg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{connectMsg.text}</p>
              )}
            </div>
          </div>
        </div>

      </main>
    </div>
  )
}
