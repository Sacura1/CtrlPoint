import { useState, useEffect } from 'react'
import Header from '../components/Header'
import { keys as keysApi } from '../api'

export default function Keys() {
  const [savedKeys, setSavedKeys] = useState<Record<string, boolean>>({ openai: false, anthropic: false })
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({ openai: '', anthropic: '' })
  const [keyAdding, setKeyAdding] = useState<string | null>(null)
  const [keyRemoving, setKeyRemoving] = useState<string | null>(null)
  const [keyMsg, setKeyMsg] = useState<{ provider: string; ok: boolean; text: string } | null>(null)
  const [loadingKeys, setLoadingKeys] = useState(true)

  useEffect(() => {
    keysApi.list()
      .then(({ keys }) => setSavedKeys(keys))
      .catch(err => setKeyMsg({ provider: 'openai', ok: false, text: err.message }))
      .finally(() => setLoadingKeys(false))
  }, [])

  const saveKey = async (provider: string) => {
    const apiKey = keyInputs[provider]?.trim()
    if (!apiKey) return
    setKeyAdding(provider)
    setKeyMsg(null)
    try {
      await keysApi.save(provider, apiKey)
      setSavedKeys(prev => ({ ...prev, [provider]: true }))
      setKeyInputs(prev => ({ ...prev, [provider]: '' }))
      setKeyMsg({ provider, ok: true, text: 'Key saved.' })
    } catch (err: any) {
      setKeyMsg({ provider, ok: false, text: err.message })
    } finally {
      setKeyAdding(null)
    }
  }

  const removeKey = async (provider: string) => {
    setKeyRemoving(provider)
    setKeyMsg(null)
    try {
      await keysApi.remove(provider)
      setSavedKeys(prev => ({ ...prev, [provider]: false }))
      setKeyMsg({ provider, ok: true, text: 'Key removed.' })
    } catch (err: any) {
      setKeyMsg({ provider, ok: false, text: err.message })
    } finally {
      setKeyRemoving(null)
    }
  }

  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg)' }}>
      <Header />

      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 right-[30%] w-[500px] h-[300px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(var(--brand-600-rgb),0.15) 0%, transparent 70%)', filter: 'blur(100px)' }} />
      </div>

      <main className="relative z-10 max-w-2xl mx-auto px-4 sm:px-6 py-10 animate-fade-in">

        <div className="mb-8">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>API Keys</h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>
            Add your own keys to use them instead of platform credits. When a key is saved it's used automatically — remove it to go back to credits.
          </p>
          <div className="mt-3 flex items-start gap-2 px-3 py-2.5 rounded-xl"
            style={{ background: 'rgba(var(--success-rgb),0.06)', border: '1px solid rgba(var(--success-rgb),0.15)' }}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none" className="flex-shrink-0 mt-0.5">
              <path d="M5.5 7.5l1.5 1.5 2.5-3" stroke="var(--success)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="7" cy="7" r="5.5" stroke="var(--success)" strokeWidth="1.2"/>
            </svg>
            <p className="text-xs leading-relaxed" style={{ color: 'var(--success)' }}>
              Keys are encrypted with AES-256 before storage and never shown again after saving. Transmitted over HTTPS only — this is standard practice used by OpenRouter, LangChain, and others.
            </p>
          </div>
        </div>

        <div className="rounded-2xl overflow-hidden"
          style={{ background: 'color-mix(in srgb, var(--panel) 78%, transparent)', border: '1px solid var(--line)' }}>
          <div className="px-5 py-5">
            {loadingKeys ? (
              <KeysSkeleton />
            ) : (['openai', 'anthropic'] as const).map((provider, i) => {
              const hasSaved = savedKeys[provider]
              const label = provider === 'openai' ? 'OpenAI' : 'Anthropic'
              const placeholder = provider === 'openai' ? 'sk-...' : 'sk-ant-...'
              const description = provider === 'openai'
                ? 'Used for GPT-4o and GPT-5 models'
                : 'Used for Claude Sonnet and Opus models'
              const msg = keyMsg?.provider === provider ? keyMsg : null
              return (
                <div key={provider}
                  className={i > 0 ? 'mt-6 pt-6' : ''}
                  style={i > 0 ? { borderTop: '1px solid var(--line)' } : {}}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2.5 mb-0.5">
                        <span className="text-base font-bold" style={{ color: 'var(--text)' }}>{label}</span>
                        {hasSaved && (
                          <span className="text-xs px-2 py-0.5 rounded-lg font-semibold flex items-center gap-1"
                            style={{ background: 'rgba(var(--success-rgb),0.12)', border: '1px solid rgba(var(--success-rgb),0.25)', color: 'var(--success)' }}>
                            <span className="w-1.5 h-1.5 rounded-full inline-block animate-pulse" style={{ background: 'var(--success)' }} />
                            In use
                          </span>
                        )}
                      </div>
                      <p className="text-sm" style={{ color: 'var(--muted)' }}>{description}</p>
                      {hasSaved && (
                        <p className="text-xs mt-1" style={{ color: 'var(--success)' }}>
                          Your key is being used automatically — platform credits are not charged.
                        </p>
                      )}
                    </div>
                    {hasSaved && (
                      <button
                        onClick={() => removeKey(provider)}
                        disabled={keyRemoving === provider}
                        className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-all duration-200 flex-shrink-0 mt-0.5"
                        style={{ color: 'rgba(248,113,113,0.8)', border: '1px solid rgba(248,113,113,0.2)', background: 'rgba(248,113,113,0.07)' }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#f87171'; e.currentTarget.style.borderColor = 'rgba(248,113,113,0.4)' }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'rgba(248,113,113,0.8)'; e.currentTarget.style.borderColor = 'rgba(248,113,113,0.2)' }}>
                        {keyRemoving === provider ? 'Removing…' : 'Remove'}
                      </button>
                    )}
                  </div>
                  {hasSaved ? (
                    <div>
                      <div className="px-3.5 py-2.5 rounded-xl text-sm font-mono"
                        style={{ background: 'color-mix(in srgb, var(--panel-2) 70%, transparent)', border: '1px solid var(--line)', color: 'var(--muted-2)' }}>
                        ••••••••••••••••••••••••••••••
                      </div>
                      <p className="text-xs mt-1.5" style={{ color: 'var(--muted-2)' }}>
                        If your key stops working (invalid or out of credits), remove it and add a new one — you'll see an error message in the editor.
                      </p>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        className="input flex-1 text-sm font-mono"
                        placeholder={placeholder}
                        type="password"
                        value={keyInputs[provider] || ''}
                        onChange={e => setKeyInputs(prev => ({ ...prev, [provider]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') saveKey(provider) }}
                      />
                      <button
                        onClick={() => saveKey(provider)}
                        disabled={keyAdding === provider || !keyInputs[provider]?.trim()}
                        className="btn-primary text-sm px-4 py-2 flex-shrink-0 font-semibold">
                        {keyAdding === provider ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  )}
                  {msg && (
                    <p className={`text-xs mt-2 font-medium ${msg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{msg.text}</p>
                  )}
                </div>
              )
            })}
          </div>
        </div>

      </main>
    </div>
  )
}

function KeysSkeleton() {
  return (
    <>
      {[0, 1].map(i => (
        <div key={i}
          className={i > 0 ? 'mt-6 pt-6' : ''}
          style={i > 0 ? { borderTop: '1px solid var(--line)' } : {}}>
          <div className="flex items-start justify-between mb-3">
            <div className="min-w-0 flex-1">
              <div className="skeleton h-5 w-24 mb-2" />
              <div className="skeleton h-4 w-64 max-w-full" />
            </div>
            <div className="skeleton h-7 w-16 rounded-lg flex-shrink-0" />
          </div>
          <div className="skeleton h-10 w-full rounded-xl" />
        </div>
      ))}
    </>
  )
}
