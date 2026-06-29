import { Link } from 'react-router-dom'
import { useAuth } from '../store/auth'
import ThemeToggle from '../components/ThemeToggle'
import PlayStoreButton from '../components/PlayStoreButton'

const API_URL = (import.meta.env.VITE_API_URL || 'https://ctrlpoint-api.fly.dev').replace(/\/+$/, '')

const FEATURES = [
  ['AI Builder', 'Describe a website and edit it in the browser.'],
  ['Massa DeWeb', 'Publish to decentralized hosting with an MNS name.'],
  ['Agent API', 'Let autonomous agents pay with x402 and deploy.'],
]

const METHODS = [
  ['Build', 'Use the editor to generate and refine a web app.'],
  ['Upload', 'Deploy an existing static site or built artifact for free.'],
  ['GitHub', 'Connect a repo with free deploys and free auto-deploy on push.'],
  ['Agents', 'Expose deployment as a paid machine-readable API.'],
]

export default function Landing() {
  const { user, loading } = useAuth()
  const authTarget = user ? '/deploy' : '/auth'
  const registerTarget = user ? '/deploy' : '/auth?mode=register'

  return (
    <div className="min-h-dvh overflow-x-hidden bg-[var(--bg)] text-[var(--text)]">
      <header className="relative z-20 border-b border-white/[0.06]">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div>
            <img src="/logo.png" className="brand-logo-dark h-7 w-auto" alt="CtrlPoint" />
            <img src="/logo-black.png" className="brand-logo-light h-7 w-auto" alt="CtrlPoint" />
          </div>
          {loading ? (
            <div className="h-9 w-20 rounded-xl bg-white/[0.05]" />
          ) : user ? (
            <nav className="flex items-center gap-2">
              <ThemeToggle compact />
              <Link to="/agents" className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-[var(--muted)] transition hover:text-[var(--text)] sm:inline-flex">
                Agents
              </Link>
              <a href={`${API_URL}/api/agent/capabilities`} target="_blank" rel="noopener noreferrer"
                className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-[var(--muted)] transition hover:text-[var(--text)] md:inline-flex">
                Capabilities
              </a>
              <Link to="/deploy" className="btn-primary px-4 py-2 text-sm sm:px-5">Open</Link>
            </nav>
          ) : (
            <nav className="flex items-center gap-2">
              <ThemeToggle compact />
              <Link to="/agents" className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-[var(--muted)] transition hover:text-[var(--text)] sm:inline-flex">
                Agents
              </Link>
              <a href={`${API_URL}/api/agent/capabilities`} target="_blank" rel="noopener noreferrer"
                className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-[var(--muted)] transition hover:text-[var(--text)] md:inline-flex">
                Capabilities
              </a>
              <Link to={authTarget} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-[var(--text-soft)] transition hover:bg-white/[0.08] sm:px-4">
                Log in
              </Link>
              <Link to={registerTarget} className="btn-primary px-4 py-2 text-sm">Get started</Link>
            </nav>
          )}
        </div>
      </header>

      <main>
        <section className="relative">
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_-10%,rgba(var(--brand-500-rgb),0.18),transparent_42%)]" />
          <div className="relative mx-auto grid min-h-[calc(100dvh-64px)] max-w-6xl content-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_0.82fr] lg:items-center">
            <div className="text-center lg:text-left">
              <div className="mb-5 inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-[var(--brand-300)]">
                Web apps on Massa DeWeb
              </div>
              <h1 className="mx-auto max-w-4xl text-[clamp(2.35rem,11vw,4.5rem)] font-black leading-[1.02] tracking-normal sm:text-6xl lg:mx-0 lg:text-7xl">
                <span className="block">Build and deploy</span>
                <span className="block">websites onchain</span>
                <span className="mt-2 inline-flex rounded-2xl px-3 py-1 text-[0.46em] leading-none sm:mt-3 sm:px-4 sm:py-1.5"
                  style={{ color: 'var(--success)', background: 'rgba(var(--success-rgb),0.09)', border: '1px solid rgba(var(--success-rgb),0.2)' }}>
                  for free
                </span>
              </h1>
              <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-[var(--muted)] sm:text-lg lg:mx-0">
                CtrlPoint turns GitHub repos, prompts, uploads, and agent requests into live Massa DeWeb sites with update paths built in.
              </p>
              <div className="mx-auto mt-4 flex max-w-xl flex-wrap justify-center gap-2 lg:mx-0 lg:justify-start">
                <span className="rounded-full border border-[rgba(var(--success-rgb),0.22)] bg-[rgba(var(--success-rgb),0.08)] px-3 py-1 text-xs font-bold text-[var(--success)]">
                  Free deploys
                </span>
                <span className="rounded-full border border-[rgba(var(--success-rgb),0.22)] bg-[rgba(var(--success-rgb),0.08)] px-3 py-1 text-xs font-bold text-[var(--success)]">
                  Free GitHub auto-deploys
                </span>
              </div>
              <div className="mt-8 mb-6 flex flex-col items-center justify-center gap-3 sm:flex-row lg:items-start lg:justify-start">
                <Link to={authTarget} className="btn-primary max-w-[220px] px-5 py-3.5 text-center text-base sm:max-w-none sm:px-7">
                  Start building free
                </Link>
                <Link to="/agents" className="max-w-[220px] whitespace-normal rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3.5 text-center text-sm font-bold leading-5 text-[var(--text-soft)] transition hover:bg-white/[0.08] sm:max-w-none sm:px-7">
                  Agent deploy API
                </Link>
                <PlayStoreButton className="max-w-[220px] sm:max-w-none" />
              </div>
            </div>

            <div className="mx-auto w-full max-w-md rounded-[8px] border border-white/10 bg-[var(--panel)] p-3 shadow-2xl shadow-black/35">
              <div className="grid gap-2">
                {METHODS.map(([title, text]) => (
                  <div key={title} className="rounded-[8px] border border-white/10 bg-white/[0.035] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-sm font-black">{title}</h2>
                        <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{text}</p>
                      </div>
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[var(--brand-500)]" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-white/10 bg-white/[0.025]">
          <div className="mx-auto grid max-w-6xl gap-3 px-4 py-9 sm:grid-cols-3 sm:px-6">
            {FEATURES.map(([title, text]) => (
              <div key={title} className="rounded-[8px] border border-white/10 bg-[var(--panel)] p-5">
                <h2 className="text-lg font-black">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-6 px-4 py-12 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <h2 className="text-2xl font-black sm:text-3xl">Now available for autonomous agents.</h2>
            <p className="mt-3 leading-7 text-[var(--muted)]">
              Agents can discover CtrlPoint through JSON capabilities, pay tiny USDC fees through Circle x402 on Arc, and deploy to Massa DeWeb without creating a CtrlPoint account.
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Link to="/agents/analytics" className="inline-flex rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-[var(--brand-300)] transition hover:bg-white/[0.06]">
                View public agent analytics
              </Link>
              <PlayStoreButton className="w-fit py-2.5" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <LogoTile src="/circle.svg" lightSrc="/circle_black.svg" alt="Circle" width={118} height={30} />
            <LogoTile src="/arc.svg" lightSrc="/Arc_black.svg" alt="Arc" width={38} height={40} />
            <LogoTile src="/massa-white.svg" lightSrc="/massa.svg" alt="Massa" width={128} height={24} />
          </div>
        </section>
      </main>

      <footer className="border-t py-6 text-xs"
        style={{ borderColor: 'var(--line)', color: 'var(--muted-2)' }}>
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 sm:flex-row sm:px-6">
          <span>2026 CtrlPoint · Built on Massa & Circle</span>
          <div className="flex items-center gap-2">
            <Link
              to="/privacy"
              className="inline-flex items-center rounded-xl px-3 py-2 font-semibold transition"
              style={{ color: 'var(--muted)', border: '1px solid var(--line)', background: 'color-mix(in srgb, var(--panel-2) 58%, transparent)' }}
            >
              Privacy
            </Link>
            <Link
              to="/account-deletion"
              className="inline-flex items-center rounded-xl px-3 py-2 font-semibold transition"
              style={{ color: 'var(--muted)', border: '1px solid var(--line)', background: 'color-mix(in srgb, var(--panel-2) 58%, transparent)' }}
            >
              Account deletion
            </Link>
            <a
              href="https://x.com/ctrlpointBuild"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl px-3 py-2 font-semibold transition"
              style={{ color: 'var(--muted)', border: '1px solid var(--line)', background: 'color-mix(in srgb, var(--panel-2) 58%, transparent)' }}
              aria-label="Follow CtrlPoint on X"
            >
              <XIcon />
              {/* <span>@ctrlpointBuild</span> */}
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}

function XIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M17.53 3h3.16l-6.9 7.88L21.9 21h-6.35l-4.97-6.5L4.9 21H1.73l7.38-8.44L1.33 3h6.51l4.49 5.94L17.53 3Zm-1.11 16.22h1.75L6.9 4.69H5.02l11.4 14.53Z"
        fill="currentColor"
      />
    </svg>
  )
}

function LogoTile({ src, lightSrc, alt, width, height }: { src: string; lightSrc: string; alt: string; width: number; height: number }) {
  return (
    <div className="flex h-14 min-w-0 items-center justify-center rounded-[8px] border border-white/10 bg-white/[0.04] px-3">
      <span className="block max-w-full" style={{ width, height }}>
        <img src={src} alt={alt} className="theme-logo-dark h-full w-full object-contain" />
        <img src={lightSrc} alt={alt} className="theme-logo-light h-full w-full object-contain" />
      </span>
    </div>
  )
}
