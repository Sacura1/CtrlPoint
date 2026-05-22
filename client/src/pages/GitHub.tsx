import { useState, useEffect } from 'react'
import Header from '../components/Header'
import { apiUrl, github as githubApi } from '../api'

export default function GitHub() {
  const [githubConnected, setGithubConnected] = useState(false)
  const [loadingGithubStatus, setLoadingGithubStatus] = useState(true)
  const [disconnectingGithub, setDisconnectingGithub] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    githubApi.status()
      .then(({ connected }) => setGithubConnected(connected))
      .catch(() => setGithubConnected(false))
      .finally(() => setLoadingGithubStatus(false))
  }, [])

  const disconnectGithubAccount = async () => {
    const confirmed = window.confirm('Disconnect GitHub from CtrlPoint? This removes all repo auto-deploy links for your web-apps.')
    if (!confirmed) return
    setDisconnectingGithub(true)
    setMessage(null)
    try {
      await githubApi.disconnectAccount()
      setGithubConnected(false)
      setMessage({ ok: true, text: 'GitHub disconnected. You can connect it again anytime.' })
    } catch (err: any) {
      setMessage({ ok: false, text: err.message })
    } finally {
      setDisconnectingGithub(false)
    }
  }

  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg)' }}>
      <Header />

      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-[30%] w-[500px] h-[300px] opacity-08 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(var(--brand-600-rgb),0.3) 0%, transparent 70%)', filter: 'blur(100px)' }} />
      </div>

      <main className="relative z-10 max-w-2xl mx-auto px-4 sm:px-6 py-10 space-y-8 animate-fade-in">
        <div className="animate-slide-up">
          <p className="text-xs font-semibold mb-3 uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
            GitHub
          </p>
          <div className="rounded-2xl overflow-hidden"
            style={{ background: 'color-mix(in srgb, var(--panel) 82%, transparent)', border: '1px solid var(--line)' }}>
            <div className="px-5 py-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'color-mix(in srgb, var(--panel-2) 88%, transparent)', border: '1px solid var(--line)' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style={{ color: 'var(--text-soft)' }}>
                      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink-200">GitHub account</p>
                    {loadingGithubStatus ? (
                      <div className="skeleton mt-1 h-3 w-36" />
                    ) : (
                      <p className="text-xs" style={{ color: 'var(--muted)' }}>
                        {githubConnected
                          ? 'Installed. Manage repo deploy settings from Deployments.'
                          : 'Install the CtrlPoint GitHub App to deploy repositories.'}
                      </p>
                    )}
                  </div>
                </div>

                {loadingGithubStatus ? (
                  <div className="skeleton h-8 w-24 rounded-lg flex-shrink-0" />
                ) : githubConnected ? (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs px-2 py-1 rounded-lg font-medium"
                      style={{ background: 'rgba(var(--success-rgb),0.1)', border: '1px solid rgba(var(--success-rgb),0.22)', color: 'var(--success)' }}>
                      Connected
                    </span>
                    <button
                      onClick={disconnectGithubAccount}
                      disabled={disconnectingGithub}
                      className="text-xs px-3 py-1.5 rounded-lg transition-all duration-200"
                      style={{ color: 'rgba(248,113,113,0.65)', border: '1px solid rgba(248,113,113,0.18)', background: 'rgba(248,113,113,0.06)' }}>
                      {disconnectingGithub ? 'Disconnecting...' : 'Disconnect'}
                    </button>
                  </div>
                ) : (
                  <a href={apiUrl('/github/install')}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg transition-all duration-200 flex-shrink-0"
                    style={{ background: 'rgba(var(--brand-600-rgb),0.15)', border: '1px solid rgba(var(--brand-600-rgb),0.3)', color: 'var(--brand-400)' }}>
                    Connect GitHub
                  </a>
                )}
              </div>

              {message && (
                <p className={`text-xs mt-4 ${message.ok ? 'text-emerald-400' : 'text-red-400'}`}>{message.text}</p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
