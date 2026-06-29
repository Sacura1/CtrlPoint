import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Header from '../../components/Header'
import Preview from '../../components/Preview'
import { arcDapps, auth, deploy, sites as sitesApi } from '../../api'
import type { ArcDapp, DeployStatus } from '../../types'
import { useAuth } from '../../store/auth'
import { getSiteUrl } from '../../utils/siteUrl'
import { ARC_BUSY_STATUSES, categoryLabel, categoryUsesContract } from './arcConfig'

type BuilderTab = 'preview' | 'edit' | 'contract'
type MnsCheck = { available: boolean; creditCost: number; free: boolean; message?: string }

const BASE_BUILD_STEPS = [
  { key: 'PLANNING', label: 'Plan product' },
  { key: 'GENERATING_FRONTEND', label: 'Build interface' },
]

const CONTRACT_BUILD_STEPS = [
  BASE_BUILD_STEPS[0],
  { key: 'GENERATING_CONTRACT', label: 'Design contract' },
  { key: 'VALIDATING_CONTRACT', label: 'Compile contract' },
  BASE_BUILD_STEPS[1],
]

function buildSteps(project: ArcDapp) {
  const activelyBuildingContract = project.status === 'GENERATING_CONTRACT' || project.status === 'VALIDATING_CONTRACT'
  const contractStillNeeded = categoryUsesContract(project.category) && !project.sourceCode
  return activelyBuildingContract || contractStillNeeded ? CONTRACT_BUILD_STEPS : BASE_BUILD_STEPS
}

function stepState(project: ArcDapp, steps: typeof BASE_BUILD_STEPS, key: string, index: number) {
  const activeIndex = steps.findIndex(step => step.key === project.status)
  if (!ARC_BUSY_STATUSES.has(project.status)) return 'done'
  if (activeIndex < 0) return index === 0 ? 'active' : 'pending'
  if (index < activeIndex) return 'done'
  if (index === activeIndex) return 'active'
  return 'pending'
}

