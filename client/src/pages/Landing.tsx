import { Link } from 'react-router-dom'
import { useAuth } from '../store/auth'

const FEATURES = [
  { icon: <ChainIcon />, label: 'Truly on-chain' },
  { icon: <DomainIcon />, label: 'Your domain' },
  { icon: <AiIcon />,    label: 'AI-powered' },
]

export default function Landing() {
  const { user } = useAuth()

  return (
    <div className="min-h-dvh flex flex-col overflow-x-hidden" style={{ background: '#05050d' }}>

      {/* Ambient orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-20%] left-[10%] w-[600px] h-[600px] rounded-full opacity-20 animate-orb-pulse"
          style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.4) 0%, transparent 70%)', filter: 'blur(60px)' }} />
        <div className="absolute top-[20%] right-[-10%] w-[400px] h-[400px] rounded-full opacity-15 animate-float-slow"
          style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.3) 0%, transparent 70%)', filter: 'blur(80px)' }} />
        <div className="absolute bottom-[-10%] left-[30%] w-[500px] h-[300px] rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, rgba(109,40,217,0.5) 0%, transparent 70%)', filter: 'blur(100px)' }} />
        <div className="fixed inset-0 bg-grid-pattern bg-grid" />
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 sm:px-10 h-16"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <img src="/logo.png" className="h-7 w-auto" alt="CtrlPoint" />
        <Link to={user ? '/editor' : '/auth'} className="btn-primary text-sm py-2 px-5">
          {user ? 'Open editor' : 'Get started →'}
        </Link>
      </nav>

      {/* Hero */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-6 pt-12 pb-24 sm:pt-20">

        <div className="inline-flex items-center gap-2 mb-8 px-4 py-1.5 rounded-full text-xs font-medium animate-fade-in"
          style={{ background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.25)', color: '#a78bfa' }}>
          <span className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse-dot" />
          Deployed on Massa DeWeb · Mainnet
        </div>

        <h1 className="text-5xl sm:text-7xl lg:text-8xl font-black tracking-tight leading-[0.95] mb-6 animate-slide-up"
            style={{ animationDelay: '0.05s' }}>
          <span className="text-gradient">Build once.</span>
          <br />
          <span className="text-ink-50">Live forever.</span>
        </h1>

        <p className="text-ink-400 text-lg sm:text-xl mb-10 max-w-sm animate-slide-up"
           style={{ animationDelay: '0.12s' }}>
          Describe your site. AI builds it. One click puts it on the blockchain.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-3 animate-slide-up" style={{ animationDelay: '0.2s' }}>
          <Link to="/auth" className="btn-primary text-base px-8 py-3.5">
            Start building free →
          </Link>
          <a href="https://massa.net" target="_blank" rel="noopener noreferrer"
            className="text-sm text-ink-600 hover:text-ink-400 transition-colors">
            What is Massa? ↗
          </a>
        </div>

        {/* Feature chips */}
        <div className="mt-16 flex flex-wrap justify-center gap-2.5 animate-fade-in" style={{ animationDelay: '0.35s' }}>
          {FEATURES.map(f => (
            <div key={f.label} className="flex items-center gap-2 px-4 py-2 rounded-full text-ink-400 text-sm transition-all duration-200 hover:text-ink-200 cursor-default"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              {f.icon}
              {f.label}
            </div>
          ))}
        </div>
      </main>

      <footer className="relative z-10 text-center text-ink-600 text-xs py-6"
        style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        © 2025 CtrlPoint ·{' '}
        <a href="https://massa.net" target="_blank" rel="noopener noreferrer"
           className="hover:text-ink-400 transition-colors">Built on Massa</a>
      </footer>
    </div>
  )
}

function ChainIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <path d="M5.5 8.5l-2-2a2.12 2.12 0 010-3l1-1a2.12 2.12 0 013 0l2 2M8.5 5.5l2 2a2.12 2.12 0 010 3l-1 1a2.12 2.12 0 01-3 0l-2-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  )
}
function DomainIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M7 1.5C7 1.5 5 4 5 7s2 5.5 2 5.5M7 1.5C7 1.5 9 4 9 7s-2 5.5-2 5.5M1.5 7h11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
}
function AiIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <path d="M7 1v2M7 11v2M1 7h2M11 7h2M3 3l1.5 1.5M9.5 9.5L11 11M11 3l-1.5 1.5M4.5 9.5L3 11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.3"/>
    </svg>
  )
}
function CardIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
      <rect x="1.5" y="3.5" width="11" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.3"/>
      <path d="M1.5 6h11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
}
