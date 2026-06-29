import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import Header from '../components/Header'
import Preview from '../components/Preview'
import DeployModal from '../components/DeployModal'
import { appConfig, generate as genApi, sites as sitesApi, ModelOption, GenerationMode, ArcWeb3Category } from '../api'
import { Site } from '../types'
import { getSiteDomain, getSiteUrl } from '../utils/siteUrl'
import ClaimedBadge from '../components/ClaimedBadge'
import { useAuth } from '../store/auth'
import { DEFAULT_MODELS, DEFAULT_REASONING_EFFORTS } from '../config/models'

interface Message { role: 'user' | 'assistant'; content: string }
type MobileTab = 'chat' | 'preview'

const STARTER_PROMPTS = [
  {
    title: 'SaaS Landing',
    prompt: 'Build a polished SaaS landing page for an AI scheduling assistant. Include hero, product workflow, feature sections, pricing, testimonials, FAQ, and a strong signup CTA.',
  },
  {
    title: 'Portfolio',
    prompt: 'Create a modern portfolio website for a senior product designer. Include selected projects, case study cards, services, about section, contact CTA, and tasteful interactions.',
  },
  {
    title: 'Local Business',
    prompt: 'Build a premium restaurant website for a modern Lagos fusion restaurant. Include menu highlights, reservation CTA, opening hours, location, gallery-style visuals, and mobile-friendly navigation.',
  },
  {
    title: 'Event Page',
    prompt: 'Build a conference website for an AI builders summit. Include agenda, speakers, venue, sponsor section, ticket CTA, countdown, and responsive mobile layout.',
  },
  {
    title: 'News Blog',
    prompt: 'Create a clean tech news blog homepage. Include featured story, category filters, article cards, newsletter signup, trending sidebar, and a polished editorial layout.',
  },
]

const ARC_STARTER_PROMPTS = [
  {
    title: 'Wallet Stats',
    category: 'wallet-tools' as const,
    prompt: 'Build an Arc Testnet wallet stats app. Let users connect or paste a wallet address and show USDC balance, transaction count, explorer links, and a clean wallet reputation score.',
  },
  {
    title: 'Payment Request',
    category: 'payment-links' as const,
    prompt: 'Build a USDC payment request app for Arc Testnet. Let someone enter recipient, amount, reason, and due date, generate a payment panel, connect wallet, send USDC, and show paid receipt details.',
  },
  {
    title: 'Receipt Viewer',
    category: 'wallet-tools' as const,
    prompt: 'Build an Arc Testnet transaction receipt viewer. Let users paste a transaction hash, fetch status, sender, receiver, gas used, block number, and show a clean shareable receipt with explorer links.',
  },
  {
    title: 'Tip Jar',
    category: 'tip-jar' as const,
    prompt: 'Build a creator tip jar for Arc Testnet USDC. Include creator profile, suggested tip amounts, wallet connect, payment action, recent local receipts, and a polished mobile-first design.',
  },
  {
    title: 'Game',
    category: 'games' as const,
    prompt: 'Build a fun Arc Testnet tapping game. Players connect a wallet, play a 10-second tapping challenge, and see a local community leaderboard with explorer-ready wallet links. Make it clear this v1 leaderboard is a testnet demo.',
  },
  {
    title: 'Wallet Health',
    category: 'eligibility' as const,
    prompt: 'Build an Arc Testnet wallet health app. Let users connect or paste a wallet address, then show native USDC balance, transaction count, explorer links, and simple readable wallet signals. Keep it clean and do not include eligibility thresholds or airdrop-style pass/fail checks.',
  },
  {
    title: 'Voting Poll',
    category: 'voting-polls' as const,
    prompt: 'Build an Arc Testnet voting poll dApp for the CtrlPoint poll contract template. Include wallet connect, poll options, vote action, results display, contract setup state, and a polished community voting UI.',
  },
  {
    title: 'Membership Pass',
    category: 'membership' as const,
    prompt: 'Build an Arc Testnet membership pass dApp for the CtrlPoint membership contract template. Include wallet connect, membership status, plan card, join flow, contract setup state, and a clean access pass dashboard.',
  },
  {
    title: 'Split Payment',
    category: 'split-payments' as const,
    prompt: 'Build an Arc Testnet split payment dApp for the CtrlPoint split contract template. Show fixed recipients, split preview, wallet connect, payment action, contract setup state, and receipt details.',
  },
  {
    title: 'Arc Dashboard',
    category: 'dashboards' as const,
    prompt: 'Build an Arc Testnet dashboard for monitoring wallets and transaction hashes. Include cards, status panels, explorer links, and clean RPC-powered lookup tools.',
  },
  {
    title: 'Wallet Monitor',
    category: 'dashboards' as const,
    prompt: 'Build an Arc Testnet wallet monitor dashboard. Let users add several wallet addresses, compare native USDC balances and transaction counts, inspect pasted transaction hashes, and open ArcScan links.',
  },
]

