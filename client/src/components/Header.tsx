import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../store/auth'
import ThemeToggle from './ThemeToggle'

const WEBSITE_NAV = [
  { to: '/editor', label: 'Build' },
  { to: '/dashboard', label: 'Web-Apps' },
  { to: '/deploy', label: 'Deploy' },
  { to: '/deployments', label: 'Deployments' },
]

const WEBSITE_TOOLS = [
  { to: '/github', label: 'GitHub' },
  { to: '/keys', label: 'API Keys' },
  { to: '/settings', label: 'Settings' },
  { to: '/support', label: 'Support' },
]

const ARC_BUILDER_ENABLED = import.meta.env.VITE_ENABLE_ARC_BUILDER === 'true'

export default function Header() {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => { setMenuOpen(false) }, [pathname])

  const isActive = (to: string) => {
    if (to === '/editor') return pathname === '/editor' || pathname.startsWith('/editor/')
    return pathname === to
  }

  return (
    <>
      <header
        className="sticky top-0 z-50"
        style={{
          background: 'color-mix(in srgb, var(--bg) 90%, transparent)',
          borderBottom: '1px solid var(--line)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
        }}
      >
        <div className="mx-auto grid h-14 max-w-7xl grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-3 sm:gap-4 sm:px-6">
          <Link to="/editor" className="shrink-0" aria-label="CtrlPoint home">
            <img src="/logo.png" className="brand-logo-dark h-7 w-auto" alt="CtrlPoint" />
            <img src="/logo-black.png" className="brand-logo-light h-7 w-auto" alt="CtrlPoint" />
          </Link>

          <nav className="hidden min-w-0 items-center justify-center gap-1 lg:flex">
            <div
              className="flex items-center gap-1 rounded-2xl p-1"
              style={{ background: 'color-mix(in srgb, var(--panel) 78%, transparent)', border: '1px solid var(--line)' }}
            >
              {WEBSITE_NAV.map(({ to, label }) => {
                const active = isActive(to)
                return (
                  <Link
                    key={to}
                    to={to}
                    className="whitespace-nowrap rounded-xl px-3 py-2 text-[13px] font-semibold transition-all xl:px-4"
                    style={{
                      background: active ? 'var(--panel-2)' : 'transparent',
                      border: `1px solid ${active ? 'var(--line-strong)' : 'transparent'}`,
                      color: active ? 'var(--text)' : 'var(--muted)',
                    }}
                  >
                    {label}
                  </Link>
                )
              })}
            </div>
          </nav>

          <div className="flex min-w-0 items-center justify-end gap-1.5 sm:gap-2">
            {ARC_BUILDER_ENABLED && (
              <Link
                to="/arc"
                className="inline-flex h-9 items-center rounded-xl px-3 text-xs font-bold transition-all"
                style={{ color: '#fffdfa', background: 'var(--accent-strong)', border: '1px solid var(--accent-strong)' }}
              >
                DApps
              </Link>
            )}

            <Link
              to="/credits"
              className="flex h-9 items-center gap-1.5 rounded-xl px-2.5 sm:px-3"
              style={{ background: 'var(--panel)', border: '1px solid var(--line-strong)', color: 'var(--text)' }}
              aria-label={`${user?.credits ?? 0} credits. Top up credits`}
            >
              <span className="text-sm font-bold tabular-nums">{user?.credits ?? 0}</span>
              <span className="hidden text-xs font-medium sm:inline" style={{ color: 'var(--muted)' }}>credits</span>
            </Link>

            <div className="hidden md:block">
              <ThemeToggle compact />
            </div>

            <button
              type="button"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
              style={{ color: 'var(--text-soft)', background: 'var(--panel)', border: '1px solid var(--line)' }}
              onClick={() => setMenuOpen(open => !open)}
              aria-expanded={menuOpen}
              aria-label="Open navigation"
            >
              {menuOpen ? <CloseIcon /> : <MenuIcon />}
            </button>
          </div>
        </div>
      </header>

      {menuOpen && (
        <>
          <button
            className="fixed inset-0 z-40 cursor-default"
            style={{ background: 'rgba(0,0,0,.36)', top: 56 }}
            onClick={() => setMenuOpen(false)}
            aria-label="Close navigation"
          />
          <div
            className="fixed right-3 top-[64px] z-50 w-[min(340px,calc(100vw-24px))] rounded-2xl p-2 shadow-2xl animate-scale-in"
            style={{ background: 'var(--panel)', border: '1px solid var(--line-strong)' }}
          >
            <div className="mb-2 flex items-center justify-between rounded-xl px-3 py-2.5" style={{ background: 'var(--panel-2)' }}>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Website workspace</p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>Navigation and appearance</p>
              </div>
              <ThemeToggle compact />
            </div>

            <nav className="grid gap-1">
              <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[.14em]" style={{ color: 'var(--muted-2)' }}>
                Websites
              </p>
              {WEBSITE_NAV.map(({ to, label }) => <MenuLink key={to} to={to} label={label} active={isActive(to)} />)}

              <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[.14em]" style={{ color: 'var(--muted-2)' }}>
                Tools
              </p>
              {ARC_BUILDER_ENABLED && <MenuLink to="/arc" label="DApps" active={pathname === '/arc' || pathname.startsWith('/arc/')} />}
              {WEBSITE_TOOLS.map(({ to, label }) => <MenuLink key={to} to={to} label={label} active={isActive(to)} />)}
            </nav>
          </div>
        </>
      )}
    </>
  )
}

function MenuLink({ to, label, active }: { to: string; label: string; active: boolean }) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between rounded-xl px-3 py-3 text-sm font-semibold transition-colors"
      style={{
        color: active ? 'var(--text)' : 'var(--muted)',
        background: active ? 'var(--panel-2)' : 'transparent',
        border: `1px solid ${active ? 'var(--line)' : 'transparent'}`,
      }}
    >
      {label}
    </Link>
  )
}

function MenuIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
}

function CloseIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
}
