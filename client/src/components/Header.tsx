import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../store/auth'
import ThemeToggle from './ThemeToggle'

const NAV = [
  { to: '/editor',      label: 'Build'         },
  { to: '/dashboard',   label: 'Web-Apps'       },
  { to: '/deploy',      label: 'Deploy'         },
  { to: '/deployments', label: 'Deployments'    },
  { to: '/github',      label: 'GitHub'         },
  { to: '/keys',        label: 'API Keys'       },
  { to: '/settings',    label: 'Settings'       },
]

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
      <header className="sticky top-0 z-50" style={{
        background: 'color-mix(in srgb, var(--bg) 88%, transparent)',
        borderBottom: '1px solid var(--line)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
      }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between relative"
          style={{ height: '56px' }}>

          {/* Logo */}
          <Link to="/editor" className="flex-shrink-0 z-10">
            <img src="/logo.png" className="brand-logo-dark h-7 w-auto" alt="CtrlPoint" />
            <img src="/logo-black.png" className="brand-logo-light h-7 w-auto" alt="CtrlPoint" />
          </Link>

          {/* Desktop nav — truly centered */}
          <nav className="hidden md:flex absolute left-1/2 -translate-x-1/2 items-center gap-1 px-1.5 py-1.5 rounded-2xl"
            style={{ background: 'color-mix(in srgb, var(--panel) 76%, transparent)', border: '1px solid var(--line)' }}>
            {NAV.map(({ to, label }) => {
              const active = isActive(to)
              return (
                <Link key={to} to={to}
                  className="px-4 py-2 rounded-xl text-[13px] font-semibold transition-all duration-200 whitespace-nowrap"
                  style={{
                    background: active ? 'color-mix(in srgb, var(--panel-2) 88%, transparent)' : 'transparent',
                    border: `1px solid ${active ? 'var(--line-strong)' : 'transparent'}`,
                    color: active ? 'var(--text)' : 'color-mix(in srgb, var(--text-soft) 58%, transparent)',
                    boxShadow: active ? '0 1px 0 rgba(255,255,255,0.07) inset' : 'none',
                    letterSpacing: '0.01em',
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--text-soft)' }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'color-mix(in srgb, var(--text-soft) 58%, transparent)' }}
                >
                  {label}
                </Link>
              )
            })}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2 z-10">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl" style={{
              background: 'linear-gradient(135deg, color-mix(in srgb, var(--panel) 88%, transparent), color-mix(in srgb, var(--panel-2) 92%, transparent))',
              border: '1px solid var(--line-strong)',
              boxShadow: '0 1px 0 rgba(255,255,255,0.06) inset, 0 8px 24px rgba(0,0,0,0.08)',
            }}>
              <span className="font-bold tabular-nums" style={{ color: 'var(--text)', fontSize: '14px' }}>{user?.credits ?? 0}</span>
              <span className="hidden sm:inline text-xs font-medium" style={{ color: 'var(--muted)' }}>credits</span>
              <Link to="/credits"
                className="ml-1 flex h-5 w-5 items-center justify-center rounded-lg text-xs font-bold transition-all"
                style={{ background: 'var(--accent, var(--brand-600))', color: '#fffdfa', border: '1px solid rgba(var(--accent-rgb, var(--brand-400-rgb)),0.34)', boxShadow: '0 4px 12px rgba(var(--accent-rgb, var(--brand-600-rgb)),0.16)' }}
                aria-label="Top up credits">
                +
              </Link>
            </div>
            <div className="hidden md:block">
              <ThemeToggle compact />
            </div>
            <Link to="/support"
              className="hidden md:flex h-9 w-9 items-center justify-center rounded-xl transition-all"
              style={{ color: isActive('/support') ? 'var(--text)' : 'var(--text-soft)', background: 'color-mix(in srgb, var(--panel) 80%, transparent)', border: '1px solid var(--line)' }}
              aria-label="Support"
              title="Support">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
                <path d="M8 9h8M8 13h5" />
              </svg>
            </Link>

            {/* Mobile quick-nav buttons */}
            <div className="md:hidden flex items-center gap-1.5">
              <Link to="/editor"
                className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                style={{
                  background: isActive('/editor') ? 'color-mix(in srgb, var(--panel-2) 88%, transparent)' : 'color-mix(in srgb, var(--panel) 78%, transparent)',
                  border: `1px solid ${isActive('/editor') ? 'var(--line-strong)' : 'var(--line)'}`,
                  color: isActive('/editor') ? 'var(--text)' : 'var(--text-soft)',
                }}>
                Build
              </Link>
              <Link to="/deploy"
                className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                style={{
                  background: isActive('/deploy') ? 'rgba(var(--brand-600-rgb),0.22)' : 'rgba(var(--brand-600-rgb),0.12)',
                  border: `1px solid ${isActive('/deploy') ? 'rgba(var(--brand-400-rgb),0.38)' : 'rgba(var(--brand-400-rgb),0.25)'}`,
                  color: isActive('/deploy') ? 'var(--text)' : 'var(--text-soft)',
                }}>
                Deploy
              </Link>
            </div>

            {/* Hamburger — mobile only */}
            <button
              className="md:hidden p-2 rounded-lg"
              style={{ color: 'var(--text-soft)' }}
              onClick={() => setMenuOpen(v => !v)}
              aria-label="Toggle menu"
            >
              {menuOpen ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                  <path d="M4 6h16M4 12h16M4 18h16"/>
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-40 animate-fade-in"
          style={{ background: 'color-mix(in srgb, var(--bg) 97%, transparent)', top: '56px', backdropFilter: 'blur(24px)' }}>
          <nav className="flex flex-col px-5 pt-6 pb-8 gap-1">
            <div className="mb-3 flex items-center justify-between rounded-2xl px-4 py-3"
              style={{ background: 'color-mix(in srgb, var(--panel) 84%, transparent)', border: '1px solid var(--line)' }}>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Appearance</p>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>Switch light or dark mode</p>
              </div>
              <ThemeToggle compact />
            </div>
            {NAV.map(({ to, label }) => {
              const active = isActive(to)
              return (
                <Link key={to} to={to}
                  className="flex items-center px-4 py-3.5 rounded-xl text-base font-semibold transition-all duration-150"
                  style={{
                    background: active ? 'color-mix(in srgb, var(--panel-2) 82%, transparent)' : 'transparent',
                    border: `1px solid ${active ? 'var(--line-strong)' : 'transparent'}`,
                    color: active ? 'var(--text)' : 'var(--muted)',
                  }}>
                  {label}
                </Link>
              )
            })}
            <Link to="/support"
              className="flex items-center px-4 py-3.5 rounded-xl text-base font-semibold transition-all duration-150"
              style={{
                background: isActive('/support') ? 'color-mix(in srgb, var(--panel-2) 82%, transparent)' : 'transparent',
                border: `1px solid ${isActive('/support') ? 'var(--line-strong)' : 'transparent'}`,
                color: isActive('/support') ? 'var(--text)' : 'var(--muted)',
              }}>
              Support
            </Link>
          </nav>
        </div>
      )}
    </>
  )
}