const ARC_CATEGORIES: Array<{ id: ArcWeb3Category; label: string; sub: string }> = [
  { id: 'custom', label: 'Custom dApp', sub: 'Purpose-built contract' },
  { id: 'wallet-tools', label: 'Wallet Tools', sub: 'Stats, balances, receipts' },
  { id: 'payment-links', label: 'Payment Links', sub: 'USDC request pages' },
  { id: 'tip-jar', label: 'Tip Jar', sub: 'Creator support pages' },
  { id: 'games', label: 'Games', sub: 'Leaderboard contract' },
  { id: 'eligibility', label: 'Wallet Health', sub: 'Stats and signals' },
  { id: 'voting-polls', label: 'Voting', sub: 'Poll contract' },
  { id: 'membership', label: 'Membership', sub: 'Pass contract' },
  { id: 'split-payments', label: 'Split Pay', sub: 'Split contract' },
  { id: 'dashboards', label: 'Dashboards', sub: 'RPC/data views' },
]

const ARC_CONTRACT_CATEGORIES = new Set<ArcWeb3Category>([
  'custom',
  'payment-links',
  'split-payments',
  'voting-polls',
  'membership',
  'games',
])

function draftNameFromTitle(title: string) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42) || 'web-app'
  const suffix = Date.now().toString(36).slice(-6)
  return `${base}-${suffix}`.slice(0, 100).replace(/-+$/g, '')
}

function initialAssistantMessage(mode: GenerationMode) {
  return mode === 'arc-web3'
    ? ''
    : "What do you want to build? Describe your site and I'll generate it instantly."
}

function updateEditorViewportMetrics() {
  const viewport = window.visualViewport
  const height = Math.round(viewport?.height || window.innerHeight)
  const layoutHeight = Math.max(window.innerHeight, document.documentElement.clientHeight || 0)
  const keyboardInset = viewport
    ? Math.max(0, Math.round(layoutHeight - viewport.height - viewport.offsetTop))
    : 0

  document.documentElement.style.setProperty('--editor-viewport-height', `${height}px`)
  document.documentElement.style.setProperty('--editor-keyboard-inset', `${keyboardInset}px`)
}

