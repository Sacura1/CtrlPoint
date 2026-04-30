import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Header from '../components/Header'
import Preview from '../components/Preview'
import DeployModal from '../components/DeployModal'
import { generate as genApi, sites as sitesApi } from '../api'
import { Site } from '../types'
import { getSiteUrl, mnsPublicDomain } from '../utils/siteUrl'

const MODEL_SELECTION_ENABLED = import.meta.env.VITE_ENABLE_MODEL_SELECTION === 'true'

const MODELS = [
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', full: 'Claude Sonnet 4.6', sub: 'Fast & capable',     provider: 'Anthropic' },
  { id: 'claude-opus-4-7',   label: 'Opus 4.7',   full: 'Claude Opus 4.7',   sub: 'Most powerful',      provider: 'Anthropic' },
  { id: 'gpt-4o',            label: 'GPT-4o',     full: 'GPT-4o',            sub: 'Fast & capable',     provider: 'OpenAI'    },
  { id: 'gpt-5.3',           label: 'GPT-5.3',    full: 'GPT-5.3',           sub: 'Advanced reasoning', provider: 'OpenAI'    },
  { id: 'gpt-5.4',           label: 'GPT-5.4',    full: 'GPT-5.4',           sub: 'High performance',   provider: 'OpenAI'    },
  { id: 'gpt-5.5',           label: 'GPT-5.5',    full: 'GPT-5.5',           sub: 'Flagship reasoning', provider: 'OpenAI'    },
] as const

interface Message { role: 'user' | 'assistant'; content: string }
type MobileTab = 'chat' | 'preview'

export default function Editor() {
  const { siteId } = useParams()
  const navigate = useNavigate()
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const [site, setSite] = useState<Site | null>(null)
  const [html, setHtml] = useState('')
  const [title, setTitle] = useState('New site')
  const [description, setDescription] = useState('')
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "What do you want to build? Describe your site and I'll generate it instantly." },
  ])
  const [input, setInput] = useState('')
  const [generating, setGenerating] = useState(false)
  const [showDeploy, setShowDeploy] = useState(false)
  const [error, setError] = useState('')
  const [hasChanges, setHasChanges] = useState(false)
  const [mobileTab, setMobileTab] = useState<MobileTab>('chat')
  const [selectedModel, setSelectedModel] = useState<string>(
    () => {
      const saved = localStorage.getItem('ctrlpoint_model')
      const valid = MODELS.map(m => m.id as string)
      return saved && valid.includes(saved) ? saved : 'gpt-4o'
    }
  )
  const [modelOpen, setModelOpen] = useState(false)
  const modelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!siteId) {
      // Check for uploaded file pre-load
      const raw = sessionStorage.getItem('ctrlpoint_upload')
      if (raw) {
        try {
          const { html: uploadedHtml, title: uploadedTitle } = JSON.parse(raw)
          sessionStorage.removeItem('ctrlpoint_upload')
          setHtml(uploadedHtml)
          setTitle(uploadedTitle || 'Uploaded Site')
          setHasChanges(true)
          setMessages([{ role: 'assistant', content: "I've loaded your uploaded site. You can deploy it as-is or ask me to make changes." }])
        } catch {}
      }
      return
    }
    sitesApi.get(siteId)
      .then(({ site }) => {
        setSite(site)
        setHtml(site.generatedCode ?? '')
        setTitle(site.title)
        setDescription(site.description)
        setHasChanges(site.needsDeploy)
        setMessages([{ role: 'assistant', content: 'What would you like to change?' }])
      })
      .catch(() => navigate('/dashboard'))
  }, [siteId])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, generating])

