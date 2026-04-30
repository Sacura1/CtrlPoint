import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '../components/Header'
import UploadModal from '../components/UploadModal'
import { apiUrl, deploy as deployApi, github as githubApi } from '../api'
import { mnsPublicDomain } from '../utils/siteUrl'

type Tab = 'upload' | 'github' | null

interface GitHubForm {
  mnsName: string
  repoOwner: string
  repoName: string
  githubInstallationId?: string
  branch: string
  projectType: string
  buildCommand: string
  outputDir: string
}

export default function Deploy() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>(null)
  const [showUpload, setShowUpload] = useState(false)

  // GitHub form
  const [githubConnected, setGithubConnected] = useState(false)
  const [repos, setRepos] = useState<any[]>([])
  const [loadingRepos, setLoadingRepos] = useState(false)
  const [form, setForm] = useState<GitHubForm>({
    mnsName: '', repoOwner: '', repoName: '', githubInstallationId: undefined, branch: 'main',
    projectType: 'static', buildCommand: 'npm run build', outputDir: 'dist',
  })
  const [mnsStatus, setMnsStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')
  const [deploying, setDeploying] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    githubApi.status().then(({ connected }) => {
      setGithubConnected(connected)
      if (connected && new URLSearchParams(window.location.search).get('github') === 'installed') {
        setTab('github')
        setMsg({ ok: true, text: 'GitHub App installed. Select a repository to deploy.' })
        loadRepos()
        window.history.replaceState(null, '', window.location.pathname)
      }
    })
  }, [])

  const loadRepos = async () => {
    setLoadingRepos(true)
    try {
      const { repos } = await githubApi.repos()
      setRepos(repos)
    } catch (err: any) {
      setMsg({ ok: false, text: err.message })
    } finally {
      setLoadingRepos(false)
    }
  }

  const openGitHub = () => {
    setTab('github')
    setMsg(null)
    if (githubConnected && repos.length === 0) loadRepos()
  }

  const checkMns = async () => {
    const name = form.mnsName.trim().toLowerCase()
    if (!name) return
    setMnsStatus('checking')
    try {
      const { available } = await deployApi.checkMns(name)
      setMnsStatus(available ? 'available' : 'taken')
    } catch {
      setMnsStatus('idle')
    }
  }

  const setField = (k: keyof GitHubForm, v: string) => {
    setForm(f => ({ ...f, [k]: v }))
    if (k === 'mnsName') setMnsStatus('idle')
  }

  const canDeploy = form.mnsName && form.repoOwner && form.repoName && mnsStatus === 'available'

  const deploy = async () => {
    if (!canDeploy) return
    setDeploying(true)
    setMsg(null)
    try {
      const { mnsName } = await githubApi.deployNew({
        ...form,
        mnsName: form.mnsName.trim().toLowerCase(),
      })
      navigate('/dashboard')
    } catch (err: any) {
      setMsg({ ok: false, text: err.message })
    } finally {
      setDeploying(false)
    }
  }

  return (
    <div className="min-h-dvh" style={{ background: '#05050d' }}>
      <Header />

      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[700px] h-[350px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.18) 0%, transparent 70%)', filter: 'blur(80px)' }} />
      </div>

      <main className="relative z-10 max-w-2xl mx-auto px-4 sm:px-6 py-10 animate-fade-in">

        <div className="mb-8">
          <h1 className="text-2xl font-bold" style={{ color: '#f0f0ff' }}>Deploy Web-App</h1>
          <p className="mt-1 text-sm" style={{ color: '#8888aa' }}>
            Upload files or deploy from a GitHub repo — both register a new MNS address on Massa DeWeb.
          </p>
        </div>

        {/* Method selection */}
        {tab === null && (
          <div className="grid sm:grid-cols-2 gap-4 animate-fade-in">

            {/* Upload */}
            <button
              onClick={() => setShowUpload(true)}
              className="flex flex-col items-start p-6 rounded-2xl text-left transition-all duration-200"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.16)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' }}
            >
              <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                style={{ background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.25)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              </div>
              <p className="text-base font-bold mb-1.5" style={{ color: '#f0f0ff' }}>Upload Files</p>
              <p className="text-sm leading-relaxed" style={{ color: '#8888aa' }}>
                Drop an HTML file or zip. Opens in the AI editor so you can tweak before deploying.
              </p>
              <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold" style={{ color: '#a78bfa' }}>
                Upload &amp; Edit →
              </div>
            </button>

            {/* GitHub */}
            <button
              onClick={openGitHub}
              className="flex flex-col items-start p-6 rounded-2xl text-left transition-all duration-200"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.16)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)' }}
            >
              <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                style={{ background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.25)' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#a78bfa">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                </svg>
              </div>
              <p className="text-base font-bold mb-1.5" style={{ color: '#f0f0ff' }}>Deploy a GitHub Repo</p>
              <p className="text-sm leading-relaxed" style={{ color: '#8888aa' }}>
                Connect a repo — registers a new MNS and every push to your branch auto-redeploys it.
              </p>
              <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold" style={{ color: '#a78bfa' }}>
                Deploy a GitHub Repo →
              </div>
            </button>
          </div>
        )}

        {/* GitHub deploy form */}
        {tab === 'github' && (
          <div className="animate-fade-in">
            <button onClick={() => { setTab(null); setMsg(null) }}
              className="flex items-center gap-1.5 text-sm mb-6 transition-colors"
              style={{ color: '#8888aa' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#c8c8e0')}
              onMouseLeave={e => (e.currentTarget.style.color = '#8888aa')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M19 12H5M12 5l-7 7 7 7"/>
              </svg>
              Back
            </button>

            {/* GitHub account check */}
            {!githubConnected ? (
              <div className="p-6 rounded-2xl text-center"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)' }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="#8888aa" className="mx-auto mb-3">
                  <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                </svg>
                <p className="text-sm font-semibold mb-1" style={{ color: '#f0f0ff' }}>GitHub not connected</p>
                <p className="text-xs mb-4" style={{ color: '#8888aa' }}>Install the CtrlPoint GitHub App and choose which repositories it can access.</p>
                <a href={apiUrl('/github/install')}
                  className="inline-flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-xl transition-all"
                  style={{ background: 'rgba(124,58,237,0.2)', border: '1px solid rgba(167,139,250,0.35)', color: '#c4b5fd' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(124,58,237,0.32)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(124,58,237,0.2)')}>
                  Install GitHub App
                </a>
              </div>
            ) : (
              <div className="rounded-2xl"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.09)' }}>
                <div className="px-5 py-5 space-y-4">

                  {/* MNS name */}
                  <div>
                    <label className="text-xs font-bold block mb-1.5 uppercase tracking-wide" style={{ color: '#c8c8e0' }}>
                      MNS Name <span style={{ color: '#8888aa', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— your site address</span>
                    </label>
                    <div className="flex gap-2">
                      <div className="flex-1 flex items-center rounded-xl overflow-hidden"
                        style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${mnsStatus === 'available' ? 'rgba(52,211,153,0.4)' : mnsStatus === 'taken' ? 'rgba(248,113,113,0.4)' : 'rgba(255,255,255,0.1)'}` }}>
                        <input
                          className="flex-1 bg-transparent px-3 py-2.5 text-sm font-mono outline-none"
                          style={{ color: '#f0f0ff' }}
                          placeholder="my-app"
                          value={form.mnsName}
                          onChange={e => setField('mnsName', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                          onKeyDown={e => { if (e.key === 'Enter') checkMns() }}
                        />
                        <span className="pr-3 text-xs font-mono flex-shrink-0" style={{ color: '#4a4a6a' }}>.{mnsPublicDomain}</span>
                      </div>
                      <button onClick={checkMns} disabled={!form.mnsName || mnsStatus === 'checking'}
                        className="px-4 py-2.5 rounded-xl text-xs font-semibold transition-all flex-shrink-0"
                        style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: '#c8c8e0' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.12)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}>
                        {mnsStatus === 'checking' ? 'Checking…' : 'Check'}
                      </button>
                    </div>
                    {mnsStatus === 'available' && (
                      <p className="text-xs mt-1.5 font-medium text-emerald-400">✓ Available</p>
                    )}
                    {mnsStatus === 'taken' && (
                      <p className="text-xs mt-1.5 font-medium text-red-400">✗ Already taken — try another name</p>
                    )}
                  </div>

                  {/* Repo picker */}
                  <div>
                    <label className="text-xs font-bold block mb-1.5 uppercase tracking-wide" style={{ color: '#c8c8e0' }}>Repository</label>
                    {loadingRepos ? (
                      <p className="text-xs" style={{ color: '#8888aa' }}>Loading your repos…</p>
                    ) : (
                      <select
                        className="input text-sm w-full"
                        style={{ background: '#0c0c1e', color: '#f0f0ff' }}
                        value={`${form.repoOwner}/${form.repoName}`}
                        onChange={e => {
                          const [owner, ...rest] = e.target.value.split('/')
                          const name = rest.join('/')
                          const repo = repos.find(r => r.owner === owner && r.name === name)
                          setForm(f => ({ ...f, repoOwner: owner, repoName: name, githubInstallationId: repo?.installationId, branch: repo?.defaultBranch || 'main' }))
                        }}>
                        <option value="/" style={{ background: '#0c0c1e', color: '#8888aa' }}>— select a repo —</option>
                        {repos.map(r => (
                          <option key={r.id} value={`${r.owner}/${r.name}`} style={{ background: '#0c0c1e', color: '#f0f0ff' }}>
                            {r.fullName}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Branch + project type */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <FieldLabel label="Branch" tip="The Git branch to deploy from — usually 'main' or 'master'. Every push to this branch will automatically redeploy your site. Other branches are ignored." />
                      <input className="input text-sm w-full" value={form.branch}
                        onChange={e => setField('branch', e.target.value)} placeholder="main" />
                    </div>
                    <div>
                      <FieldLabel label="Project Type" tip="Static HTML: your repo has a ready-to-serve index.html at the root — no build step. Framework: uses React, Vue, Svelte etc. and must be compiled. We run your build command and serve the output folder." />
                      <select className="input text-sm w-full" style={{ background: '#0c0c1e', color: '#f0f0ff' }}
                        value={form.projectType}
                        onChange={e => setField('projectType', e.target.value)}>
                        <option value="static" style={{ background: '#0c0c1e' }}>Static HTML</option>
                        <option value="framework" style={{ background: '#0c0c1e' }}>Framework (React, Vue…)</option>
                      </select>
                    </div>
                  </div>

                  {/* Build options */}
                  {form.projectType === 'framework' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-fade-in">
                      <div>
                        <FieldLabel label="Build Command" tip="The command that compiles your project. For most React/Vite apps: 'npm run build'. For Next.js static export: 'npm run build && npm run export'." />
                        <input className="input text-sm w-full font-mono" value={form.buildCommand}
                          onChange={e => setField('buildCommand', e.target.value)} placeholder="npm run build" />
                      </div>
                      <div>
                        <FieldLabel label="Output Dir" tip="The folder your build writes into. Vite → 'dist', Create React App → 'build', Next.js static → 'out'. Must contain an index.html file." />
                        <input className="input text-sm w-full font-mono" value={form.outputDir}
                          onChange={e => setField('outputDir', e.target.value)} placeholder="dist" />
                      </div>
                    </div>
                  )}

                  {msg && (
                    <p className={`text-sm font-medium ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}</p>
                  )}

                  <button
                    onClick={deploy}
                    disabled={!canDeploy || deploying}
                    className="btn-primary w-full py-3 text-sm font-bold transition-all"
                    style={{ opacity: canDeploy ? 1 : 0.4 }}>
                    {deploying ? 'Deploying…' : 'Deploy Web-App'}
                  </button>

                  {!canDeploy && !deploying && (
                    <p className="text-xs text-center" style={{ color: '#4a4a6a' }}>
                      Enter an MNS name, check availability, and select a repo to continue.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} />}
    </div>
  )
}

function FieldLabel({ label, tip }: { label: string; tip: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mb-1.5">
      <div className="flex items-center gap-1.5">
        <label className="text-xs font-bold uppercase tracking-wide" style={{ color: '#c8c8e0' }}>{label}</label>
        <button type="button" onClick={() => setOpen(v => !v)}
          className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
          style={{
            background: open ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.08)',
            border: `1px solid ${open ? 'rgba(167,139,250,0.3)' : 'rgba(255,255,255,0.15)'}`,
            color: open ? '#a78bfa' : '#8888aa',
            fontSize: '9px', fontWeight: 700,
          }}>
          i
        </button>
      </div>
      {open && (
        <p className="text-xs mt-1 leading-relaxed animate-fade-in" style={{ color: '#8888aa' }}>
          {tip}
        </p>
      )}
    </div>
  )
}