export default function Editor() {
  const { user, setUser } = useAuth()
  const { siteId } = useParams()
  const navigate = useNavigate()
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const [site, setSite] = useState<Site | null>(null)
  const [loadingSite, setLoadingSite] = useState(Boolean(siteId))
  const [html, setHtml] = useState('')
  const [title, setTitle] = useState('New site')
  const [description, setDescription] = useState('')
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: initialAssistantMessage('site') },
  ])
  const [input, setInput] = useState('')
  const [inputFocused, setInputFocused] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [showDeploy, setShowDeploy] = useState(false)
  const [error, setError] = useState('')
  const [creditError, setCreditError] = useState('')
  const [hasChanges, setHasChanges] = useState(false)
  const [mobileTab, setMobileTab] = useState<MobileTab>(() => siteId ? 'preview' : 'chat')
  const [generationMode, setGenerationMode] = useState<GenerationMode>('site')
  const [arcCategory, setArcCategory] = useState<ArcWeb3Category | ''>('')
  const [modelSelectionEnabled, setModelSelectionEnabled] = useState(false)
  const [loadingConfig, setLoadingConfig] = useState(true)
  const [activeDefaultModel, setActiveDefaultModel] = useState(DEFAULT_MODELS[0].id)
  const [models, setModels] = useState<ModelOption[]>(DEFAULT_MODELS)
  const [reasoningEfforts, setReasoningEfforts] = useState(DEFAULT_REASONING_EFFORTS)
  const [selectedModel, setSelectedModel] = useState<string>(
    () => {
      const saved = localStorage.getItem('ctrlpoint_model')
      return saved || DEFAULT_MODELS[0].id
    }
  )
  const [selectedReasoningEffort, setSelectedReasoningEffort] = useState<string>(
    () => localStorage.getItem('ctrlpoint_reasoning_effort') || 'medium'
  )
  const [modelOpen, setModelOpen] = useState(false)
  const [reasoningOpen, setReasoningOpen] = useState(false)
  const modelRef = useRef<HTMLDivElement>(null)
  const reasoningRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    updateEditorViewportMetrics()
    window.visualViewport?.addEventListener('resize', updateEditorViewportMetrics)
    window.visualViewport?.addEventListener('scroll', updateEditorViewportMetrics)
    window.addEventListener('resize', updateEditorViewportMetrics)
    return () => {
      window.visualViewport?.removeEventListener('resize', updateEditorViewportMetrics)
      window.visualViewport?.removeEventListener('scroll', updateEditorViewportMetrics)
      window.removeEventListener('resize', updateEditorViewportMetrics)
      document.documentElement.style.removeProperty('--editor-viewport-height')
      document.documentElement.style.removeProperty('--editor-keyboard-inset')
    }
  }, [])

  useEffect(() => {
    appConfig.get()
      .then(({ enableModelSelection, activeModel, models, reasoningEfforts }) => {
        setModelSelectionEnabled(enableModelSelection)
        setActiveDefaultModel(activeModel)
        if (models.length > 0) {
          setModels(models)
          setSelectedModel(current => {
            if (models.some(model => model.id === current)) return current
            const next = models[0].id
            localStorage.setItem('ctrlpoint_model', next)
            return next
          })
        }
        if (reasoningEfforts.openai.length > 0 && reasoningEfforts.anthropic.length > 0) {
          setReasoningEfforts(reasoningEfforts)
        }
      })
      .catch(() => setModelSelectionEnabled(false))
      .finally(() => setLoadingConfig(false))
  }, [])

  useEffect(() => {
    if (!siteId) {
      setLoadingSite(false)
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
    setLoadingSite(true)
    sitesApi.get(siteId)
      .then(({ site }) => {
        setSite(site)
        setHtml(site.generatedCode ?? '')
        setTitle(site.title)
        setDescription(site.description)
        setHasChanges(site.needsDeploy)
        setMessages([{ role: 'assistant', content: 'What would you like to change?' }])
        setMobileTab('preview')
      })
      .catch(() => navigate('/dashboard'))
      .finally(() => setLoadingSite(false))
  }, [siteId])

  useEffect(() => {
    if (!site && !html && !generating && generationMode === 'arc-web3' && messages.length === 0) return
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, generating, site, html, generationMode])

useEffect(() => {
    if (!modelOpen) return
    const handler = (e: MouseEvent) => {
      if (modelRef.current && !modelRef.current.contains(e.target as Node)) setModelOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [modelOpen])

useEffect(() => {
    if (!reasoningOpen) return
    const handler = (e: MouseEvent) => {
      if (reasoningRef.current && !reasoningRef.current.contains(e.target as Node)) setReasoningOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [reasoningOpen])

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'
  }

  const changeGenerationMode = (mode: GenerationMode) => {
    if (mode === 'arc-web3') return
    setGenerationMode(mode)
    if (!site && !html && (messages.length === 0 || (messages.length === 1 && messages[0]?.role === 'assistant'))) {
      const nextMessage = initialAssistantMessage(mode)
      setMessages(nextMessage ? [{ role: 'assistant', content: nextMessage }] : [])
    }
  }

  const send = async (promptOverride?: string, arcCategoryOverride?: ArcWeb3Category) => {
    const msg = (promptOverride ?? input).trim()
    if (!msg || generating) return
    const effectiveArcCategory = arcCategoryOverride ?? arcCategory
    if (!site && !html && generationMode === 'arc-web3' && !effectiveArcCategory) {
      setError('Choose an Arc app type before generating.')
      return
    }
    if (arcCategoryOverride) setArcCategory(arcCategoryOverride)
    setInput('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
    setError('')
    setCreditError('')

    // Clear preview only when starting fresh (no existing HTML)
    if (!site && !html) setHtml('')

    const newMessages: Message[] = [...messages, { role: 'user', content: msg }]
    setMessages(newMessages)
    setGenerating(true)

    const history = newMessages.map(m => ({ role: m.role, content: m.content }))

    try {
      const model = modelSelectionEnabled ? selectedModel : undefined
      const activeModel = models.find(m => m.id === selectedModel) ?? models[0]
      const reasoningEffort = modelSelectionEnabled && activeModel.supportsReasoning ? activeReasoningEffort : undefined
      let response
      if (site) {
        response = await genApi.update(site.id, history, model, reasoningEffort)
      } else {
        response = await genApi.chat(history, model, html || undefined, reasoningEffort, generationMode, generationMode === 'arc-web3' && effectiveArcCategory ? effectiveArcCategory : undefined)
      }

      if (response.type === 'site') {
        setHtml(response.html!)
        setTitle(response.title!)
        setDescription(response.description!)
        setHasChanges(true)
        if (!site) {
          try {
            const { site: draftSite } = await sitesApi.create({
              mnsName: draftNameFromTitle(response.title!),
              generatedCode: response.html!,
              title: response.title!,
              description: response.description!,
              lastPrompt: msg,
              ...(generationMode === 'arc-web3' && effectiveArcCategory ? { arcCategory: effectiveArcCategory } : {}),
            })
            setSite(draftSite)
          } catch (draftErr: any) {
            setError(`Site generated, but draft autosave failed: ${draftErr.message}`)
          }
        }
        setMessages(prev => [...prev, { role: 'assistant', content: 'Done! You can keep refining or deploy when ready.' }])
        setMobileTab('preview')
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: response.text! }])
      }
      if (typeof response.credits === 'number' && user) {
        setUser({ ...user, credits: response.credits })
      }
    } catch (err: any) {
      const message = err.message || 'Something went wrong.'
      const isCreditError = /insufficient credits|top up|credit\(s\)|not enough credits/i.test(message)
      if (isCreditError) {
        setCreditError(message)
        setMessages(prev => [...prev, { role: 'assistant', content: 'You need more credits to run this request.' }])
      } else {
        setError(message)
        setMessages(prev => [...prev, { role: 'assistant', content: 'Something went wrong. Try again.' }])
      }
    } finally {
      setGenerating(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const startNewChat = () => {
    sessionStorage.removeItem('ctrlpoint_upload')
    setSite(null)
    setHtml('')
    setTitle('New site')
    setDescription('')
    setMessages([{ role: 'assistant', content: initialAssistantMessage('site') }])
    setInput('')
    setError('')
    setCreditError('')
    setHasChanges(false)
    setShowDeploy(false)
    setMobileTab('chat')
    setGenerationMode('site')
    setArcCategory('')
    if (inputRef.current) inputRef.current.style.height = 'auto'
    if (siteId) navigate('/editor')
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

  const closeDeployModal = (deploymentStarted?: boolean) => {
    setShowDeploy(false)
    if (deploymentStarted) navigate('/deployments')
  }

  const isLive = site?.status === 'LIVE'
  const isBusy = site?.status === 'DEPLOYING' || site?.status === 'UPDATING'
  const liveSiteUrl = site ? getSiteUrl(site.mnsName, site.customDomain) : ''
  const selectedModelOption = models.find(m => m.id === selectedModel) ?? models[0]
  const reasoningSupported = selectedModelOption.supportsReasoning
  const reasoningProvider = selectedModelOption.provider === 'Anthropic' ? 'anthropic' : 'openai'
  const availableReasoningEfforts = reasoningEfforts[reasoningProvider].filter(effort =>
    selectedModelOption.reasoningEfforts.includes(effort.id)
  )
  const activeReasoningEffort = availableReasoningEfforts.some(effort => effort.id === selectedReasoningEffort)
    ? selectedReasoningEffort
    : availableReasoningEfforts[0]?.id ?? 'medium'
  const selectedArcCategory = arcCategory || undefined
  const activeArcCategory = ARC_CATEGORIES.find(category => category.id === selectedArcCategory)
  const visibleStarterPrompts = generationMode === 'arc-web3'
    ? selectedArcCategory ? ARC_STARTER_PROMPTS.filter(item => item.category === selectedArcCategory) : []
    : STARTER_PROMPTS
  const hasUserMessages = messages.some(message => message.role === 'user')
  const showStarterPrompts = !site && !html && !generating && generationMode !== 'arc-web3' && !hasUserMessages && !inputFocused && !input.trim()
  const showEmptyArcStarter = !site && !html && !generating && generationMode === 'arc-web3'
  const arcInputLocked = showEmptyArcStarter && !selectedArcCategory

  return (
    <div className="editor-shell flex flex-col overflow-hidden" style={{ background: 'var(--bg)', height: 'var(--editor-viewport-height, 100dvh)' }}>
      <Header />

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 sm:gap-3 sm:px-6 h-14 sm:h-11 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--line)', background: 'color-mix(in srgb, var(--panel) 72%, transparent)' }}>

        <span className="hidden text-ink-400 text-sm truncate sm:block sm:max-w-xs">{title}</span>
        {!site && !html && (
          <span className="hidden rounded-lg px-2 py-1 text-[11px] font-bold uppercase tracking-wide sm:inline-flex"
            style={{
              color: generationMode === 'arc-web3' ? 'var(--success)' : 'var(--muted)',
              background: generationMode === 'arc-web3' ? 'rgba(var(--success-rgb),0.08)' : 'color-mix(in srgb, var(--panel-2) 66%, transparent)',
              border: `1px solid ${generationMode === 'arc-web3' ? 'rgba(var(--success-rgb),0.18)' : 'var(--line)'}`,
            }}>
            {generationMode === 'arc-web3' ? 'Arc Web3' : 'Website'}
          </span>
        )}

        {isLive && (
          <>
            <div className="h-3.5 w-px hidden sm:block" style={{ background: 'color-mix(in srgb, var(--panel-2) 86%, transparent)' }} />
            <a href={liveSiteUrl} target="_blank" rel="noopener noreferrer"
              className="text-xs font-mono transition-colors hidden sm:block hover:text-brand-300"
              style={{ color: 'var(--success)' }}>
              {site && getSiteDomain(site.mnsName, site.customDomain)} ↗
            </a>
            {site?.ownershipClaimed && <ClaimedBadge compact />}
          </>
        )}

        <div className="flex-1" />

        <button
          onClick={startNewChat}
          disabled={generating}
          className="btn-ghost py-1 px-2.5 text-xs hidden sm:inline-flex text-ink-500 hover:text-ink-100"
          title="Start a new chat"
        >
          New
        </button>

        {/* Mobile toggle */}
        {(html || loadingSite) && (
          <div className="flex sm:hidden items-center gap-2">
            <button
              onClick={startNewChat}
              disabled={generating}
              className="btn-ghost py-1 px-2.5 text-xs text-ink-500 hover:text-ink-100"
              title="Start a new chat"
            >
              New
            </button>
            <div className="flex rounded-xl p-0.5 text-xs"
              style={{ background: 'color-mix(in srgb, var(--panel-2) 74%, transparent)', border: '1px solid var(--line)' }}>
              {(['chat', 'preview'] as MobileTab[]).map(t => (
                <button key={t} onClick={() => setMobileTab(t)}
                  className="px-3 py-1 rounded-lg capitalize transition-all duration-200"
                  style={mobileTab === t
                    ? { background: 'color-mix(in srgb, var(--panel-2) 92%, transparent)', color: 'var(--text)' }
                    : { color: 'var(--muted)' }}>
                  {t}
                </button>
              ))}
            </div>
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
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--success)', boxShadow: '0 0 6px rgba(var(--success-rgb),0.45)' }} />
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
          editor-chat-panel
          flex flex-col min-h-0 flex-shrink-0
          w-full sm:w-80 lg:w-96
          ${html || generating || loadingSite ? (mobileTab === 'chat' ? 'flex' : 'hidden sm:flex') : 'flex'}
        `} style={{ borderRight: '1px solid var(--line)' }}>

          {/* Messages */}
          <div className="editor-messages flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
            {showEmptyArcStarter && (
              <div className="animate-fade-in">
                <div className="mb-4">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>Choose Arc app type</p>
                    <p className="hidden sm:block text-[11px]" style={{ color: 'var(--muted-2)' }}>
                      {selectedArcCategory ? (ARC_CONTRACT_CATEGORIES.has(selectedArcCategory) ? 'Contract-backed' : 'Frontend-only') : 'Required'}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {ARC_CATEGORIES.map(category => {
                      const active = arcCategory === category.id
                      const contractBacked = ARC_CONTRACT_CATEGORIES.has(category.id)
                      return (
                        <button
                          key={category.id}
                          type="button"
                          onClick={() => {
                            setArcCategory(category.id)
                            if (error === 'Choose an Arc app type before generating.') setError('')
                          }}
                          className="min-w-0 rounded-2xl px-2.5 py-2 text-left transition-all duration-150 hover:-translate-y-0.5"
                          style={{
                            border: `1px solid ${active ? 'rgba(var(--success-rgb),0.32)' : 'var(--line)'}`,
                            background: active ? 'rgba(var(--success-rgb),0.1)' : 'color-mix(in srgb, var(--panel-2) 76%, transparent)',
                            color: active ? 'var(--success)' : 'var(--text-soft)',
                            boxShadow: active ? '0 14px 34px rgba(var(--success-rgb),0.13)' : '0 12px 28px rgba(0,0,0,0.10)',
                          }}>
                          <span className="flex items-center justify-between gap-2 text-xs font-bold">
                            <span className="min-w-0 truncate">{category.label}</span>
                            {contractBacked && (
                              <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] uppercase tracking-wide"
                                style={{
                                  color: active ? 'var(--success)' : 'var(--muted)',
                                  background: active ? 'rgba(var(--success-rgb),0.12)' : 'color-mix(in srgb, var(--panel) 78%, transparent)',
                                  border: `1px solid ${active ? 'rgba(var(--success-rgb),0.22)' : 'var(--line)'}`,
                                }}>
                                SC
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 block text-[11px] leading-snug" style={{ color: active ? 'color-mix(in srgb, var(--success) 72%, var(--muted))' : 'var(--muted)' }}>{category.sub}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                      {activeArcCategory?.label ?? 'Select a type'} ideas
                    </p>
                    <p className="hidden sm:block text-[11px]" style={{ color: 'var(--muted-2)' }}>
                      {selectedArcCategory ? 'Matches selected type' : 'Choose a category first'}
                    </p>
                  </div>
                  {selectedArcCategory && visibleStarterPrompts.length > 0 ? (
                    <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                      {visibleStarterPrompts.map(item => (
                      <button
                        key={item.title}
                        type="button"
                        onClick={() => send(item.prompt, (item as { category?: ArcWeb3Category }).category)}
                        className="shrink-0 rounded-xl px-3 py-2 text-left transition-all duration-150 hover:-translate-y-0.5"
                        style={{
                          minWidth: '138px',
                          border: '1px solid var(--line)',
                          background: 'linear-gradient(135deg, color-mix(in srgb, var(--panel-2) 84%, transparent), color-mix(in srgb, var(--panel) 96%, transparent))',
                          color: 'var(--text-soft)',
                          boxShadow: '0 12px 28px rgba(0,0,0,0.12)',
                        }}>
                        <span className="block text-xs font-bold" style={{ color: 'var(--text)' }}>{item.title}</span>
                        <span className="mt-0.5 block text-[11px] leading-snug" style={{ color: 'var(--muted)' }}>
                          {ARC_CONTRACT_CATEGORIES.has((item as { category?: ArcWeb3Category }).category as ArcWeb3Category) ? 'Uses contract template' : 'Frontend-only Arc app'}
                        </span>
                      </button>
                      ))}
                    </div>
                  ) : selectedArcCategory === 'custom' ? (
                    <div className="rounded-xl px-3 py-2 text-xs leading-5"
                      style={{ color: 'var(--muted)', background: 'color-mix(in srgb, var(--panel-2) 70%, transparent)', border: '1px solid var(--line)' }}>
                      Describe the exact product, its users, and the onchain action. CtrlPoint will design a focused contract and interface for it.
                    </div>
                  ) : (
                    <div className="rounded-xl px-3 py-2 text-xs"
                      style={{ color: 'var(--muted)', background: 'color-mix(in srgb, var(--panel-2) 70%, transparent)', border: '1px solid var(--line)' }}>
                      Pick a category to unlock matching prompts and the input box.
                    </div>
                  )}
                </div>
              </div>
            )}

            {messages.filter(m => m.content.trim()).map((m, i) => (
              <div key={i} className="flex animate-message-in" style={{ animationDelay: `${i * 0.02}s`, justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div className="max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed"
                  style={m.role === 'user' ? {
                    background: 'linear-gradient(135deg, var(--brand-600), var(--brand-700))',
                    border: '1px solid rgba(var(--brand-600-rgb),0.34)',
                    color: '#fffdfa',
                    boxShadow: '0 10px 24px rgba(var(--brand-700-rgb),0.16)',
                    borderBottomRightRadius: '4px',
                  } : {
                    background: 'color-mix(in srgb, var(--panel-2) 70%, transparent)',
                    border: '1px solid var(--line)',
                    color: 'var(--text-soft)',
                    borderBottomLeftRadius: '4px',
                  }}>
                  {m.content}
                </div>
              </div>
            ))}

            {generating && (
              <div className="flex justify-start animate-fade-in">
                <div className="px-4 py-3 rounded-2xl rounded-bl-sm"
                  style={{ background: 'color-mix(in srgb, var(--panel-2) 70%, transparent)', border: '1px solid var(--line)' }}>
                  <div className="flex gap-1.5">
                    {[0, 0.2, 0.4].map((d, i) => (
                      <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce"
                        style={{ background: 'rgba(var(--brand-600-rgb),0.7)', animationDelay: `${d}s` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Input */}
          <div className="editor-composer flex-shrink-0 p-3"
            style={{ borderTop: '1px solid var(--line)', paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))', background: 'color-mix(in srgb, var(--bg) 96%, transparent)' }}>
            {creditError && (
              <div className="mb-2.5 overflow-hidden rounded-2xl animate-fade-in"
                style={{ background: 'linear-gradient(135deg, rgba(var(--brand-600-rgb),0.13), rgba(15,23,42,0.22))', border: '1px solid rgba(var(--brand-400-rgb),0.24)', boxShadow: '0 18px 50px rgba(0,0,0,0.18)' }}>
                <div className="px-3.5 py-3">
                  <div className="mb-2 flex items-start gap-2">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl"
                      style={{ background: 'rgba(var(--brand-600-rgb),0.14)', border: '1px solid rgba(var(--brand-400-rgb),0.22)', color: 'var(--brand-300)' }}>
                      +
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold" style={{ color: 'var(--text)' }}>Not enough credits</p>
                      <p className="mt-0.5 text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>{creditError}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => navigate('/credits')} className="btn-primary flex-1 py-2 text-xs">
                      Top up credits
                    </button>
                    <button type="button" onClick={() => setCreditError('')}
                      className="rounded-xl px-3 py-2 text-xs font-semibold"
                      style={{ color: 'var(--muted)', border: '1px solid var(--line)', background: 'color-mix(in srgb, var(--panel-2) 72%, transparent)' }}>
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            )}
            {error && (() => {
              const isKeyError = /api key|invalid.*key|revoked|quota|provider account|openai|anthropic/i.test(error)
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
            {showStarterPrompts && (
              <div className="mb-3 max-h-[30dvh] overflow-y-auto pr-1 no-scrollbar sm:max-h-48">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                    Start with an idea
                  </p>
                  <p className="hidden sm:block text-[11px]" style={{ color: 'var(--muted-2)' }}>
                    Tap one to build
                  </p>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                  {visibleStarterPrompts.map(item => (
                    <button
                      key={item.title}
                      type="button"
                      onClick={() => send(item.prompt, (item as { category?: ArcWeb3Category }).category)}
                      className="shrink-0 rounded-xl px-3 py-2 text-left transition-all duration-150 hover:-translate-y-0.5"
                      style={{
                        minWidth: '138px',
                        border: '1px solid var(--line)',
                        background: 'linear-gradient(135deg, color-mix(in srgb, var(--panel-2) 84%, transparent), color-mix(in srgb, var(--panel) 96%, transparent))',
                        color: 'var(--text-soft)',
                        boxShadow: '0 12px 28px rgba(0,0,0,0.12)',
                      }}
                    >
                      <span className="block text-xs font-bold" style={{ color: 'var(--text)' }}>{item.title}</span>
                      <span className="mt-0.5 block text-[11px] leading-snug" style={{ color: 'var(--muted)' }}>
                        Build instantly
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-2 items-end">
              <div className="flex-1 flex flex-col gap-1.5 min-w-0">
                {/* Model picker */}
                <div ref={modelRef} className="relative self-start">
                  <button
                    onClick={() => {
                      if (!modelSelectionEnabled) return
                      setModelOpen(p => !p)
                    }}
                    disabled={!modelSelectionEnabled}
                    className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs transition-all duration-150"
                    style={{
                      background: modelOpen ? 'rgba(var(--brand-600-rgb),0.1)' : 'color-mix(in srgb, var(--panel-2) 70%, transparent)',
                      border: `1px solid ${modelOpen ? 'rgba(var(--brand-600-rgb),0.25)' : 'var(--line)'}`,
                      color: modelSelectionEnabled ? 'var(--muted)' : 'var(--muted-2)',
                      cursor: modelSelectionEnabled ? 'pointer' : 'not-allowed',
                    }}
                    title={loadingConfig ? 'Loading model settings' : modelSelectionEnabled ? 'Select model' : 'Model selection is disabled'}
                  >
                    <span>{modelSelectionEnabled ? (models.find(m => m.id === selectedModel)?.label ?? models[0].label) : activeDefaultModel}</span>
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" style={{ opacity: 0.5 }}>
                      <path d="M1.5 3L4 5.5L6.5 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>

                  {modelOpen && (
                    <div className="absolute bottom-full left-0 mb-1.5 w-64 rounded-xl animate-fade-in z-50 no-scrollbar"
                      style={{
                        background: 'var(--panel)',
                        border: '1px solid var(--line)',
                        boxShadow: '0 16px 40px rgba(0,0,0,0.7)',
                        maxHeight: 'min(56vh, 360px)',
                        overflowY: 'auto',
                        overscrollBehavior: 'contain',
                      }}>
                      {models.map((m, i) => {
                        const active = m.id === selectedModel
                        return (
                          <div key={m.id}
                            onClick={() => {
                              setSelectedModel(m.id)
                              localStorage.setItem('ctrlpoint_model', m.id)
                              if (m.supportsReasoning && !m.reasoningEfforts.includes(selectedReasoningEffort)) {
                                const nextEffort = m.reasoningEfforts.includes('medium') ? 'medium' : m.reasoningEfforts[0]
                                if (nextEffort) {
                                  setSelectedReasoningEffort(nextEffort)
                                  localStorage.setItem('ctrlpoint_reasoning_effort', nextEffort)
                                }
                              }
                              setModelOpen(false)
                            }}
                            className="flex items-center justify-between px-3 py-2.5 transition-colors duration-100"
                            style={{
                              borderTop: i > 0 ? '1px solid var(--line)' : 'none',
                              background: active ? 'rgba(var(--brand-600-rgb),0.12)' : 'transparent',
                              cursor: 'pointer',
                            }}
                            onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'color-mix(in srgb, var(--panel-2) 70%, transparent)' }}
                            onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="text-xs font-medium" style={{ color: active ? 'var(--brand-300)' : 'var(--text-soft)' }}>{m.full}</p>
                                <span className="text-xs px-1 py-px rounded flex-shrink-0"
                                  style={{ background: 'color-mix(in srgb, var(--panel-2) 74%, transparent)', color: 'var(--muted-2)', fontSize: '9px' }}>
                                  {m.provider}
                                </span>
                              </div>
                              <p className="text-xs mt-0.5" style={{ color: 'var(--muted-2)' }}>{m.sub}</p>
                            </div>
                            {active && (
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="flex-shrink-0 ml-2">
                                <path d="M2 6l3 3 5-5" stroke="var(--brand-400)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div ref={reasoningRef} className="relative self-start">
                  <button
                    onClick={() => {
                      if (!modelSelectionEnabled || !reasoningSupported) return
                      setReasoningOpen(p => !p)
                    }}
                    disabled={!modelSelectionEnabled || !reasoningSupported}
                    className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-xs transition-all duration-150"
                    style={{
                      background: reasoningOpen ? 'rgba(var(--brand-600-rgb),0.1)' : 'color-mix(in srgb, var(--panel-2) 70%, transparent)',
                      border: `1px solid ${reasoningOpen ? 'rgba(var(--brand-600-rgb),0.25)' : 'var(--line)'}`,
                      color: modelSelectionEnabled && reasoningSupported ? 'var(--muted)' : 'var(--muted-2)',
                      cursor: modelSelectionEnabled && reasoningSupported ? 'pointer' : 'not-allowed',
                    }}
                    title={loadingConfig ? 'Loading model settings' : !modelSelectionEnabled ? 'Model selection is disabled' : reasoningSupported ? 'Select reasoning level' : 'This model does not support explicit reasoning controls'}
                  >
                    <span>Effort: {availableReasoningEfforts.find(e => e.id === activeReasoningEffort)?.label ?? activeReasoningEffort}</span>
                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none" style={{ opacity: 0.5 }}>
                      <path d="M1.5 3L4 5.5L6.5 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </button>

                  {reasoningOpen && (
                    <div className="absolute bottom-full left-0 mb-1.5 w-48 rounded-xl animate-fade-in z-50 no-scrollbar"
                      style={{
                        background: 'var(--panel)',
                        border: '1px solid var(--line)',
                        boxShadow: '0 16px 40px rgba(0,0,0,0.7)',
                        maxHeight: 'min(44vh, 260px)',
                        overflowY: 'auto',
                        overscrollBehavior: 'contain',
                      }}>
                      {availableReasoningEfforts.map((effort, i) => {
                        const active = effort.id === activeReasoningEffort
                        return (
                          <div key={effort.id}
                            onClick={() => {
                              setSelectedReasoningEffort(effort.id)
                              localStorage.setItem('ctrlpoint_reasoning_effort', effort.id)
                              setReasoningOpen(false)
                            }}
                            className="flex items-center justify-between px-3 py-2.5 transition-colors duration-100"
                            style={{
                              borderTop: i > 0 ? '1px solid var(--line)' : 'none',
                              background: active ? 'rgba(var(--brand-600-rgb),0.12)' : 'transparent',
                              cursor: 'pointer',
                            }}
                            onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'color-mix(in srgb, var(--panel-2) 70%, transparent)' }}
                            onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
                          >
                            <div>
                              <p className="text-xs font-medium" style={{ color: active ? 'var(--brand-300)' : 'var(--text-soft)' }}>{effort.label}</p>
                              <p className="text-xs mt-0.5" style={{ color: 'var(--muted-2)' }}>{effort.sub}</p>
                            </div>
                            {active && (
                              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="flex-shrink-0 ml-2">
                                <path d="M2 6l3 3 5-5" stroke="var(--brand-400)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
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
                  placeholder={html ? 'What should I change?' : generationMode === 'arc-web3' ? selectedArcCategory ? 'Describe your Arc Web3 app...' : 'Choose an Arc app type first...' : 'Describe your website...'}
                  value={input}
                  onChange={handleInputChange}
                  disabled={arcInputLocked}
                  onFocus={() => {
                    setInputFocused(true)
                    setTimeout(updateEditorViewportMetrics, 120)
                  }}
                  onBlur={() => setInputFocused(false)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                />
              </div>
              <button onClick={() => send()} disabled={!input.trim() || generating || arcInputLocked}
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
          ${html || generating || loadingSite ? (mobileTab === 'preview' ? 'flex' : 'hidden sm:flex') : 'hidden sm:flex'}
          flex-col
        `}>
          <Preview
            html={html}
            generating={generating}
            loading={loadingSite}
            publicUrl={site ? liveSiteUrl : undefined}
            className="flex-1 min-h-0"
          />
        </div>
      </div>

      {showDeploy && (
        <DeployModal
          generatedCode={html}
          title={title}
          description={description}
          lastPrompt={messages.filter(m => m.role === 'user').pop()?.content ?? ''}
          existingSite={site ?? undefined}
          onClose={closeDeployModal}
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