export default function ArcBuilder() {
  const { dappId = '' } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user, setUser } = useAuth()
  const [project, setProject] = useState<ArcDapp | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<BuilderTab>('preview')
  const [editPrompt, setEditPrompt] = useState('')
  const [editError, setEditError] = useState('')
  const [submittingEdit, setSubmittingEdit] = useState(false)
  const [showPublish, setShowPublish] = useState(false)

  const load = useCallback(async () => {
    const { dapp } = await arcDapps.get(dappId)
    setProject(dapp)
    if (!ARC_BUSY_STATUSES.has(dapp.status)) {
      auth.me().then(result => setUser(result.user)).catch(() => {})
    }
    return dapp
  }, [dappId, setUser])

  useEffect(() => {
    load().catch(() => navigate('/arc/projects')).finally(() => setLoading(false))
  }, [load, navigate])

  useEffect(() => {
    if (!project) return
    const delay = ARC_BUSY_STATUSES.has(project.status) ? 1800 : 9000
    const timer = setInterval(() => load().catch(() => {}), delay)
    return () => clearInterval(timer)
  }, [project?.status, load])

  useEffect(() => {
    if (!project || searchParams.get('publish') !== '1') return
    if (ARC_BUSY_STATUSES.has(project.status)) {
      const next = new URLSearchParams(searchParams)
      next.delete('publish')
      setSearchParams(next, { replace: true })
      setShowPublish(false)
      return
    }
    setShowPublish(true)
  }, [project, searchParams])

  const submitEdit = async (event: FormEvent) => {
    event.preventDefault()
    if (!project || editPrompt.trim().length < 3) return
    setSubmittingEdit(true)
    setEditError('')
    try {
      const { dapp, credits } = await arcDapps.rebuild(project.id, { prompt: editPrompt.trim() })
      setProject(dapp)
      if (typeof credits === 'number' && user) setUser({ ...user, credits })
      setEditPrompt('')
      setTab('preview')
    } catch (err: any) {
      setEditError(err.message)
    } finally {
      setSubmittingEdit(false)
    }
  }

  if (loading) return <BuilderLoading />
  if (!project) return null

  const busy = ARC_BUSY_STATUSES.has(project.status)
  const hasPreview = Boolean(project.site?.generatedCode)
  const contractBacked = Boolean(project.abi || project.sourceCode)
  const canPublish = !busy && hasPreview && project.status !== 'FAILED'

  return (
    <div className="min-h-dvh overflow-x-hidden" style={{ background: 'var(--bg)' }}>
      <Header />
      <div className="sticky top-[56px] z-30" style={{ background: 'color-mix(in srgb, var(--bg) 94%, transparent)', borderBottom: '1px solid var(--line)', backdropFilter: 'blur(18px)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-[66px] flex items-center gap-3">
          <button onClick={() => navigate('/arc')} className="h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ color: 'var(--text-soft)', border: '1px solid var(--line)' }} aria-label="Back to DApp Builder">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-bold truncate" style={{ color: 'var(--text)' }}>{project.site?.title || 'ARC dApp'}</h1>
              {busy && <span className="text-[9px] font-bold uppercase tracking-[.1em]" style={{ color: 'var(--brand-400)' }}>Building</span>}
            </div>
            <p className="text-[11px] truncate" style={{ color: 'var(--muted)' }}>{categoryLabel(project.category)} · {project.buildStep || 'Ready'}</p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {!busy && hasPreview && (
              <div className="hidden sm:flex rounded-xl p-1" style={{ border: '1px solid var(--line)', background: 'var(--panel)' }}>
                {(['preview', 'edit', 'contract'] as BuilderTab[]).map(item => (
                  <button key={item} onClick={() => setTab(item)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors"
                    style={{
                      color: tab === item ? 'var(--text)' : 'var(--muted)',
                      background: tab === item ? 'var(--panel-2)' : 'transparent',
                    }}>
                    {item}
                  </button>
                ))}
              </div>
            )}
            <button disabled={!canPublish} onClick={() => setShowPublish(true)} className="btn-primary px-4 py-2.5 text-sm">
              {project.site?.status === 'LIVE' ? 'Publish update' : 'Publish'}
            </button>
          </div>
        </div>
        {!busy && hasPreview && (
          <div className="sm:hidden px-4 pb-3 flex gap-1">
            {(['preview', 'edit', 'contract'] as BuilderTab[]).map(item => (
              <button key={item} onClick={() => setTab(item)} className="flex-1 py-2 rounded-lg text-xs font-semibold capitalize"
                style={{ color: tab === item ? 'var(--text)' : 'var(--muted)', background: tab === item ? 'var(--panel-2)' : 'transparent' }}>{item}</button>
            ))}
          </div>
        )}
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {busy ? (
          <BuildWorkspace project={project} hasPreview={hasPreview} />
        ) : project.status === 'FAILED' ? (
          <BuildFailure project={project} onRetry={() => setTab('edit')} />
        ) : tab === 'preview' ? (
          <div className="animate-fade-in">
            <Preview
              html={project.site?.generatedCode || ''}
              publicUrl={getSiteUrl(project.site!.mnsName, project.site?.customDomain)}
              instant
              className="h-[calc(100dvh-170px)] min-h-[520px]"
            />
          </div>
        ) : tab === 'edit' ? (
          <div className="grid lg:grid-cols-[390px_minmax(0,1fr)] gap-4 animate-fade-in">
            <form onSubmit={submitEdit} className="card rounded-2xl p-5 h-fit">
              <p className="text-[11px] uppercase tracking-[.14em] font-bold" style={{ color: 'var(--muted)' }}>Edit with AI</p>
              <h2 className="mt-2 text-xl font-bold" style={{ color: 'var(--text)' }}>What should change?</h2>
              <p className="mt-2 text-sm leading-6" style={{ color: 'var(--muted)' }}>
                The current interface stays available while the edit runs. Deployed contracts remain unchanged.
              </p>
              <textarea value={editPrompt} onChange={event => setEditPrompt(event.target.value)}
                rows={7} className="input w-full mt-5 resize-none text-sm leading-6"
                placeholder="Example: simplify the payment form and add a receipt panel..." />
              {editError && <p className="mt-3 text-sm" style={{ color: 'var(--danger)' }}>{editError}</p>}
              <button disabled={submittingEdit || editPrompt.trim().length < 3} className="btn-primary w-full mt-4 py-2.5 text-sm">
                {submittingEdit ? 'Queuing edit...' : 'Apply edit'}
              </button>
            </form>
            <Preview
              html={project.site?.generatedCode || ''}
              publicUrl={getSiteUrl(project.site!.mnsName, project.site?.customDomain)}
              instant
              className="h-[calc(100dvh-170px)] min-h-[520px]"
            />
          </div>
        ) : (
          <ContractPanel project={project} contractBacked={contractBacked} />
        )}
      </main>

      {showPublish && (
        <PublishPanel
          project={project}
          onClose={() => {
            setShowPublish(false)
            if (searchParams.has('publish')) {
              const next = new URLSearchParams(searchParams)
              next.delete('publish')
              setSearchParams(next, { replace: true })
            }
          }}
          onProject={setProject}
          onRefresh={load}
        />
      )}
    </div>
  )
}

function BuilderLoading() {
  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg)' }}>
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="rounded-2xl p-5" style={{ border: '1px solid var(--line)', background: 'var(--panel)' }}>
          <div className="flex items-center gap-4">
            <span className="h-10 w-10 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" style={{ color: 'var(--brand-400)' }} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Opening your DApp</p>
              <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>Loading the latest build and deployment state...</p>
            </div>
          </div>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="skeleton h-64 rounded-2xl" />
          <div className="skeleton h-[64vh] min-h-[520px] rounded-2xl" />
        </div>
      </main>
    </div>
  )
}