useEffect(() => {
    if (!modelOpen) return
    const handler = (e: MouseEvent) => {
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) setModelOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [modelOpen])

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'
  }

  const send = async () => {
    if (!input.trim() || generating) return
    const msg = input.trim()
    setInput('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
    setError('')

    // Clear preview only when starting fresh (no existing HTML)
    if (!site && !html) setHtml('')

    const newMessages: Message[] = [...messages, { role: 'user', content: msg }]
    setMessages(newMessages)
    setGenerating(true)

    const history = newMessages.map(m => ({ role: m.role, content: m.content }))

    try {
      const model = MODEL_SELECTION_ENABLED ? selectedModel : undefined
      let response
      if (site) {
        response = await genApi.update(site.id, history, model)
      } else {
        response = await genApi.chat(history, model, html || undefined)
      }

      if (response.type === 'site') {
        setHtml(response.html!)
        setTitle(response.title!)
        setDescription(response.description!)
        setHasChanges(true)
        setMessages(prev => [...prev, { role: 'assistant', content: 'Done! You can keep refining or deploy when ready.' }])
        setMobileTab('preview')
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: response.text! }])
      }
    } catch (err: any) {
      setError(err.message)
      setMessages(prev => [...prev, { role: 'assistant', content: 'Something went wrong. Try again.' }])
    } finally {
      setGenerating(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const handleDeployed = (newSite: Site) => {
    setSite(newSite)
    navigate(`/editor/${newSite.id}`, { replace: true })
  }

  const handleLive = (siteId: string) => {
    sitesApi.get(siteId).then(({ site: s }) => {
      setSite(s)
      setHasChanges(s.needsDeploy)
    }).catch(() => {})
  }

  const isLive = site?.status === 'LIVE'
  const isBusy = site?.status === 'DEPLOYING' || site?.status === 'UPDATING'
  const liveSiteUrl = site ? getSiteUrl(site.mnsName) : ''

  return (
    <div className="flex flex-col h-dvh overflow-hidden" style={{ background: '#05050d' }}>
      <Header />

      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 sm:px-6 h-11 flex-shrink-0"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>

        <span className="text-ink-400 text-sm truncate max-w-[140px] sm:max-w-xs">{title}</span>

        {isLive && (
          <>
            <div className="h-3.5 w-px hidden sm:block" style={{ background: 'rgba(255,255,255,0.08)' }} />
            <a href={liveSiteUrl} target="_blank" rel="noopener noreferrer"
              className="text-xs font-mono transition-colors hidden sm:block hover:text-brand-300"
              style={{ color: 'rgba(52,211,153,0.8)' }}>
              {site?.mnsName}.{mnsPublicDomain} ↗
            </a>
          </>
        )}

        <div className="flex-1" />

        {/* Mobile toggle */}
        {html && (
          <div className="flex sm:hidden rounded-xl p-0.5 text-xs"
            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
            {(['chat', 'preview'] as MobileTab[]).map(t => (
              <button key={t} onClick={() => setMobileTab(t)}
                className="px-3 py-1 rounded-lg capitalize transition-all duration-200"
                style={mobileTab === t
                  ? { background: 'rgba(255,255,255,0.1)', color: '#f0f0ff' }
                  : { color: 'rgba(255,255,255,0.3)' }}>
                {t}
              </button>
            ))}
          </div>
        )}

{site?.previousCode && (
          <button onClick={async () => {
            try {
              const r = await genApi.revert(site.id)
              if (r.html) setHtml(r.html)
              setMessages(prev => [...prev, { role: 'assistant', content: 'Reverted to previous version.' }])
              setHasChanges(false)
            } catch (e: any) { setError(e.message) }
          }} className="btn-ghost py-1 px-2.5 text-xs hidden sm:inline-flex text-ink-600 hover:text-ink-200">
            ↩ Revert
          </button>
        )}

        {html && (
          <button
            onClick={() => setShowDeploy(true)}
            disabled={!html || isBusy}
            className="btn-primary text-xs py-1.5 px-4"
          >
            {isBusy ? (
              <span className="flex items-center gap-1.5">
                <Spinner size={12} />
                {site?.status === 'UPDATING' ? 'Updating…' : 'Deploying…'}
              </span>
            ) : isLive && !hasChanges ? (
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#34d399', boxShadow: '0 0 6px rgba(52,211,153,0.6)' }} />
                Live
              </span>
            ) : isLive ? 'Push update' : 'Deploy →'}
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* Chat panel */}
        <div className={`
          flex flex-col min-h-0 flex-shrink-0
          w-full sm:w-80 lg:w-96
          ${html || generating ? (mobileTab === 'chat' ? 'flex' : 'hidden sm:flex') : 'flex'}
        `} style={{ borderRight: '1px solid rgba(255,255,255,0.05)' }}>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
            {messages.map((m, i) => (
              <div key={i} className="flex animate-message-in" style={{ animationDelay: `${i * 0.02}s`, justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div className="max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed"
                  style={m.role === 'user' ? {
                    background: 'linear-gradient(135deg, rgba(124,58,237,0.7), rgba(109,40,217,0.7))',
                    border: '1px solid rgba(124,58,237,0.3)',
                    color: '#f0f0ff',
                    borderBottomRightRadius: '4px',
                  } : {
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    color: '#c8c8e0',
                    borderBottomLeftRadius: '4px',
                  }}>
                  {m.content}
                </div>
              </div>
            ))}

            {generating && (
              <div className="flex justify-start animate-fade-in">
                <div className="px-4 py-3 rounded-2xl rounded-bl-sm"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                  <div className="flex gap-1.5">
                    {[0, 0.2, 0.4].map((d, i) => (
                      <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce"
                        style={{ background: 'rgba(124,58,237,0.7)', animationDelay: `${d}s` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Input */}
          <div className="flex-shrink-0 p-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            {error && (() => {
              const isKeyError = /api key|invalid.*key|run out of credits|credits|revoked|quota/i.test(error)
              return (
                <div className="mb-2.5 px-3 py-2 rounded-xl text-xs text-red-400 animate-fade-in"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)' }}>
                  <div className="flex items-start gap-2">
                    <svg className="w-3 h-3 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"/>
                    </svg>
                    <span>{error}</span>
                  </div>
                  {isKeyError && (
                    <a href="/keys" className="mt-1.5 flex items-center gap-1 text-red-400/70 hover:text-red-400 transition-colors duration-150 underline underline-offset-2">
                      Go to API Keys settings →
                    </a>
                  )}
                </div>
              )
            })()}
            <div className="flex gap-2 items-end">
              <div className="flex-1 flex flex-col gap-1.5 min-w-0">
                {/* Model picker */}
                <div ref={modelRef} className="relative self-start">
                  <button
                    onClick={() => setModelOpen(p => !p)}
                    className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs transition-all duration-150"
                    style={{
                      background: modelOpen ? 'rgba(124,58,237,0.1)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${modelOpen ? 'rgba(124,58,237,0.25)' : 'rgba(255,255,255,0.08)'}`,
                      color: 'rgba(200,200,224,0.6)',
                    }}
                  >
                    <span>{MODELS.find(m => m.id === selectedModel)?.label ?? MODELS[0].label}</span>
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" style={{ opacity: 0.5 }}>
                      <path d="M1.5 3L4 5.5L6.5 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>

                  {modelOpen && (
                    <div className="absolute bottom-full left-0 mb-1.5 w-56 rounded-xl overflow-hidden animate-fade-in z-10"
                      style={{
                        background: 'rgba(10,10,24,0.98)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        boxShadow: '0 16px 40px rgba(0,0,0,0.7)',
                      }}>
                      {!MODEL_SELECTION_ENABLED && (
                        <div className="px-3 py-2 flex items-center gap-1.5"
                          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(124,58,237,0.06)' }}>
                          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                            <circle cx="6" cy="6" r="5" stroke="#a78bfa" strokeWidth="1.2"/>
                            <path d="M6 5v3M6 3.5v.5" stroke="#a78bfa" strokeWidth="1.2" strokeLinecap="round"/>
                          </svg>
                          <span className="text-xs" style={{ color: '#a78bfa' }}>Model selection coming soon</span>
                        </div>
                      )}
                      {MODELS.map((m, i) => {
                        const active = MODEL_SELECTION_ENABLED && m.id === selectedModel
                        const selectable = MODEL_SELECTION_ENABLED
                        return (
                          <div key={m.id}
                            onClick={() => {
                              if (!selectable) return
                              setSelectedModel(m.id)
                              localStorage.setItem('ctrlpoint_model', m.id)
                              setModelOpen(false)
                            }}
                            className="flex items-center justify-between px-3 py-2.5 transition-colors duration-100"
                            style={{
                              borderTop: i > 0 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                              background: active ? 'rgba(124,58,237,0.12)' : 'transparent',
                              cursor: selectable ? 'pointer' : 'default',
                            }}
                            onMouseEnter={e => { if (selectable && !active) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                            onMouseLeave={e => { if (selectable && !active) e.currentTarget.style.background = 'transparent' }}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="text-xs font-medium" style={{ color: active ? '#c4b5fd' : selectable ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.35)' }}>{m.full}</p>
                                <span className="text-xs px-1 py-px rounded flex-shrink-0"
                                  style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.2)', fontSize: '9px' }}>
                                  {m.provider}
                                </span>
                              </div>
                              <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.2)' }}>{m.sub}</p>
                            </div>
                            {active && (
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="flex-shrink-0 ml-2">
                                <path d="M2 6l3 3 5-5" stroke="#a78bfa" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                <textarea
                  ref={inputRef}
                  className="input w-full resize-none text-sm py-2.5 min-h-[42px] leading-snug"
                  placeholder={html ? 'What should I change?' : 'Describe your website…'}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  rows={1}
                />
              </div>
              <button onClick={send} disabled={!input.trim() || generating}
                className="btn-primary p-2.5 flex-shrink-0 rounded-xl self-end">
                <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
                  <path d="M13 7.5H2M8 3l5 4.5L8 12" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Preview panel */}
        <div className={`
          flex-1 min-h-0 p-3 sm:p-4
          ${html || generating ? (mobileTab === 'preview' ? 'flex' : 'hidden sm:flex') : 'hidden sm:flex'}
          flex-col
        `}>
          <Preview html={html} generating={generating} className="flex-1 min-h-0" />
        </div>
      </div>

      {showDeploy && (
        <DeployModal
          generatedCode={html}
          title={title}
          description={description}
          lastPrompt={messages.filter(m => m.role === 'user').pop()?.content ?? ''}
          existingSite={site ?? undefined}
          onClose={() => setShowDeploy(false)}
          onDeployed={handleDeployed}
          onLive={handleLive}
        />
      )}
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
