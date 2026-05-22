import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { upload as uploadApi } from '../api'

interface Props {
  onClose: () => void
}

export default function UploadModal({ onClose }: Props) {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const processFile = useCallback(async (file: File) => {
    setError('')
    setUploading(true)
    try {
      const result = await uploadApi.file(file)

      if (result.multiFile) {
        setError(result.message || 'Multi-file project detected. Connect GitHub to deploy.')
        return
      }

      // Store in sessionStorage so Editor can pre-load it
      sessionStorage.setItem('ctrlpoint_upload', JSON.stringify({
        html: result.html,
        title: result.title || 'Uploaded Site',
      }))
      navigate('/editor')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }, [navigate])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [processFile])

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-md animate-scale-in"
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--line)',
          borderRadius: '20px',
          boxShadow: '0 32px 100px rgba(0,0,0,0.8)',
        }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5"
          style={{ borderBottom: '1px solid var(--line)' }}>
          <div>
            <h2 className="font-bold text-ink-50">Upload site</h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
              Drop an HTML file or a zipped static site
            </p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
            style={{ color: 'var(--muted)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted)')}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Drop zone */}
        <div className="p-6">
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => !uploading && inputRef.current?.click()}
            className="flex flex-col items-center justify-center py-10 rounded-2xl cursor-pointer transition-all duration-200"
            style={{
              border: `2px dashed ${dragging ? 'rgba(var(--brand-600-rgb),0.6)' : 'var(--line)'}`,
              background: dragging ? 'rgba(var(--brand-600-rgb),0.06)' : 'color-mix(in srgb, var(--panel) 72%, transparent)',
            }}
          >
            <input ref={inputRef} type="file" accept=".html,.zip" className="hidden" onChange={onFileChange} />

            {uploading ? (
              <>
                <svg className="animate-spin mb-3" width="28" height="28" viewBox="0 0 28 28" fill="none">
                  <circle cx="14" cy="14" r="11" stroke="rgba(var(--brand-600-rgb),0.2)" strokeWidth="3"/>
                  <path d="M25 14a11 11 0 00-11-11" stroke="var(--brand-600)" strokeWidth="3" strokeLinecap="round"/>
                </svg>
                <p className="text-sm font-medium text-ink-200">Processing…</p>
              </>
            ) : (
              <>
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4"
                  style={{ background: 'rgba(var(--brand-600-rgb),0.1)', border: '1px solid rgba(var(--brand-600-rgb),0.2)' }}>
                  <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                    <path d="M11 14V4M7 8l4-4 4 4" stroke="var(--brand-400)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M3 16v1a2 2 0 002 2h12a2 2 0 002-2v-1" stroke="var(--brand-400)" strokeWidth="1.8" strokeLinecap="round"/>
                  </svg>
                </div>
                <p className="text-sm font-semibold text-ink-100 mb-1">Drop your file here</p>
                <p className="text-xs text-ink-600">or click to browse</p>
                <div className="flex gap-2 mt-4">
                  {['.html', '.zip'].map(ext => (
                    <span key={ext} className="text-xs px-2.5 py-1 rounded-lg font-mono"
                      style={{ background: 'color-mix(in srgb, var(--panel-2) 74%, transparent)', border: '1px solid var(--line)', color: 'var(--muted)' }}>
                      {ext}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="mt-4 px-4 py-3 rounded-xl animate-fade-in"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
              <p className="text-xs text-red-400 leading-relaxed">{error}</p>
              {error.includes('GitHub') && (
                <p className="text-xs mt-1.5" style={{ color: 'var(--muted)' }}>
                  GitHub Connect is coming soon — you'll be able to link your repo and auto-deploy on every push.
                </p>
              )}
            </div>
          )}

          {/* Info */}
          <p className="text-xs mt-4 text-center" style={{ color: 'var(--muted-2)' }}>
            Single self-contained HTML files and simple zip archives are supported.
            For React / Vue / framework builds, use GitHub Connect.
          </p>
        </div>
      </div>
    </div>
  )
}
