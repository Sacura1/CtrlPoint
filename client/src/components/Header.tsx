import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../store/auth'

export default function Header() {
  const { user } = useAuth()
  const { pathname } = useLocation()

  const navLink = (to: string, label: string) => {
    const active = pathname === to || (to !== '/editor' ? false : pathname.startsWith('/editor'))
    return (
      <Link to={to} className={`relative px-3 py-1.5 rounded-lg text-sm transition-all duration-200 ${
        active ? 'text-ink-50' : 'text-ink-600 hover:text-ink-200'
      }`}>
        {active && (
          <span className="absolute inset-0 rounded-lg" style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
          }} />
        )}
        <span className="relative">{label}</span>
      </Link>
    )
  }

  return (
    <header className="sticky top-0 z-50" style={{
      background: 'rgba(5,5,13,0.7)',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
    }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">

        <div className="flex items-center gap-5">
          <Link to="/editor" className="flex-shrink-0">
            <img src="/logo.png" className="h-6 w-auto" alt="CtrlPoint" />
          </Link>

          <nav className="flex items-center gap-0.5">
            {navLink('/editor', 'Build')}
            {navLink('/dashboard', 'Sites')}
            {navLink('/settings', 'Settings')}
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm" style={{
            background: 'rgba(124,58,237,0.1)',
            border: '1px solid rgba(124,58,237,0.2)',
          }}>
            <span className="font-bold text-brand-400 tabular-nums">{user?.credits ?? 0}</span>
            <span className="text-ink-600 hidden sm:inline text-xs">credits</span>
          </div>
        </div>
      </div>
    </header>
  )
}
