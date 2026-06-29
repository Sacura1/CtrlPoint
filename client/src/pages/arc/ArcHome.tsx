import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Header from '../../components/Header'
import { appConfig, arcDapps, type ArcWeb3Category, type ModelOption } from '../../api'
import { DEFAULT_MODELS } from '../../config/models'
import { useAuth } from '../../store/auth'
import type { ArcDapp } from '../../types'
import { ARC_BUSY_STATUSES, ARC_CATEGORIES, ArcCategoryIcon, categoryLabel } from './arcConfig'

function initialModel() {
  const saved = localStorage.getItem('ctrlpoint_model')
  return saved && DEFAULT_MODELS.some(option => option.id === saved)
    ? saved
    : DEFAULT_MODELS[0].id
}

export default function ArcHome() {
  const navigate = useNavigate()
  const { user, setUser } = useAuth()
  const [prompt, setPrompt] = useState('')
  const [category, setCategory] = useState<ArcWeb3Category>('payment-links')
  const [models, setModels] = useState<ModelOption[]>(DEFAULT_MODELS)
  const [model, setModel] = useState(initialModel)
  const [modelSelectionEnabled, setModelSelectionEnabled] = useState(true)
  const [recent, setRecent] = useState<ArcDapp[]>([])
  const [loadingRecent, setLoadingRecent] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    appConfig.get().then(config => {
      setModelSelectionEnabled(config.enableModelSelection)
      if (!config.models.length) return

      setModels(config.models)
      setModel(current => {
        if (config.models.some(option => option.id === current)) return current
        const configured = config.models.some(option => option.id === config.activeModel)
          ? config.activeModel
          : config.models[0].id
        localStorage.setItem('ctrlpoint_model', configured)
        return configured
      })
    }).catch(() => {
      // Keep the last known/default catalog available if configuration is temporarily slow.
    })

    arcDapps.list().then(projects => {
      setRecent(projects.dapps.slice(0, 3))
    }).catch(() => {
      setRecent([])
    }).finally(() => setLoadingRecent(false))
  }, [])

  const selected = useMemo(() => ARC_CATEGORIES.find(item => item.id === category)!, [category])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError('')
    if (prompt.trim().length < 10) {
      setError('Describe the dApp in a little more detail.')
      return
    }
    setSubmitting(true)
    try {
      const { dapp, credits } = await arcDapps.create({
        prompt: prompt.trim(),
        category,
        model: modelSelectionEnabled ? model || undefined : undefined,
        reasoningEffort: 'medium',
      })
      if (typeof credits === 'number' && user) setUser({ ...user, credits })
      navigate(`/arc/build/${dapp.id}`)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-dvh overflow-x-hidden" style={{ background: 'var(--bg)' }}>
      <Header />
      <main className="w-full min-w-0 max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="flex items-start justify-between gap-5 mb-7 sm:mb-8">
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <span className="h-2 w-2 rounded-full" style={{ background: 'var(--brand-400)', boxShadow: '0 0 14px rgba(var(--brand-400-rgb),.45)' }} />
              <span className="arc-page-eyebrow">builder</span>
            </div>
            <h1 className="text-[1.65rem] sm:text-4xl font-bold tracking-tight leading-tight" style={{ color: 'var(--text)' }}>
              What should your dApp do?
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 sm:text-base" style={{ color: 'var(--muted)' }}>
              CtrlPoint builds the interface and, when needed, a contract you own from deployment.
            </p>
          </div>
          <Link to="/arc/projects" className="hidden sm:inline-flex btn-secondary text-sm px-4 py-2.5 whitespace-nowrap">
            My dApps
          </Link>
        </div>

        <form onSubmit={submit} className="w-full min-w-0 grid lg:grid-cols-[minmax(0,1.45fr)_minmax(260px,.55fr)] gap-4 mb-11">
          <div className="input-shell min-w-0 rounded-2xl p-3 sm:p-4" style={{
            background: 'color-mix(in srgb, var(--panel) 92%, transparent)',
            border: '1px solid var(--line-strong)',
            boxShadow: '0 18px 60px rgba(0,0,0,.12), inset 0 1px 0 rgba(255,255,255,.04)',
          }}>
            <textarea
              value={prompt}
              onChange={event => setPrompt(event.target.value)}
              placeholder="What do you want to build?"
              rows={5}
              className="w-full min-w-0 resize-none bg-transparent px-2 py-2 text-base leading-7 outline-none"
              style={{ color: 'var(--text)' }}
              maxLength={5000}
            />
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 mt-2" style={{ borderTop: '1px solid var(--line)' }}>
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs" style={{ color: 'var(--muted)' }}>Building</span>
                <span className="rounded-lg px-2.5 py-1 text-xs font-semibold truncate"
                  style={{ color: 'var(--text-soft)', background: 'var(--panel-2)', border: '1px solid var(--line)' }}>
                  {selected.label}
                </span>
                {selected.contract && (
                  <span className="text-[11px] font-semibold" style={{ color: 'var(--brand-400)' }}></span>
                )}
              </div>
              <button disabled={submitting} className="btn-primary px-5 py-2.5 text-sm min-w-[132px]">
                {submitting ? 'Starting...' : 'Build dApp'}
              </button>
            </div>
            {error && <p className="mt-3 px-2 text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
          </div>

          <div className="min-w-0 rounded-2xl p-5 flex flex-col justify-between" style={{ background: 'var(--panel)', border: '1px solid var(--line)' }}>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--muted)' }}>Build settings</p>
              <p className="mt-2 text-sm leading-5" style={{ color: 'var(--text-soft)' }}>
                Contract apps are compiled and checked before deployment. You connect the owner wallet only when publishing.
              </p>
            </div>
            {modelSelectionEnabled && models.length > 0 && (
              <label className="mt-5 block">
                <span className="mb-1.5 block text-xs font-semibold" style={{ color: 'var(--muted)' }}>Model</span>
                <select
                  value={model}
                  onChange={event => {
                    setModel(event.target.value)
                    localStorage.setItem('ctrlpoint_model', event.target.value)
                  }}
                  className="input w-full text-sm py-2.5"
                >
                  {models.map(option => <option key={option.id} value={option.id}>{option.label} · {option.cost} credits minimum</option>)}
                </select>
              </label>
            )}
          </div>
        </form>

        <section>
          <div className="flex items-end justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Start with a product type</h2>
              <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>This keeps the generated contract and interface focused.</p>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {ARC_CATEGORIES.map(item => {
              const active = item.id === category
              return (
                <button key={item.id} type="button" onClick={() => setCategory(item.id)}
                  className="text-left rounded-xl p-4 transition-all duration-200 active:scale-[.985]"
                  style={{
                    minHeight: 156,
                    background: active ? 'color-mix(in srgb, var(--accent) 10%, var(--panel))' : 'var(--panel)',
                    border: `1px solid ${active ? 'rgba(var(--accent-rgb),.48)' : 'var(--line)'}`,
                    boxShadow: active ? '0 14px 36px rgba(var(--accent-rgb),.11), inset 0 1px 0 rgba(255,255,255,.05)' : 'inset 0 1px 0 rgba(255,255,255,.025)',
                  }}>
                  <div className="flex items-start justify-between gap-3">
                    <span className="h-10 w-10 rounded-xl flex items-center justify-center"
                      style={{ color: active ? 'var(--brand-300)' : 'var(--text-soft)', border: '1px solid var(--line-strong)', background: 'color-mix(in srgb, var(--panel-2) 74%, transparent)' }}>
                      <ArcCategoryIcon>{item.icon}</ArcCategoryIcon>
                    </span>
                    {item.contract && (
                      <span className="text-[9px] uppercase tracking-[.12em] font-bold" style={{ color: active ? 'var(--brand-300)' : 'var(--muted-2)' }}>Onchain</span>
                    )}
                  </div>
                  <h3 className="mt-4 text-sm font-bold" style={{ color: 'var(--text)' }}>{item.label}</h3>
                  <p className="mt-1.5 text-xs leading-5" style={{ color: 'var(--muted)' }}>{item.description}</p>
                </button>
              )
            })}
          </div>
        </section>

        {(loadingRecent || recent.length > 0) && (
          <section className="mt-12 pt-8" style={{ borderTop: '1px solid var(--line)' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Recent dApps</h2>
              <Link to="/arc/projects" className="text-sm font-semibold" style={{ color: 'var(--brand-400)' }}>View all</Link>
            </div>
            <div className="grid md:grid-cols-3 gap-3">
              {loadingRecent ? [1, 2, 3].map(item => <div key={item} className="skeleton h-28 rounded-xl" />) : recent.map(project => (
                <Link key={project.id} to={`/arc/build/${project.id}`} className="card card-hover rounded-xl p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>{categoryLabel(project.category)}</span>
                    <span className="text-[10px] font-bold uppercase tracking-[.1em]"
                      style={{ color: ARC_BUSY_STATUSES.has(project.status) ? 'var(--brand-400)' : 'var(--muted-2)' }}>
                      {ARC_BUSY_STATUSES.has(project.status) ? 'Building' : project.site?.status === 'LIVE' ? 'Live' : 'Draft'}
                    </span>
                  </div>
                  <p className="mt-4 font-semibold truncate" style={{ color: 'var(--text)' }}>{project.site?.title || 'Untitled dApp'}</p>
                  <p className="mt-1 text-xs truncate" style={{ color: 'var(--muted)' }}>{project.buildStep || project.site?.description}</p>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
