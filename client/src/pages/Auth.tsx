import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { GoogleLogin } from '@react-oauth/google'
import { useAuth } from '../store/auth'
import { auth as authApi } from '../api'

export default function Auth() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [showEmail, setShowEmail] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [massaAddress, setMassaAddress] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login, register, setUser } = useAuth()
  const navigate = useNavigate()

  const done = () => navigate('/editor')

  const handleGoogle = async (idToken: string) => {
    setError('')
    setLoading(true)
    try {
      const { user } = await authApi.google(idToken)
      setUser(user)
      done()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'login') await login(email, password)
      else await register(email, password, massaAddress || undefined)
      done()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-4" style={{ background: '#05050d' }}>

      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[50%] -translate-x-1/2 w-[700px] h-[400px] rounded-full opacity-25"
          style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.4) 0%, transparent 70%)', filter: 'blur(80px)' }} />
        <div className="fixed inset-0 bg-grid-pattern bg-grid opacity-50" />
      </div>

      <div className="relative z-10 w-full max-w-[360px] animate-scale-in">

        {/* Logo */}
        <div className="flex justify-center mb-8">
          <Link to="/">
            <img src="/logo.png" className="h-9 w-auto" alt="CtrlPoint" />
          </Link>
        </div>

        {/* Card */}
        <div className="card p-7" style={{
          background: 'rgba(255,255,255,0.03)',
          boxShadow: '0 1px 0 rgba(255,255,255,0.07) inset, 0 24px 80px rgba(0,0,0,0.6)',
        }}>
          <h1 className="text-lg font-bold text-ink-50 mb-1">
            {mode === 'login' ? 'Welcome back' : 'Create account'}
          </h1>
          <p className="text-ink-600 text-sm mb-6">
            {mode === 'register' ? '3 free credits on signup.' : 'Sign in to your account.'}
          </p>

          {/* Google — primary */}
          <div className={`w-full mb-5 transition-opacity ${loading ? 'opacity-40 pointer-events-none' : ''}`}>
            <GoogleLogin
              onSuccess={cred => cred.credential && handleGoogle(cred.credential)}
              onError={() => setError('Google sign-in failed.')}
              theme="filled_black"
              shape="rectangular"
              size="large"
              width="316"
              text="continue_with"
            />
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
            <span className="text-ink-600 text-xs">or</span>
            <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
          </div>

          {/* Email toggle */}
          {!showEmail ? (
            <button onClick={() => setShowEmail(true)} className="btn-secondary w-full text-sm">
              Continue with email
            </button>
          ) : (
            <form onSubmit={handleEmail} className="space-y-3 animate-fade-in">
              <input
                className="input"
                type="email"
                placeholder="Email address"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
              />
              <input
                className="input"
                type="password"
                placeholder={mode === 'register' ? 'Password (min 8 chars)' : 'Password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
              {mode === 'register' && (
                <input
                  className="input font-mono text-xs"
                  placeholder="Massa address (optional) — AS1..."
                  value={massaAddress}
                  onChange={e => setMassaAddress(e.target.value)}
                />
              )}
              <button type="submit" disabled={loading} className="btn-primary w-full mt-1">
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Spinner size={14} /> Please wait…
                  </span>
                ) : mode === 'login' ? 'Sign in' : 'Create account'}
              </button>
            </form>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 flex items-start gap-2.5 px-3.5 py-3 rounded-xl animate-fade-in"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <svg className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"/>
              </svg>
              <p className="text-red-400 text-xs leading-relaxed">{error}</p>
            </div>
          )}
        </div>

        <p className="text-center text-ink-600 text-sm mt-5">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setShowEmail(false) }}
            className="text-brand-400 hover:text-brand-300 transition-colors font-medium"
          >
            {mode === 'login' ? 'Sign up free' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}

function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className="animate-spin">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeOpacity="0.2"/>
      <path d="M14 8a6 6 0 00-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}
