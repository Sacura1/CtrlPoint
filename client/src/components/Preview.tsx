import { useEffect, useMemo, useState } from 'react'

interface PreviewProps {
  html: string
  generating?: boolean
  loading?: boolean
  className?: string
  instant?: boolean
  publicUrl?: string
}

function withPreviewContext(html: string, publicUrl?: string) {
  if (!html) return html
  const context = `<script id="ctrlpoint-preview-context">
window.CTRLPOINT_IS_PREVIEW=true;
window.CTRLPOINT_PUBLIC_URL=${JSON.stringify(publicUrl || null)};
</script>`
  return /<head[\s>]/i.test(html)
    ? html.replace(/<head([^>]*)>/i, `<head$1>${context}`)
    : `${context}${html}`
}

export default function Preview({ html, generating = false, loading = false, className = '', instant = false, publicUrl }: PreviewProps) {
  const [frameReady, setFrameReady] = useState(false)
  const previewHtml = useMemo(() => withPreviewContext(html, publicUrl), [html, publicUrl])

  useEffect(() => {
    setFrameReady(false)
  }, [previewHtml])

  const waitingForPreview = loading || Boolean(html && !generating && !frameReady)

  return (
    <div className={`flex flex-col rounded-2xl overflow-hidden ${className}`}
      style={{ border: '1px solid var(--line)', background: 'var(--bg)' }}>

      {/* Browser chrome */}
      <div className="flex items-center gap-2 px-4 py-2.5 flex-shrink-0"
        style={{ background: 'color-mix(in srgb, var(--panel) 78%, transparent)', borderBottom: '1px solid var(--line)' }}>
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--panel-2) 92%, transparent)' }} />
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--panel-2) 92%, transparent)' }} />
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--panel-2) 92%, transparent)' }} />
        </div>
        <div className="flex-1 rounded-lg px-3 py-1 mx-1"
          style={{ background: 'color-mix(in srgb, var(--panel-2) 70%, transparent)' }}>
          <span className="text-xs font-mono" style={{ color: 'var(--muted-2)' }}>
            {generating ? 'building...' : waitingForPreview ? 'loading preview...' : 'preview'}
          </span>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 relative min-h-0">

        {/* Empty state */}
        {!html && !generating && !loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center select-none px-6">
              <div className="w-14 h-14 mx-auto mb-5 rounded-3xl flex items-center justify-center"
                style={{ background: 'rgba(var(--brand-600-rgb),0.08)', border: '1px solid rgba(var(--brand-600-rgb),0.15)' }}>
                <svg className="w-6 h-6" style={{ color: 'rgba(var(--brand-600-rgb),0.5)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <rect x="2" y="3" width="20" height="14" rx="2" strokeWidth="1.2"/>
                  <path strokeLinecap="round" strokeWidth="1.2" d="M8 21h8M12 17v4"/>
                </svg>
              </div>
              <p className="text-sm font-medium" style={{ color: 'var(--muted-2)' }}>Preview will appear here</p>
              <p className="text-xs mt-1" style={{ color: 'var(--muted-2)' }}>Describe your site to get started</p>
            </div>
          </div>
        )}

        {waitingForPreview && !generating && (
          <div className="absolute inset-0 z-10 p-5 sm:p-7" style={{ background: 'var(--panel)' }}>
            <div className="mx-auto max-w-3xl">
              <div className="skeleton h-5 w-24 rounded-md" />
              <div className="skeleton mt-8 h-11 w-3/4 max-w-md rounded-lg" />
              <div className="skeleton mt-3 h-4 w-full max-w-xl rounded-md" />
              <div className="skeleton mt-2 h-4 w-5/6 max-w-lg rounded-md" />
              <div className="mt-9 grid sm:grid-cols-3 gap-3">
                {[0, 1, 2].map(item => <div key={item} className="skeleton h-28 rounded-xl" />)}
              </div>
              <div className="skeleton mt-6 h-40 rounded-xl" />
            </div>
          </div>
        )}

        {/* Generating state */}
        {generating && (
          <div className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden">
            {/* Animated orbs */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-1/4 left-1/4 w-48 h-48 rounded-full opacity-30 animate-float"
                style={{ background: 'radial-gradient(circle, rgba(var(--brand-600-rgb),0.6) 0%, transparent 70%)', filter: 'blur(40px)' }} />
              <div className="absolute bottom-1/4 right-1/4 w-40 h-40 rounded-full opacity-20 animate-float-slow"
                style={{ background: 'radial-gradient(circle, rgba(var(--brand-500-rgb),0.5) 0%, transparent 70%)', filter: 'blur(50px)', animationDelay: '2s' }} />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full opacity-15 animate-orb-pulse"
                style={{ background: 'radial-gradient(circle, rgba(var(--brand-400-rgb),0.4) 0%, transparent 70%)', filter: 'blur(30px)' }} />
            </div>

            {/* Scan line */}
            <div className="absolute inset-x-0 h-[2px] opacity-40 animate-build-scan"
              style={{
                top: '45%',
                background: 'linear-gradient(90deg, transparent, rgba(var(--brand-600-rgb),0.8), rgba(var(--brand-400-rgb),1), rgba(var(--brand-600-rgb),0.8), transparent)',
                backgroundSize: '60% 100%',
                filter: 'blur(1px)',
              }} />

            {/* Center content */}
            <div className="relative z-10 text-center">
              {/* Spinning ring */}
              <div className="relative w-16 h-16 mx-auto mb-5">
                <svg className="w-16 h-16 animate-spin-slow" viewBox="0 0 64 64" fill="none">
                  <circle cx="32" cy="32" r="28" stroke="rgba(var(--brand-600-rgb),0.15)" strokeWidth="2"/>
                  <path d="M60 32a28 28 0 00-28-28" stroke="url(#grad)" strokeWidth="2" strokeLinecap="round"/>
                  <defs>
                    <linearGradient id="grad" x1="32" y1="4" x2="60" y2="32" gradientUnits="userSpaceOnUse">
                      <stop stopColor="var(--brand-600)"/>
                      <stop offset="1" stopColor="var(--brand-400)"/>
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-5 h-5 rounded-full animate-pulse"
                    style={{ background: 'radial-gradient(circle, rgba(var(--brand-600-rgb),0.8) 0%, transparent 100%)' }} />
                </div>
              </div>

              <p className="text-sm font-semibold mb-2 shimmer-text">Agent is working…</p>

              {/* Dots */}
              <div className="flex items-center justify-center gap-1.5">
                {[0, 0.25, 0.5].map((d, i) => (
                  <div key={i} className="w-1.5 h-1.5 rounded-full animate-pulse-dot"
                    style={{ background: 'rgba(var(--brand-600-rgb),0.7)', animationDelay: `${d}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* iframe */}
        {html && (
          <iframe
            key={`${html.length}:${publicUrl || 'draft'}`}
            srcDoc={previewHtml}
            sandbox="allow-scripts allow-same-origin"
            title="Site Preview"
            onLoad={() => setFrameReady(true)}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              border: 'none',
              background: '#fff',
              opacity: frameReady && !loading ? 1 : 0,
              transition: instant ? 'none' : 'opacity 0.4s ease',
            }}
          />
        )}
      </div>
    </div>
  )
}
