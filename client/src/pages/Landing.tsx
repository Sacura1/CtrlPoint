import { Link } from 'react-router-dom'
import { useAuth } from '../store/auth'

const API_URL = (import.meta.env.VITE_API_URL || 'https://ctrlpoint-api.fly.dev').replace(/\/+$/, '')

const FEATURES = [
  ['AI Builder', 'Describe a website and edit it in the browser.'],
  ['Massa DeWeb', 'Publish to decentralized hosting with an MNS name.'],
  ['Agent API', 'Let autonomous agents pay with x402 and deploy.'],
]

const METHODS = [
  ['Build', 'Use the editor to generate and refine a web app.'],
  ['Upload', 'Deploy an existing static site or built artifact.'],
  ['GitHub', 'Connect a repo for repeatable deploys.'],
  ['Agents', 'Expose deployment as a paid machine-readable API.'],
]

export default function Landing() {
  const { user, loading } = useAuth()
  const authTarget = user ? '/editor' : '/auth'
  const registerTarget = user ? '/editor' : '/auth?mode=register'

  return (
    <div className="min-h-dvh overflow-x-hidden bg-[#05050d] text-[#f7f3ff]">
      <header className="relative z-20 border-b border-white/[0.06]">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <img src="/logo.png" className="h-7 w-auto" alt="CtrlPoint" />
          {loading ? (
            <div className="h-9 w-20 rounded-xl bg-white/[0.05]" />
          ) : user ? (
            <nav className="flex items-center gap-2">
              <Link to="/agents" className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-[#b9b2d7] transition hover:text-white sm:inline-flex">
                Agents
              </Link>
              <a href={`${API_URL}/api/agent/capabilities`} target="_blank" rel="noopener noreferrer"
                className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-[#b9b2d7] transition hover:text-white md:inline-flex">
                Capabilities
              </a>
              <Link to="/editor" className="btn-primary px-4 py-2 text-sm sm:px-5">Open editor</Link>
            </nav>
          ) : (
            <nav className="flex items-center gap-2">
              <Link to="/agents" className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-[#b9b2d7] transition hover:text-white sm:inline-flex">
                Agents
              </Link>
              <a href={`${API_URL}/api/agent/capabilities`} target="_blank" rel="noopener noreferrer"
                className="hidden rounded-xl px-3 py-2 text-sm font-semibold text-[#b9b2d7] transition hover:text-white md:inline-flex">
                Capabilities
              </a>
              <Link to={authTarget} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-[#d9d2f0] transition hover:bg-white/[0.08] sm:px-4">
                Log in
              </Link>
              <Link to={registerTarget} className="btn-primary px-4 py-2 text-sm">Get started</Link>
            </nav>
          )}
        </div>
      </header>

      <main>
        <section className="relative">
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_-10%,rgba(139,92,246,0.24),transparent_42%),radial-gradient(circle_at_15%_40%,rgba(16,185,129,0.10),transparent_30%)]" />
          <div className="relative mx-auto grid min-h-[calc(100dvh-64px)] max-w-6xl content-center gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_0.82fr] lg:items-center">
            <div className="text-center lg:text-left">
              <div className="mb-5 inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-[#c4b5fd]">
                AI web apps on Massa DeWeb
              </div>
              <h1 className="mx-auto max-w-4xl text-[2.7rem] font-black leading-[0.98] sm:text-6xl lg:mx-0 lg:text-7xl">
                Build, deploy, and keep websites alive onchain.
              </h1>
              <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-[#aaa3c7] sm:text-lg lg:mx-0">
                CtrlPoint turns prompts, uploads, GitHub repos, and agent requests into live Massa DeWeb sites with update paths built in.
              </p>
              <div className="mt-8 mb-6 flex flex-col items-center justify-center gap-3 sm:flex-row lg:items-start lg:justify-start">
                <Link to={authTarget} className="btn-primary max-w-[220px] px-5 py-3.5 text-center text-base sm:max-w-none sm:px-7">
                  Start building free
                </Link>
                <Link to="/agents" className="max-w-[220px] whitespace-normal rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3.5 text-center text-sm font-bold leading-5 text-[#d9d2f0] transition hover:bg-white/[0.08] sm:max-w-none sm:px-7">
                  Agent deploy API
                </Link>
              </div>
            </div>

            <div className="mx-auto w-full max-w-md rounded-[8px] border border-white/10 bg-[#0a0912] p-3 shadow-2xl shadow-black/35">
              <div className="grid gap-2">
                {METHODS.map(([title, text]) => (
                  <div key={title} className="rounded-[8px] border border-white/10 bg-white/[0.035] p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="text-sm font-black">{title}</h2>
                        <p className="mt-1 text-xs leading-5 text-[#9d95ba]">{text}</p>
                      </div>
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#8b5cf6]" />
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
              <div key={title} className="rounded-[8px] border border-white/10 bg-[#0a0912] p-5">
                <h2 className="text-lg font-black">{title}</h2>
                <p className="mt-2 text-sm leading-6 text-[#9d95ba]">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-6 px-4 py-12 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div>
            <h2 className="text-2xl font-black sm:text-3xl">Now available for autonomous agents.</h2>
            <p className="mt-3 leading-7 text-[#9d95ba]">
              Agents can discover CtrlPoint through JSON capabilities, pay tiny USDC fees through Circle x402 on Arc, and deploy to Massa DeWeb without creating a CtrlPoint account.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <LogoTile src="/circle.svg" alt="Circle" width={118} height={30} />
            <LogoTile src="/arc.svg" alt="Arc" width={38} height={40} />
            <LogoTile src="/massa-white.svg" alt="Massa" width={128} height={24} />
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[0.06] py-6 text-center text-xs text-[#746d91]">
        2026 CtrlPoint · Built on Massa & Circle
      </footer>
    </div>
  )
}

function LogoTile({ src, alt, width, height }: { src: string; alt: string; width: number; height: number }) {
  return (
    <div className="flex h-14 min-w-0 items-center justify-center rounded-[8px] border border-white/10 bg-white/[0.04] px-3">
      <span className="block max-w-full" style={{ width, height }}>
        <img src={src} alt={alt} className="block h-full w-full object-contain" />
      </span>
    </div>
  )
}
