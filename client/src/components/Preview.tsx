import { useState, useEffect } from 'react'

interface PreviewProps {
  html: string
  generating?: boolean
  className?: string
}

export default function Preview({ html, generating = false, className = '' }: PreviewProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (html && !generating) {
      // Small delay to allow iframe to mount before fading in
      const t = setTimeout(() => setVisible(true), 80)
      return () => clearTimeout(t)
    } else {
      setVisible(false)
    }
  }, [html, generating])

  return (
    <div className={`flex flex-col rounded-2xl overflow-hidden ${className}`}
      style={{ border: '1px solid rgba(255,255,255,0.07)', background: '#05050d' }}>

      {/* Browser chrome */}
      <div className="flex items-center gap-2 px-4 py-2.5 flex-shrink-0"
        style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }} />
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }} />
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'rgba(255,255,255,0.1)' }} />
        </div>
        <div className="flex-1 rounded-lg px-3 py-1 mx-1"
          style={{ background: 'rgba(255,255,255,0.04)' }}>
          <span className="text-xs font-mono" style={{ color: 'rgba(255,255,255,0.2)' }}>
            {html && !generating ? 'preview' : generating ? 'building…' : 'preview'}
          </span>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 relative min-h-0">

        {/* Empty state */}
        {!html && !generating && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center select-none px-6">
              <div className="w-14 h-14 mx-auto mb-5 rounded-3xl flex items-center justify-center"
                style={{ background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.15)' }}>
                <svg className="w-6 h-6" style={{ color: 'rgba(124,58,237,0.5)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <rect x="2" y="3" width="20" height="14" rx="2" strokeWidth="1.2"/>
                  <path strokeLinecap="round" strokeWidth="1.2" d="M8 21h8M12 17v4"/>
                </svg>
              </div>
              <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.2)' }}>Preview will appear here</p>
              <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.1)' }}>Describe your site to get started</p>
            </div>
          </div>
        )}

        {/* Generating state */}
        {generating && (
          <div className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden">
            {/* Animated orbs */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-1/4 left-1/4 w-48 h-48 rounded-full opacity-30 animate-float"
                style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.6) 0%, transparent 70%)', filter: 'blur(40px)' }} />
              <div className="absolute bottom-1/4 right-1/4 w-40 h-40 rounded-full opacity-20 animate-float-slow"
                style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.5) 0%, transparent 70%)', filter: 'blur(50px)', animationDelay: '2s' }} />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full opacity-15 animate-orb-pulse"
                style={{ background: 'radial-gradient(circle, rgba(167,139,250,0.4) 0%, transparent 70%)', filter: 'blur(30px)' }} />
            </div>

            {/* Scan line */}
            <div className="absolute inset-x-0 h-[2px] opacity-40 animate-build-scan"
              style={{
                top: '45%',
                background: 'linear-gradient(90deg, transparent, rgba(124,58,237,0.8), rgba(167,139,250,1), rgba(124,58,237,0.8), transparent)',
                backgroundSize: '60% 100%',
                filter: 'blur(1px)',
              }} />

            {/* Center content */}
            <div className="relative z-10 text-center">
              {/* Spinning ring */}
              <div className="relative w-16 h-16 mx-auto mb-5">
                <svg className="w-16 h-16 animate-spin-slow" viewBox="0 0 64 64" fill="none">
                  <circle cx="32" cy="32" r="28" stroke="rgba(124,58,237,0.15)" strokeWidth="2"/>
                  <path d="M60 32a28 28 0 00-28-28" stroke="url(#grad)" strokeWidth="2" strokeLinecap="round"/>
                  <defs>
                    <linearGradient id="grad" x1="32" y1="4" x2="60" y2="32" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#7c3aed"/>
                      <stop offset="1" stopColor="#a78bfa"/>
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-5 h-5 rounded-full animate-pulse"
                    style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.8) 0%, transparent 100%)' }} />
                </div>
              </div>

              <p className="text-sm font-semibold mb-2 shimmer-text">AI is building your site…</p>

              {/* Dots */}
              <div className="flex items-center justify-center gap-1.5">
                {[0, 0.25, 0.5].map((d, i) => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full animate-pulse-dot"
                    style={{ background: 'rgba(124,58,237,0.7)', animationDelay: `${d}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* iframe */}
        {html && (
          <iframe
            key={html.length}
            srcDoc={html}
            sandbox="allow-scripts allow-same-origin"
            title="Site Preview"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              border: 'none',
              background: '#fff',
              opacity: visible ? 1 : 0,
              transition: 'opacity 0.4s ease',
            }}
          />
        )}
      </div>
    </div>
  )
}