function BuildWorkspace({ project, hasPreview }: { project: ArcDapp; hasPreview: boolean }) {
  const steps = buildSteps(project)

  return (
    <div className="grid lg:grid-cols-[360px_minmax(0,1fr)] gap-4 animate-fade-in">
      <aside className="card rounded-2xl p-5 h-fit">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-[.14em]" style={{ color: 'var(--brand-400)' }}>Build in progress</span>
          <span className="font-mono text-xs" style={{ color: 'var(--muted)' }}>{Math.max(4, project.progress || 0)}%</span>
        </div>
        <h2 className="mt-3 text-xl font-bold" style={{ color: 'var(--text)' }}>{project.buildStep || 'Starting the build'}</h2>
        <p className="mt-2 text-sm leading-6" style={{ color: 'var(--muted)' }}>You can leave this page. The build continues on the server and will be here when you return.</p>
        <div className="mt-5 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--panel-2)' }}>
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(4, project.progress || 0)}%`, background: 'var(--brand-400)' }} />
        </div>
        <div className="mt-6 space-y-1">
          {steps.map((step, index) => {
            const state = stepState(project, steps, step.key, index)
            return (
              <div key={step.key} className="flex items-center gap-3 py-2.5">
                <span className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold"
                  style={{
                    color: state === 'active' ? '#06130c' : state === 'done' ? 'var(--brand-400)' : 'var(--muted-2)',
                    background: state === 'active' ? 'var(--brand-400)' : 'var(--panel-2)',
                    border: '1px solid var(--line)',
                  }}>
                  {state === 'done' ? (
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <path d="m2.25 6.1 2.3 2.3 5.2-5.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : index + 1}
                </span>
                <span className="text-sm font-semibold" style={{ color: state === 'pending' ? 'var(--muted-2)' : 'var(--text-soft)' }}>{step.label}</span>
                {state === 'active' && <span className="ml-auto flex gap-1">{[0, 1, 2].map(dot => <i key={dot} className="h-1 w-1 rounded-full animate-pulse-dot" style={{ background: 'var(--brand-400)', animationDelay: `${dot * .18}s` }} />)}</span>}
              </div>
            )
          })}
        </div>
      </aside>
      {hasPreview ? (
        <Preview
          html={project.site?.generatedCode || ''}
          publicUrl={getSiteUrl(project.site!.mnsName, project.site?.customDomain)}
          generating
          instant
          className="h-[calc(100dvh-170px)] min-h-[520px]"
        />
      ) : (
        <div className="rounded-2xl min-h-[520px] flex items-center justify-center overflow-hidden relative"
          style={{ border: '1px solid var(--line)', background: 'var(--panel)' }}>
          <div className="absolute inset-0 opacity-40" style={{ backgroundImage: 'linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px)', backgroundSize: '34px 34px' }} />
          <div className="relative text-center px-6">
            <span className="mx-auto h-14 w-14 rounded-2xl flex items-center justify-center animate-pulse"
              style={{ color: 'var(--brand-400)', border: '1px solid rgba(var(--brand-400-rgb),.3)', background: 'rgba(var(--brand-500-rgb),.07)' }}>
              <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M8 9h8M8 15h5"/><rect x="3" y="4" width="18" height="16" rx="2"/></svg>
            </span>
            <p className="mt-5 font-semibold" style={{ color: 'var(--text)' }}>Preparing the first preview</p>
            <p className="mt-1 text-sm" style={{ color: 'var(--muted)' }}>Contract and interface decisions are being checked together.</p>
          </div>
        </div>
      )}
    </div>
  )
}

function BuildFailure({ project, onRetry }: { project: ArcDapp; onRetry: () => void }) {
  return (
    <div className="card rounded-2xl max-w-xl mx-auto p-7 mt-10">
      <span className="h-11 w-11 rounded-xl flex items-center justify-center" style={{ color: 'var(--danger)', background: 'rgba(var(--danger-rgb),.08)', border: '1px solid rgba(var(--danger-rgb),.22)' }}>!</span>
      <h2 className="mt-5 text-xl font-bold" style={{ color: 'var(--text)' }}>The build stopped</h2>
      <p className="mt-2 text-sm leading-6" style={{ color: 'var(--muted)' }}>{project.errorMsg || 'The build could not be completed.'}</p>
      <button className="btn-primary mt-6 px-5 py-2.5 text-sm" onClick={onRetry}>Adjust and retry</button>
    </div>
  )
}

function ContractPanel({ project, contractBacked }: { project: ArcDapp; contractBacked: boolean }) {
  if (!contractBacked) {
    return (
      <div className="card rounded-2xl max-w-2xl p-7 animate-fade-in">
        <p className="text-[11px] font-bold uppercase tracking-[.14em]" style={{ color: 'var(--muted)' }}>Architecture</p>
        <h2 className="mt-3 text-xl font-bold" style={{ color: 'var(--text)' }}>No custom contract needed</h2>
        <p className="mt-2 text-sm leading-6" style={{ color: 'var(--muted)' }}>This dApp works with Arc wallet and RPC calls directly. Publishing only deploys its frontend to DeWeb.</p>
      </div>
    )
  }
  return (
    <div className="grid lg:grid-cols-[340px_minmax(0,1fr)] gap-4 animate-fade-in">
      <div className="card rounded-2xl p-6 h-fit">
        <p className="text-[11px] font-bold uppercase tracking-[.14em]" style={{ color: 'var(--muted)' }}>Generated contract</p>
        <h2 className="mt-3 text-xl font-bold break-words" style={{ color: 'var(--text)' }}>{project.contractName}</h2>
        <p className="mt-3 text-sm leading-6" style={{ color: 'var(--muted)' }}>{project.contractSummary}</p>
        <dl className="mt-6 space-y-3 text-xs">
          <div className="flex justify-between gap-3"><dt style={{ color: 'var(--muted)' }}>Compiler</dt><dd className="font-mono" style={{ color: 'var(--text-soft)' }}>{project.compilerVersion || 'solc'}</dd></div>
          <div className="flex justify-between gap-3"><dt style={{ color: 'var(--muted)' }}>Functions</dt><dd className="font-mono" style={{ color: 'var(--text-soft)' }}>{project.abi?.filter(item => item.type === 'function').length || 0}</dd></div>
          <div className="flex justify-between gap-3"><dt style={{ color: 'var(--muted)' }}>Owner</dt><dd className="font-mono truncate max-w-[180px]" style={{ color: 'var(--text-soft)' }}>{project.ownerAddress || 'Chosen at publish'}</dd></div>
        </dl>
        {project.explorerUrl && <a href={project.explorerUrl} target="_blank" rel="noreferrer" className="btn-secondary mt-5 inline-flex px-4 py-2 text-xs">View on ArcScan</a>}
      </div>
      <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--line)', background: '#080a09' }}>
        <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,.08)' }}>
          <span className="text-xs font-mono" style={{ color: '#a9a49b' }}>{project.contractName}.sol</span>
          <span className="text-[10px] uppercase tracking-[.12em]" style={{ color: '#6f6b64' }}>Advanced</span>
        </div>
        <pre className="p-5 text-xs leading-6 overflow-auto max-h-[calc(100dvh-225px)]" style={{ color: '#d9d3c8' }}><code>{project.sourceCode}</code></pre>
      </div>
    </div>
  )
}

function PublishPanel({ project, onClose, onProject, onRefresh }: {
  project: ArcDapp
  onClose: () => void
  onProject: (project: ArcDapp) => void
  onRefresh: () => Promise<ArcDapp>
}) {
  const [name, setName] = useState('')
  const [checking, setChecking] = useState(false)
  const [mnsCheck, setMnsCheck] = useState<MnsCheck | null>(null)
  const [contractBusy, setContractBusy] = useState(false)
  const [deployBusy, setDeployBusy] = useState(false)
  const [restoringDeployment, setRestoringDeployment] = useState(true)
  const [completedDeployment, setCompletedDeployment] = useState(false)
  const [deploymentId, setDeploymentId] = useState<string | null>(null)
  const [deploymentStatus, setDeploymentStatus] = useState<DeployStatus | null>(null)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const contractRequired = Boolean(project.abi)
  const contractReady = !contractRequired || Boolean(project.contractAddress)
  const live = project.site?.status === 'LIVE'
  const published = live || completedDeployment || deploymentStatus?.status === 'COMPLETE'
  const liveUrl = published
    ? deploymentStatus?.url || getSiteUrl(project.site?.mnsName || name, project.site?.customDomain)
    : ''

  useEffect(() => {
    let cancelled = false
    setRestoringDeployment(true)
    sitesApi.deployments(project.siteId)
      .then(({ deployments }) => {
        if (cancelled) return
        const active = [...deployments]
          .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
          .find(item => ['QUEUED', 'BUILDING', 'UPLOADING', 'MNS_REGISTERING'].includes(item.status))
        if (active) {
          setDeploymentId(active.id)
          setDeploymentStatus({
            status: active.status as DeployStatus['status'],
            step: active.step || active.status,
            error: active.errorMsg || undefined,
          })
          setDeployBusy(true)
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setRestoringDeployment(false)
      })
    return () => { cancelled = true }
  }, [project.siteId])

  useEffect(() => {
    if (!deploymentId) return
    let cancelled = false
    const poll = async () => {
      try {
        const status = await deploy.status(deploymentId)
        if (cancelled) return false
        setDeploymentStatus(status)
        if (status.status === 'COMPLETE') {
          setDeployBusy(false)
          setCompletedDeployment(true)
          const refreshed = await onRefresh()
          if (!cancelled) onProject(refreshed)
          return true
        }
        if (status.status === 'FAILED') {
          setDeployBusy(false)
          setError(status.error || 'DeWeb deployment failed.')
          return true
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Could not refresh deployment status.')
      }
      return false
    }
    poll()
    const timer = setInterval(async () => {
      if (await poll()) clearInterval(timer)
    }, 2200)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [deploymentId, onProject, onRefresh])

  const checkName = async () => {
    setChecking(true)
    setError('')
    try {
      setMnsCheck(await deploy.checkMns(name.trim()))
    } catch (err: any) {
      setMnsCheck(null)
      setError(err.message)
    } finally {
      setChecking(false)
    }
  }

  const deployContract = async () => {
    setError('')
    setContractBusy(true)
    try {
      const ethereum = (window as any).ethereum
      if (!ethereum) throw new Error('Open CtrlPoint in a browser with an EVM wallet extension.')
      const accounts = await ethereum.request({ method: 'eth_requestAccounts' }) as string[]
      const ownerAddress = accounts?.[0]
      if (!ownerAddress) throw new Error('No wallet account was selected.')
      try {
        await ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x4cef52' }] })
      } catch (switchError: any) {
        if (switchError?.code !== 4902) throw switchError
        await ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: '0x4cef52',
            chainName: 'Arc Testnet',
            nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
            rpcUrls: ['https://rpc.testnet.arc.network'],
            blockExplorerUrls: ['https://testnet.arcscan.app'],
          }],
        })
      }
      const { message } = await arcDapps.ownerNonce(project.id, ownerAddress)
      const signature = await ethereum.request({ method: 'personal_sign', params: [message, ownerAddress] }) as string
      const result = await arcDapps.deployContract(project.id, ownerAddress, signature)
      onProject(result.dapp)
    } catch (err: any) {
      setError(err.message || 'Contract deployment failed.')
    } finally {
      setContractBusy(false)
    }
  }

  const publishFrontend = async () => {
    setError('')
    setCompletedDeployment(false)
    if (!contractReady) {
      setError('Deploy the contract before publishing the frontend.')
      return
    }
    setDeployBusy(true)
    try {
      if (!live && name.trim() !== project.site?.mnsName) {
        const renamed = await arcDapps.updateName(project.id, name.trim())
        onProject(renamed.dapp)
      }
      const started = await deploy.start(project.siteId)
      setDeploymentId(started.deploymentId)
      setDeploymentStatus({ status: 'QUEUED', step: 'Queued for DeWeb' })
    } catch (err: any) {
      setError(err.message)
      setDeployBusy(false)
    }
  }

  const copyLiveUrl = async () => {
    if (!liveUrl) return
    await navigator.clipboard.writeText(liveUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  const shareLiveUrl = async () => {
    if (!liveUrl) return
    if (navigator.share) {
      await navigator.share({ title: project.site?.title || 'CtrlPoint DApp', url: liveUrl })
      return
    }
    await copyLiveUrl()
  }

  const title = completedDeployment ? 'DApp published' : deployBusy ? 'Publishing dApp' : live ? 'DApp release' : 'Publish dApp'

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-6" style={{ background: 'rgba(0,0,0,.68)', backdropFilter: 'blur(10px)' }} onMouseDown={event => { if (event.target === event.currentTarget) onClose() }}>
      <section className="max-h-[calc(100dvh-24px)] w-full max-w-2xl overflow-y-auto rounded-2xl animate-scale-in sm:max-h-[calc(100dvh-48px)]"
        style={{ background: 'var(--bg)', border: '1px solid var(--line-strong)', boxShadow: '0 30px 100px rgba(0,0,0,.48)' }}>
        <div className="sticky top-0 z-10 px-5 sm:px-6 h-16 flex items-center justify-between" style={{ background: 'color-mix(in srgb, var(--bg) 94%, transparent)', borderBottom: '1px solid var(--line)', backdropFilter: 'blur(18px)' }}>
          <div>
            <p className="text-[10px] uppercase tracking-[.14em] font-bold" style={{ color: 'var(--muted)' }}>Arc Testnet</p>
            <h2 className="font-bold" style={{ color: 'var(--text)' }}>{title}</h2>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-xl flex items-center justify-center" style={{ border: '1px solid var(--line)', color: 'var(--text-soft)' }} aria-label="Close">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 6l12 12M18 6 6 18"/></svg>
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-4">
          {restoringDeployment ? (
            <div className="card rounded-2xl p-6">
              <div className="flex items-center gap-4">
                <span className="h-9 w-9 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" style={{ color: 'var(--brand-400)' }} />
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Loading deployment status</p>
                  <p className="mt-1 text-xs" style={{ color: 'var(--muted)' }}>Checking the latest release before showing actions...</p>
                </div>
              </div>
            </div>
          ) : deployBusy ? (
            <>
              <DeploymentProgress status={deploymentStatus} live={false} />
              <div className="flex flex-col gap-3 rounded-2xl px-4 py-4 text-xs sm:flex-row sm:items-center sm:justify-between"
                style={{ color: 'var(--muted)', border: '1px solid var(--line)', background: 'var(--panel)' }}>
                <span>Publishing continues safely if you close this window.</span>
                <Link to="/arc/deployments" className="shrink-0 font-semibold" style={{ color: 'var(--brand-400)' }}>View deployments</Link>
              </div>
            </>
          ) : completedDeployment ? (
            <ReleaseSuccess url={liveUrl} copied={copied} onCopy={copyLiveUrl} onShare={shareLiveUrl} onDone={onClose} />
          ) : live ? (
            <>
              <ReleaseSuccess url={liveUrl} copied={copied} onCopy={copyLiveUrl} onShare={shareLiveUrl} compact />
              <div className="grid gap-2 sm:grid-cols-2">
                <Link to={`/settings?site=${project.siteId}#custom-domains`} className="btn-secondary py-2.5 text-center text-sm">Manage domains</Link>
                {project.site?.needsDeploy ? (
                  <button type="button" onClick={publishFrontend} className="btn-primary py-2.5 text-sm">Publish pending update</button>
                ) : (
                  <button type="button" onClick={onClose} className="btn-primary py-2.5 text-sm">Done</button>
                )}
              </div>
            </>
          ) : (
            <>
              {contractRequired && (
                <div className="card rounded-2xl p-5">
                  <div className="flex items-start gap-4">
                    <span className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ color: contractReady ? 'var(--success)' : 'var(--brand-400)', background: 'var(--panel-2)', border: '1px solid var(--line)' }}>
                      {contractReady ? <CheckIcon /> : '1'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold" style={{ color: 'var(--text)' }}>Contract ownership</h3>
                      <p className="mt-1 text-sm leading-5" style={{ color: 'var(--muted)' }}>
                        {contractReady ? `Owned by ${project.ownerAddress?.slice(0, 8)}...${project.ownerAddress?.slice(-6)}` : 'Connect the wallet that should own the generated contract. CtrlPoint pays the deployment transaction.'}
                      </p>
                      {!contractReady && (
                        <button disabled={contractBusy} onClick={deployContract} className="btn-secondary mt-4 px-4 py-2.5 text-sm">
                          {contractBusy ? 'Deploying contract...' : 'Connect owner wallet'}
                        </button>
                      )}
                      {project.explorerUrl && <a href={project.explorerUrl} target="_blank" rel="noreferrer" className="ml-3 text-xs font-semibold" style={{ color: 'var(--brand-400)' }}>ArcScan</a>}
                    </div>
                  </div>
                </div>
              )}

              <div className="card rounded-2xl p-5">
                <div className="flex items-start gap-4">
                  <span className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ color: 'var(--brand-400)', background: 'var(--panel-2)', border: '1px solid var(--line)' }}>
                    {contractRequired ? '2' : '1'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold" style={{ color: 'var(--text)' }}>DeWeb address</h3>
                    <p className="mt-1 text-sm leading-5" style={{ color: 'var(--muted)' }}>Choose the public MNS name for this DApp.</p>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <div className="input-shell flex flex-1 items-center rounded-xl px-3 py-0"
                    style={{ background: 'var(--input-bg)', border: '1px solid var(--line)' }}>
                    <input value={name} onChange={event => { setName(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); setMnsCheck(null) }}
                      className="min-w-0 flex-1 bg-transparent outline-none py-2.5 text-sm font-mono" style={{ color: 'var(--text)' }}
                      placeholder="choose-a-name" />
                    <span className="text-xs" style={{ color: 'var(--muted-2)' }}>.massa</span>
                  </div>
                  <button onClick={checkName} disabled={checking || name.length < 2} className="btn-secondary px-4 text-sm">
                    {checking ? <CheckingDots /> : 'Check'}
                  </button>
                </div>
                {mnsCheck && (
                  <p className="mt-2 text-xs font-semibold" style={{ color: mnsCheck.available ? 'var(--success)' : 'var(--danger)' }}>
                    {mnsCheck.available ? `${name}.massa is available${mnsCheck.creditCost ? ` for ${mnsCheck.creditCost} credits` : ' at no registration credit cost'}.` : `${name}.massa is not available.`}
                  </p>
                )}
                <button disabled={!contractReady || !mnsCheck?.available || name.length < 2}
                  onClick={publishFrontend} className="btn-primary w-full mt-4 py-3 text-sm">
                  Publish to DeWeb
                </button>
              </div>
            </>
          )}

          {error && <div className="rounded-xl px-4 py-3 text-sm leading-5" style={{ color: 'var(--danger)', background: 'rgba(var(--danger-rgb),.08)', border: '1px solid rgba(var(--danger-rgb),.22)' }}>{error}</div>}
        </div>
      </section>
    </div>
  )
}

