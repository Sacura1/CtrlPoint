import { useState, useEffect, useRef } from 'react'
import { arcDapps as arcDappsApi, deploy as deployApi, sites as sitesApi } from '../api'
import { ArcDapp, DeployStatus, Site } from '../types'
import { mnsPublicDomain } from '../utils/siteUrl'
import ClaimedBadge, { claimedOwnershipMessage } from './ClaimedBadge'
import { useAuth } from '../store/auth'

const ARC_DAPPS_UI_ENABLED = false

interface Props {
  generatedCode: string
  title: string
  description: string
  lastPrompt: string
  existingSite?: Site
  onClose: (deploymentStarted?: boolean) => void
  onDeployed: (site: Site) => void
  onLive?: (siteId: string) => void
}

const STEPS: Record<string, string> = {
  QUEUED:          'Waiting in queue…',
  BUILDING:        'Building project…',
  UPLOADING:       'Uploading to Massa chain…',
  MNS_REGISTERING: 'Registering domain…',
  COMPLETE:        'Your site is live!',
  FAILED:          'Deployment failed',
}

const STEP_ORDER = ['QUEUED', 'BUILDING', 'UPLOADING', 'MNS_REGISTERING', 'COMPLETE']

export default function DeployModal({ generatedCode, title, description, lastPrompt, existingSite, onClose, onDeployed, onLive }: Props) {
  const { user, setUser } = useAuth()
  const [mnsName, setMnsName]        = useState(existingSite?.scAddress ? existingSite.mnsName : '')
  const [mnsAvailable, setAvailable] = useState<boolean | null>(null)
  const [mnsCreditCost, setMnsCreditCost] = useState(0)
  const [mnsMessage, setMnsMessage] = useState('')
  const [checking, setChecking]      = useState(false)
  const [deploying, setDeploying]    = useState(false)
  const [contractDeploying, setContractDeploying] = useState(false)
  const [arcDapp, setArcDapp] = useState<ArcDapp | null>(null)
  const [ownerAddress, setOwnerAddress] = useState('')
  const [deploymentId, setDepId]     = useState<string | null>(null)
  const [status, setStatus]          = useState<DeployStatus | null>(null)
  const [error, setError]            = useState('')
  const siteIdRef = useRef<string | null>(existingSite?.id ?? null)
  const mnsCheckSeq = useRef(0)

  const isUpdate = !!existingSite?.scAddress
  const isExistingDraft = !!existingSite && !existingSite.scAddress
  const isClaimed = !!existingSite?.ownershipClaimed
  const contractNeeded = !!arcDapp && ['split-payments', 'voting-polls', 'membership', 'games'].includes(arcDapp.category) && !arcDapp.contractAddress
  const closeModal = () => onClose(!!deploymentId)

  useEffect(() => {
    if (!ARC_DAPPS_UI_ENABLED) return
    if (!existingSite?.id) return
    arcDappsApi.getForSite(existingSite.id).then(({ dapp }) => {
      setArcDapp(dapp)
      if (dapp?.ownerAddress) setOwnerAddress(dapp.ownerAddress)
    }).catch(() => {})
  }, [existingSite?.id])

  useEffect(() => {
    mnsCheckSeq.current += 1
    setMnsCreditCost(0)
    setMnsMessage('')

    if (!mnsName || mnsName.length < 2 || isUpdate) {
      setAvailable(null)
      setChecking(false)
      return
    }

    setAvailable(null)
    setChecking(true)
    const seq = mnsCheckSeq.current
    const t = setTimeout(async () => {
      try {
        const r = await deployApi.checkMns(mnsName)
        if (seq !== mnsCheckSeq.current) return
        setAvailable(r.available)
        setMnsCreditCost(r.creditCost || 0)
        setMnsMessage(r.message || r.error || '')
      } catch {
        if (seq !== mnsCheckSeq.current) return
        setAvailable(false)
      } finally {
        if (seq === mnsCheckSeq.current) setChecking(false)
      }
    }, 600)
    return () => clearTimeout(t)
  }, [mnsName, isUpdate])

  useEffect(() => {
    if (!deploymentId) return
    const iv = setInterval(async () => {
      try {
        const s = await deployApi.status(deploymentId)
        setStatus(s)
        if (s.status === 'COMPLETE' || s.status === 'FAILED') {
          clearInterval(iv)
          setDeploying(false)
          if (s.status === 'COMPLETE') {
            if (onLive) onLive(existingSite?.id ?? siteIdRef.current!)
          }
        }
      } catch {}
    }, 2000)
    return () => clearInterval(iv)
  }, [deploymentId])

  const handleDeploy = async () => {
    setError('')
    if (isClaimed) {
      setError(claimedOwnershipMessage)
      return
    }
    setDeploying(true)
    try {
      let siteId = existingSite?.id
      if (!siteId) {
        const { site } = await sitesApi.create({ mnsName, generatedCode, title, description, lastPrompt })
        siteId = site.id
        siteIdRef.current = siteId
        onDeployed(site)
      } else if (isExistingDraft) {
        const { site } = await sitesApi.updateDraft(siteId, { mnsName, generatedCode, title, description, lastPrompt })
        onDeployed(site)
      }

      if (ARC_DAPPS_UI_ENABLED && !arcDapp && siteId) {
        const { dapp } = await arcDappsApi.getForSite(siteId).catch(() => ({ dapp: null }))
        if (dapp) {
          setArcDapp(dapp)
          if (dapp.ownerAddress) setOwnerAddress(dapp.ownerAddress)
        }
      }

      const currentDapp = ARC_DAPPS_UI_ENABLED
        ? arcDapp || (siteId ? (await arcDappsApi.getForSite(siteId).catch(() => ({ dapp: null }))).dapp : null)
        : null
      if (currentDapp && ['split-payments', 'voting-polls', 'membership', 'games'].includes(currentDapp.category) && !currentDapp.contractAddress) {
        if (!/^0x[a-fA-F0-9]{40}$/.test(ownerAddress.trim())) {
          setError('Enter the EVM wallet that should own this Arc contract.')
          setDeploying(false)
          return
        }
        setContractDeploying(true)
        const { dapp } = await arcDappsApi.deployContract(currentDapp.id, ownerAddress.trim())
        setArcDapp(dapp)
        setContractDeploying(false)
      }

      const { deploymentId: id, creditsCharged } = await deployApi.start(siteId)
      if (creditsCharged && user) setUser({ ...user, credits: Math.max(0, user.credits - creditsCharged) })
      setDepId(id)
    } catch (err: any) {
      setError(err.message)
      setDeploying(false)
      setContractDeploying(false)
    }
  }

  const nameValid = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(mnsName) && mnsName.length >= 2
  const hasEnoughMnsCredits = isUpdate || mnsCreditCost <= 0 || !user || user.credits >= mnsCreditCost
  const hasValidOwner = !contractNeeded || /^0x[a-fA-F0-9]{40}$/.test(ownerAddress.trim())
  const canDeploy = isClaimed ? false : isUpdate ? (!deploying && hasValidOwner) : (nameValid && mnsAvailable === true && hasEnoughMnsCredits && !deploying && hasValidOwner)
  const isDone    = status?.status === 'COMPLETE' || status?.status === 'FAILED'
  const currentStepIdx = STEP_ORDER.indexOf(status?.status ?? 'QUEUED')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(12px)' }}>

      <div className="w-full max-w-sm rounded-2xl overflow-hidden animate-scale-in"
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--line)',
          boxShadow: '0 1px 0 rgba(255,255,255,0.08) inset, 0 32px 100px rgba(0,0,0,0.8)',
        }}>

        {/* Header bar */}
        <div className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--line)' }}>
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(var(--accent-rgb, var(--brand-600-rgb)),0.12)', border: '1px solid rgba(var(--accent-rgb, var(--brand-600-rgb)),0.24)' }}>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <path d="M5.5 8.5l-2-2a2.12 2.12 0 010-3l1-1a2.12 2.12 0 013 0l2 2M8.5 5.5l2 2a2.12 2.12 0 010 3l-1 1a2.12 2.12 0 01-3 0l-2-2"
                  stroke="var(--accent, var(--brand-400))" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            </div>
            <h2 className="font-semibold text-sm" style={{ color: 'var(--text)' }}>
              {isUpdate ? 'Push update' : 'Deploy to DeWeb'}
            </h2>
          </div>
          <button onClick={closeModal}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-150"
            style={{ background: 'color-mix(in srgb, var(--panel-2) 70%, transparent)', border: '1px solid var(--line)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'color-mix(in srgb, var(--panel-2) 86%, transparent)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'color-mix(in srgb, var(--panel-2) 70%, transparent)')}
            aria-label={deploymentId ? 'Close and view deployments' : 'Close deploy modal'}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 2l8 8M10 2l-8 8" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="px-6 py-5">

          {/* Pre-deploy form */}
          {!deploymentId ? (
            <div className="space-y-5">
              {!isUpdate ? (
                <div>
                  <label className="block text-xs font-medium mb-2" style={{ color: 'var(--muted)' }}>
                    SITE NAME
                  </label>
                  <div className="relative">
                    <input
                      className="input pr-24 font-mono text-sm"
                      placeholder="my-awesome-site"
                      value={mnsName}
                      onChange={e => setMnsName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                      maxLength={100}
                      autoFocus
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold">
                      {mnsName.length >= 2 && (
                        checking
                          ? <span style={{ color: 'var(--muted)' }}>checking…</span>
                          : mnsAvailable === true
                            ? <span style={{ color: 'var(--success)' }}>✓ available</span>
                            : mnsAvailable === false
                              ? <span style={{ color: '#f87171' }}>✗ taken</span>
                              : null
                      )}
                    </div>
                  </div>
                  {mnsName && (
                    <p className="text-xs mt-2 font-mono" style={{ color: 'var(--muted-2)' }}>
                      → {mnsName}.{mnsPublicDomain}
                    </p>
                  )}
                  {mnsName && !checking && (
                    <p className={`text-xs mt-2 ${mnsCreditCost > 0 ? 'text-amber-300' : 'text-emerald-400'}`}>
                      {mnsMessage || (mnsName.length >= 6 ? '6+ character MNS names are free right now.' : '')}
                      {mnsCreditCost > 0 && user && user.credits < mnsCreditCost ? ` You have ${user.credits} credit${user.credits === 1 ? '' : 's'}.` : ''}
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-xl px-4 py-3" style={{ background: 'rgba(var(--brand-600-rgb),0.08)', border: '1px solid rgba(var(--brand-600-rgb),0.15)' }}>
                  <p className="text-sm text-ink-200 flex items-center gap-2 flex-wrap">
                    Updating <span className="font-mono" style={{ color: 'var(--accent, var(--brand-400))' }}>{existingSite.mnsName}.{mnsPublicDomain}</span>
                    {isClaimed && <ClaimedBadge compact />}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--muted-2)' }}>URL stays the same — content updates in place.</p>
                </div>
              )}

              {isClaimed && (
                <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <svg className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10A8 8 0 112 10a8 8 0 0116 0zM9 8a1 1 0 112 0v5a1 1 0 11-2 0V8zm1-4a1.25 1.25 0 100 2.5A1.25 1.25 0 0010 4z" clipRule="evenodd"/>
                  </svg>
                  <p className="text-red-400 text-xs leading-relaxed">{claimedOwnershipMessage}</p>
                </div>
              )}

              {arcDapp && (
                <div className="rounded-2xl overflow-hidden"
                  style={{ background: 'color-mix(in srgb, var(--panel-2) 66%, transparent)', border: '1px solid var(--line)' }}>
                  <div className="px-4 py-3" style={{ borderBottom: contractNeeded || arcDapp.contractAddress ? '1px solid var(--line)' : 'none' }}>
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                        style={{ color: 'var(--success)', background: 'rgba(var(--success-rgb),0.08)', border: '1px solid rgba(var(--success-rgb),0.18)' }}>
                        <svg width="17" height="17" viewBox="0 0 16 16" fill="none">
                          <path d="M8 1.8l5 2.1v4.3c0 2.8-1.9 4.8-5 6-3.1-1.2-5-3.2-5-6V3.9l5-2.1z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold" style={{ color: 'var(--text-soft)' }}>Arc dApp setup</p>
                        <p className="mt-1 text-xs leading-5" style={{ color: 'var(--muted)' }}>
                          {arcDapp.contractAddress
                            ? 'Contract is deployed. Publishing will push the frontend with the contract config.'
                            : contractNeeded
                              ? 'This dApp needs an Arc Testnet contract before the frontend goes live.'
                              : 'This dApp is frontend-only and does not need a contract.'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {contractNeeded && (
                    <div className="space-y-3 px-4 py-4">
                      <div>
                        <label className="mb-2 block text-xs font-medium" style={{ color: 'var(--muted)' }}>
                          CONTRACT OWNER WALLET
                        </label>
                        <input
                          className="input font-mono text-xs"
                          placeholder="0x..."
                          value={ownerAddress}
                          disabled={deploying}
                          onChange={e => setOwnerAddress(e.target.value.trim())}
                        />
                        <p className="mt-2 text-xs leading-5" style={{ color: 'var(--muted-2)' }}>
                          CtrlPoint pays/deploys the template, but this wallet becomes the contract owner/admin.
                        </p>
                      </div>
                      {contractDeploying && (
                        <div className="flex items-start gap-2 rounded-xl px-3 py-2"
                          style={{ color: 'var(--success)', background: 'rgba(var(--success-rgb),0.07)', border: '1px solid rgba(var(--success-rgb),0.16)' }}>
                          <span className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          <p className="text-xs leading-5">Deploying the Arc contract. After confirmation, publishing to DeWeb will start automatically.</p>
                        </div>
                      )}
                    </div>
                  )}

                  {arcDapp.contractAddress && (
                    <div className="px-4 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--muted-2)' }}>Contract</p>
                      <a href={arcDapp.explorerUrl || undefined} target="_blank" rel="noreferrer"
                        className="mt-1 block break-all font-mono text-xs hover:underline"
                        style={{ color: 'var(--success)' }}>
                        {arcDapp.contractAddress}
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* Deploy note */}
              <div className="py-3"
                style={{ borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
                <p className="text-sm text-ink-600">6+ character MNS names are free right now. Shorter names use credits before deployment starts.</p>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2.5 px-3.5 py-3 rounded-xl animate-fade-in"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                  <svg className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"/>
                  </svg>
                  <p className="text-red-400 text-xs leading-relaxed">{error}</p>
                </div>
              )}

              <button className="btn-primary w-full py-3" onClick={handleDeploy} disabled={!canDeploy}>
                {isClaimed ? 'Ownership claimed' : contractDeploying ? 'Deploying contract...' : contractNeeded ? 'Deploy contract & publish' : isUpdate ? 'Push update ->' : 'Deploy to blockchain ->'}
              </button>
            </div>

          ) : (
            /* Progress state */
            <div className="py-2">
              {!isDone ? (
                <>
                  {/* Animated progress ring */}
                  <div className="flex justify-center mb-6">
                    <div className="relative w-16 h-16">
                      <svg className="w-16 h-16 animate-spin-slow" viewBox="0 0 64 64" fill="none">
                        <circle cx="32" cy="32" r="26" stroke="rgba(var(--brand-600-rgb),0.15)" strokeWidth="2.5"/>
                        <path d="M58 32A26 26 0 0032 6" stroke="url(#dpGrad)" strokeWidth="2.5" strokeLinecap="round"/>
                        <defs>
                          <linearGradient id="dpGrad" x1="32" y1="6" x2="58" y2="32" gradientUnits="userSpaceOnUse">
                            <stop stopColor="var(--brand-600)" stopOpacity="0"/>
                            <stop offset="1" stopColor="var(--brand-400)"/>
                          </linearGradient>
                        </defs>
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-4 h-4 rounded-full animate-pulse"
                          style={{ background: 'radial-gradient(circle, rgba(var(--brand-600-rgb),0.9) 0%, transparent 100%)' }} />
                      </div>
                    </div>
                  </div>

                  {/* Step list */}
                  <div className="space-y-2.5 mb-5">
                    {STEP_ORDER.filter(s => s !== 'COMPLETE').map((step, i) => {
                      const done = i < currentStepIdx
                      const active = i === currentStepIdx
                      return (
                        <div key={step} className="flex items-center gap-3">
                          <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-300"
                            style={done
                              ? { background: 'rgba(var(--success-rgb),0.15)', border: '1px solid rgba(var(--success-rgb),0.3)' }
                              : active
                                ? { background: 'rgba(var(--brand-600-rgb),0.15)', border: '1px solid rgba(var(--brand-600-rgb),0.4)' }
                                : { background: 'color-mix(in srgb, var(--panel-2) 70%, transparent)', border: '1px solid var(--line)' }}>
                            {done ? (
                              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                <path d="M2 5l2.5 2.5L8 2.5" stroke="var(--success)" strokeWidth="1.5" strokeLinecap="round"/>
                              </svg>
                            ) : active ? (
                              <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--brand-600)' }} />
                            ) : (
                              <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--muted-2)' }} />
                            )}
                          </div>
                          <span className="text-xs transition-all duration-300"
                            style={{ color: done ? 'var(--success)' : active ? 'var(--brand-300)' : 'var(--muted-2)' }}>
                            {STEPS[step]}
                          </span>
                        </div>
                      )
                    })}
                  </div>

                  <p className="text-center text-xs" style={{ color: 'var(--muted-2)' }}>
                    This takes 1–3 minutes on mainnet
                  </p>
                </>

              ) : status?.status === 'COMPLETE' ? (
                <div className="text-center py-2 animate-scale-in">
                  <div className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center"
                    style={{ background: 'rgba(var(--success-rgb),0.1)', border: '1px solid rgba(var(--success-rgb),0.25)', boxShadow: '0 0 30px rgba(var(--success-rgb),0.15)' }}>
                    <svg className="w-6 h-6" style={{ color: 'var(--success)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                    </svg>
                  </div>
                  <p className="font-bold text-ink-50 mb-1">Site is live!</p>
                  <p className="text-xs mb-6" style={{ color: 'var(--muted)' }}>
                    Deployed on Massa mainnet
                  </p>
                  {status?.url && (
                    <a href={status.url} target="_blank" rel="noopener noreferrer"
                      className="btn-primary w-full mb-3 py-2.5 text-sm">
                      Open site ↗
                    </a>
                  )}
                  <button onClick={closeModal} className="btn-secondary w-full text-sm py-2.5">Done</button>
                </div>

              ) : (
                <div className="text-center py-2 animate-scale-in">
                  <div className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center"
                    style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', boxShadow: '0 0 30px rgba(239,68,68,0.1)' }}>
                    <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                  </div>
                  <p className="font-bold text-ink-50 mb-1">Deployment failed</p>
                  <p className="text-xs mb-6 text-red-400/70 px-4 leading-relaxed">{status?.error}</p>
                  <button onClick={closeModal} className="btn-secondary w-full text-sm py-2.5">Close</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
