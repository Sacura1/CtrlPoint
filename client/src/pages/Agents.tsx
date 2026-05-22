import { Link } from 'react-router-dom'
import ThemeToggle from '../components/ThemeToggle'

const API_URL = (import.meta.env.VITE_API_URL || 'https://ctrlpoint-api.fly.dev').replace(/\/+$/, '')

const STEPS = [
  ['Discover', 'Read capabilities, manifest, or OpenAPI.'],
  ['Pay', 'Use Circle x402 to pay USDC on Arc.'],
  ['Deploy', 'CtrlPoint uploads the app to Massa DeWeb.'],
  ['Update', 'The same payer wallet updates its own sites.'],
]

const ENDPOINTS = [
  ['Deploy static', 'POST /api/agent/deploy', '$0.01', 'HTML, HTML file, or static zip.'],
  ['Deploy framework', 'POST /api/agent/deploy/framework', '$0.01', 'Project zip with package.json.'],
  ['Update static', 'POST /api/agent/update', '$0.001', 'Cheap static site update.'],
  ['Update framework', 'POST /api/agent/update/framework', '$0.001', 'Cheap framework site update.'],
]

const ROLES = [
  ['Circle', 'Payment protocol', 'Circle Gateway/x402 handles the 402 payment flow and USDC settlement.'],
  ['Arc', 'USDC network', 'Arc is the EVM network used by agents for USDC payments in this flow.'],
  ['Massa', 'Hosting layer', 'Massa DeWeb stores and serves the final website through an MNS name.'],
]

