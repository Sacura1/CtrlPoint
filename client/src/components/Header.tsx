import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../store/auth'

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
        background: 'rgba(5,5,13,0.88)',
        borderBottom: '1px solid rgba(255,255,255,0.09)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
      }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between relative"
          style={{ height: '56px' }}>

          {/* Logo */}
          <Link to="/editor" className="flex-shrink-0 z-10">
            <img src="/logo.png" className="h-7 w-auto" alt="CtrlPoint" />
          </Link>

          {/* Desktop nav — truly centered */}
          <nav className="hidden md:flex absolute left-1/2 -translate-x-1/2 items-center gap-1 px-1.5 py-1.5 rounded-2xl"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
            {NAV.map(({ to, label }) => {
              const active = isActive(to)
              return (
                <Link key={to} to={to}
                  className="px-4 py-2 rounded-xl text-[13px] font-semibold transition-all duration-200 whitespace-nowrap"
                  style={{
                    background: active ? 'rgba(255,255,255,0.11)' : 'transparent',
                    border: `1px solid ${active ? 'rgba(255,255,255,0.14)' : 'transparent'}`,
                    color: active ? '#f0f0ff' : 'rgba(200,200,224,0.55)',
                    boxShadow: active ? '0 1px 0 rgba(255,255,255,0.07) inset' : 'none',
                    letterSpacing: '0.01em',
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.color = '#c8c8e0' }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'rgba(200,200,224,0.55)' }}
                >
                  {label}
                </Link>
              )
            })}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2 z-10">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl" style={{
              background: 'rgba(124,58,237,0.12)',
              border: '1px solid rgba(167,139,250,0.25)',
            }}>
              <span className="font-bold tabular-nums" style={{ color: '#a78bfa', fontSize: '14px' }}>{user?.credits ?? 0}</span>
              <span className="hidden sm:inline text-xs font-medium" style={{ color: 'rgba(167,139,250,0.7)' }}>credits</span>
            </div>

            {/* Mobile quick-nav buttons */}
            <div className="md:hidden flex items-center gap-1.5">
              <Link to="/editor"
                className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                style={{
                  background: isActive('/editor') ? 'rgba(255,255,255,0.11)' : 'rgba(255,255,255,0.06)',
                  border: `1px solid ${isActive('/editor') ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.1)'}`,
                  color: isActive('/editor') ? '#f0f0ff' : '#c8c8e0',
                }}>
                Build
              </Link>
              <Link to="/deploy"
                className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
                style={{
                  background: isActive('/deploy') ? 'rgba(124,58,237,0.25)' : 'rgba(124,58,237,0.12)',
                  border: `1px solid ${isActive('/deploy') ? 'rgba(167,139,250,0.4)' : 'rgba(167,139,250,0.25)'}`,
                  color: isActive('/deploy') ? '#f0f0ff' : '#c4b5fd',
                }}>
                Deploy
              </Link>
            </div>

            {/* Hamburger — mobile only */}
            <button
              className="md:hidden p-2 rounded-lg"
              style={{ color: '#c8c8e0' }}
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
          style={{ background: 'rgba(5,5,13,0.97)', top: '56px', backdropFilter: 'blur(24px)' }}>
          <nav className="flex flex-col px-5 pt-6 pb-8 gap-1">
            {NAV.map(({ to, label }) => {
              const active = isActive(to)
              return (
                <Link key={to} to={to}
                  className="flex items-center px-4 py-3.5 rounded-xl text-base font-semibold transition-all duration-150"
                  style={{
                    background: active ? 'rgba(255,255,255,0.08)' : 'transparent',
                    border: `1px solid ${active ? 'rgba(255,255,255,0.12)' : 'transparent'}`,
                    color: active ? '#f0f0ff' : '#8888aa',
                  }}>
                  {label}
                </Link>
              )
            })}
          </nav>
        </div>
      )}
    </>
  )
}
