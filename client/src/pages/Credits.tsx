import Header from '../components/Header'
import { useAuth } from '../store/auth'

export default function Credits() {
  const { user } = useAuth()

  return (
    <div className="min-h-dvh" style={{ background: '#05050d' }}>
      <Header />

      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-[30%] w-[500px] h-[300px] opacity-08 rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.3) 0%, transparent 70%)', filter: 'blur(100px)' }} />
      </div>

      <main className="relative z-10 max-w-lg mx-auto px-4 sm:px-6 py-10 animate-fade-in">
        <p className="text-xs font-semibold mb-3 uppercase tracking-widest" style={{ color: '#8888aa' }}>
          Credits
        </p>
        <div className="rounded-2xl overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="px-5 py-4 flex items-center justify-between">
            <p className="text-sm text-ink-400">Current balance</p>
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl"
              style={{ background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.2)' }}>
              <span className="text-xl font-bold text-brand-400 tabular-nums">{user?.credits ?? 0}</span>
              <span className="text-xs text-ink-600">credits</span>
            </div>
          </div>
          <div className="px-5 py-10 text-center" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <p className="text-lg font-semibold text-ink-100">Coming soon.</p>
          </div>
        </div>
      </main>
    </div>
  )
}