export default function Agents() {
  return (
    <div className="min-h-dvh overflow-x-hidden bg-[var(--bg)] text-[var(--text)]">
      <header className="sticky top-0 z-30 border-b border-white/10 backdrop-blur-xl" style={{ background: 'color-mix(in srgb, var(--bg) 90%, transparent)' }}>
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" aria-label="CtrlPoint home">
            <img src="/logo.png" className="brand-logo-dark h-7 w-auto" alt="CtrlPoint" />
            <img src="/logo-black.png" className="brand-logo-light h-7 w-auto" alt="CtrlPoint" />
          </Link>
          <nav className="flex items-center gap-2">
            <ThemeToggle compact />
            <a href={`${API_URL}/api/agent/capabilities`} target="_blank" rel="noopener noreferrer"
              className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-[var(--muted)] transition hover:text-[var(--text)] sm:inline-flex">
              Capabilities
            </a>
            <Link to="/auth" className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-[var(--text-soft)] transition hover:bg-white/[0.08] sm:px-4">
              Open app
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 sm:py-14 lg:grid-cols-[1fr_0.9fr] lg:items-center">
          <div>
            <div className="mb-5 inline-flex w-fit rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-emerald-300">
              Agent-native DeWeb deploys
            </div>
            <h1 className="max-w-3xl text-[2.35rem] font-black leading-[1.04] sm:text-5xl lg:text-[3.45rem]">
              AI agents can pay, deploy, and update websites onchain.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--muted)] sm:text-lg">
              CtrlPoint gives agents an x402-paid API for publishing HTML or framework apps to the Decentralized Web. No CtrlPoint signup amd no checkout page setup for the agent.
            </p>

            <div className="mt-7 grid max-w-xl grid-cols-3 gap-2">
              <LogoTile src="/circle.svg" lightSrc="/circle_black.svg" alt="Circle" width={112} height={29} />
              <LogoTile src="/arc.svg" lightSrc="/Arc_black.svg" alt="Arc" width={36} height={38} />
              <LogoTile src="/massa-white.svg" lightSrc="/massa.svg" alt="Massa" width={124} height={24} />
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a href={`${API_URL}/api/agent/manifest`} target="_blank" rel="noopener noreferrer"
                className="btn-primary rounded-2xl px-5 py-3 text-center text-sm font-bold">
                Agent manifest
              </a>
              <a href={`${API_URL}/api/agent/openapi.json`} target="_blank" rel="noopener noreferrer"
                className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-center text-sm font-bold text-[var(--text-soft)] transition hover:bg-white/[0.08]">
                OpenAPI schema
              </a>
            </div>
          </div>

          <div className="min-w-0 rounded-[8px] border border-white/10 bg-[var(--panel)] p-4 shadow-2xl shadow-black/30">
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-white/10 pb-3">
              <span className="text-sm font-bold text-[var(--text-soft)]">Paid deploy request</span>
              <span className="shrink-0 rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs font-bold text-emerald-300">x402</span>
            </div>
            <pre className="max-w-full overflow-x-auto whitespace-pre text-[11px] leading-5 text-[var(--text-soft)] sm:text-xs">
{`POST ${API_URL}/api/agent/deploy/framework
Idempotency-Key: launch-v1

mnsName=agent-launch
buildCommand=npm run build
outputDir=dist
file=@project.zip

402 Payment Required
agent pays $0.01 USDC
https://agent-launch.massahub.network`}
            </pre>
          </div>
        </section>

        <section className="border-y border-white/10 bg-white/[0.025]">
          <div className="mx-auto grid max-w-6xl gap-3 px-4 py-8 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
            {STEPS.map(([title, text]) => (
              <div key={title} className="rounded-[8px] border border-white/10 bg-[var(--panel)] p-4">
                <h2 className="text-base font-black">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <div className="mb-6 max-w-2xl">
            <h2 className="text-2xl font-black sm:text-3xl">How Circle, Arc, And Massa Fit</h2>
            <p className="mt-3 leading-7 text-[var(--muted)]">
              This is not three competing layers. Each one has a separate job in the deploy flow.
            </p>
          </div>
          <div className="grid gap-3 lg:grid-cols-3">
            {ROLES.map(([name, role, text]) => (
              <div key={name} className="rounded-[8px] border border-white/10 bg-[var(--panel)] p-5">
                <div className="mb-4 flex h-10 items-center">
                  {name === 'Circle' && <LogoImage src="/circle.svg" lightSrc="/circle_black.svg" alt="Circle" width={126} height={32} />}
                  {name === 'Arc' && <LogoImage src="/arc.svg" lightSrc="/Arc_black.svg" alt="Arc" width={38} height={40} />}
                  {name === 'Massa' && <LogoImage src="/massa-white.svg" lightSrc="/massa.svg" alt="Massa" width={132} height={25} />}
                </div>
                <h3 className="text-lg font-black">{role}</h3>
                <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-12 sm:px-6">
          <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h2 className="text-2xl font-black sm:text-3xl">Agent Endpoints</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)] sm:text-base">
                Deploys are priced for abuse control. Updates are much cheaper for iterative agents.
              </p>
            </div>
            <a href={`${API_URL}/api/agent/capabilities`} target="_blank" rel="noopener noreferrer"
              className="w-fit rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-[var(--brand-300)] transition hover:bg-white/[0.06]">
              JSON capabilities
            </a>
          </div>

          <div className="overflow-hidden rounded-[8px] border border-white/10">
            {ENDPOINTS.map(([label, endpoint, price, text]) => (
              <div key={endpoint} className="grid gap-2 border-b border-white/10 bg-[var(--panel)] p-4 last:border-b-0 md:grid-cols-[0.7fr_1.15fr_0.35fr_1fr] md:items-center">
                <span className="text-sm font-black text-white">{label}</span>
                <code className="break-all text-xs font-bold text-[var(--text-soft)] sm:text-sm">{endpoint}</code>
                <span className="w-fit rounded-full px-3 py-1 text-xs font-black text-[var(--brand-300)]" style={{ background: 'rgba(var(--brand-500-rgb),0.15)' }}>{price}</span>
                <p className="text-sm leading-6 text-[var(--muted)]">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-14 sm:px-6 lg:grid-cols-2">
          <InfoPanel title="If The Agent Goes Offline">
            The deployment can still be polled by deployment id. Later updates can be made by any agent or script using the same payer wallet. A wallet recovery UI should be the next production addition for humans who want to manage agent-owned sites from the dashboard.
          </InfoPanel>
          <InfoPanel title="What Agents Should Read">
            Agents should start from the capabilities endpoint, then use the manifest or OpenAPI schema to choose the correct endpoint, price, required fields, and idempotency behavior.
          </InfoPanel>
        </section>
      </main>
    </div>
  )
}

function LogoTile({ src, lightSrc, alt, width, height }: { src: string; lightSrc: string; alt: string; width: number; height: number }) {
  return (
    <div className="flex h-12 min-w-0 items-center justify-center rounded-[8px] border border-white/10 bg-white/[0.04] px-2 sm:h-14 sm:px-3">
      <LogoImage src={src} lightSrc={lightSrc} alt={alt} width={width} height={height} />
    </div>
  )
}

function LogoImage({ src, lightSrc, alt, width, height }: { src: string; lightSrc: string; alt: string; width: number; height: number }) {
  return (
    <span className="block max-w-full" style={{ width, height }}>
      <img src={src} alt={alt} className="theme-logo-dark h-full w-full object-contain" />
      <img src={lightSrc} alt={alt} className="theme-logo-light h-full w-full object-contain" />
    </span>
  )
}

function InfoPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[8px] border border-white/10 bg-[var(--panel)] p-5 sm:p-6">
      <h2 className="text-xl font-black sm:text-2xl">{title}</h2>
      <p className="mt-3 text-sm leading-7 text-[var(--muted)] sm:text-base">{children}</p>
    </div>
  )
}
