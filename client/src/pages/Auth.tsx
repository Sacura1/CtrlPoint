import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { useGoogleLogin } from '@react-oauth/google'
import { useAuth } from '../store/auth'
import { apiUrl, auth as authApi } from '../api'

export default function Auth() {
  const [searchParams] = useSearchParams()
  const [mode, setMode] = useState<'login' | 'register'>(
    searchParams.get('mode') === 'register' ? 'register' : 'login'
  )
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { setUser, user, loading: authLoading } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!authLoading && user) navigate('/editor', { replace: true })
  }, [authLoading, user, navigate])

  useEffect(() => {
    const oauthError = searchParams.get('error')
    if (oauthError) setError(oauthError)
  }, [searchParams])

  const done = () => navigate('/editor')

  const handleGoogle = async (accessToken: string) => {
    setError('')
    setLoading(true)
    try {
      const { user } = await authApi.google(accessToken, 'accessToken')
      setUser(user)
      done()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const googleLogin = useGoogleLogin({
    onSuccess: (tokenResponse) => handleGoogle(tokenResponse.access_token),
    onError: () => {
      setLoading(false)
      setError('Google sign-in failed. Please try again or use email instead.')
    },
  })

  if (authLoading || user) {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{ background: '#05050d' }}>
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
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

          {/* Google */}
          <button
            onClick={() => googleLogin()}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2.5 mb-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.8)',
              opacity: loading ? 0.4 : 1,
            }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
          >
            <GoogleIcon />
            Continue with Google
          </button>

          {/* GitHub */}
          <a href={loading ? undefined : apiUrl('/github/auth')}
            aria-disabled={loading}
            className="w-full flex items-center justify-center gap-2.5 mb-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200"
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.8)',
              opacity: loading ? 0.4 : 1,
            }}
            onClick={e => { if (loading) e.preventDefault() }}
            onMouseEnter={e => { if (!loading) e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
            </svg>
            Continue with GitHub
          </a>


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
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}
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

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}