function DeploymentProgress({ status, live }: { status: DeployStatus | null; live: boolean }) {
  const steps = ['QUEUED', 'UPLOADING', 'MNS_REGISTERING', 'COMPLETE']
  const normalized = status?.status === 'BUILDING' ? 'UPLOADING' : status?.status
  const current = normalized ? steps.indexOf(normalized) : 0
  const failed = status?.status === 'FAILED'
  return (
    <div className="card rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.14em]" style={{ color: failed ? 'var(--danger)' : 'var(--brand-400)' }}>
            {failed ? 'Publishing failed' : live ? 'Published' : 'Publishing to DeWeb'}
          </p>
          <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--text)' }}>{status?.step || 'Preparing deployment'}</p>
        </div>
        {!failed && !live && <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" style={{ color: 'var(--brand-400)' }} />}
      </div>
      <div className="mt-5 grid grid-cols-4 gap-2">
        {['Queued', 'Upload', 'MNS', 'Live'].map((label, index) => {
          const done = live || (!failed && index < current)
          const active = !failed && index === current
          return (
            <div key={label}>
              <div className="h-1.5 rounded-full" style={{ background: done || active ? 'var(--brand-400)' : 'var(--panel-2)' }} />
              <p className="mt-1.5 text-[10px] font-semibold" style={{ color: done || active ? 'var(--text-soft)' : 'var(--muted-2)' }}>{label}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CheckingDots() {
  return <span className="inline-flex items-center gap-1" aria-label="Checking availability">{[0, 1, 2].map(dot => <i key={dot} className="h-1 w-1 rounded-full animate-pulse-dot" style={{ background: 'currentColor', animationDelay: `${dot * .15}s` }} />)}</span>
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="m4 10.25 3.5 3.5L16 5.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ReleaseSuccess({ url, copied, onCopy, onShare, onDone, compact = false }: {
  url: string
  copied: boolean
  onCopy: () => void
  onShare: () => void
  onDone?: () => void
  compact?: boolean
}) {
  return (
    <div className="rounded-2xl p-5" style={{ background: 'rgba(var(--success-rgb),.07)', border: '1px solid rgba(var(--success-rgb),.22)' }}>
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
          style={{ color: 'var(--success)', border: '1px solid rgba(var(--success-rgb),.28)', background: 'rgba(var(--success-rgb),.1)' }}>
          <CheckIcon />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold" style={{ color: 'var(--text)' }}>{compact ? 'DApp is live' : 'Published successfully'}</h3>
          <a href={url} target="_blank" rel="noreferrer" className="mt-1 block break-all font-mono text-xs hover:underline" style={{ color: 'var(--success)' }}>{url}</a>
        </div>
      </div>
      <div className={`mt-5 grid gap-2 ${onDone ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
        <a href={url} target="_blank" rel="noreferrer" className="btn-secondary py-2.5 text-center text-xs">Open</a>
        <button type="button" onClick={onCopy} className="btn-secondary py-2.5 text-xs">{copied ? 'Copied' : 'Copy link'}</button>
        <button type="button" onClick={onShare} className="btn-secondary py-2.5 text-xs">Share</button>
        {onDone && <button type="button" onClick={onDone} className="btn-primary py-2.5 text-xs">Done</button>}
      </div>
    </div>
  )
}
