import { Link } from 'react-router-dom'
import ThemeToggle from '../components/ThemeToggle'

const requestEmail = 'support@ctrlpoint.dev'
const mailto = `mailto:${requestEmail}?subject=${encodeURIComponent('CtrlPoint account deletion request')}&body=${encodeURIComponent(
  'Please delete my CtrlPoint account and associated personal data.\n\nAccount email:\nReason for deletion (optional):\n',
)}`

const deletedItems = [
  'Your CtrlPoint account profile and authentication records.',
  'Draft sites, generated site code, uploaded files, prompts, and app metadata stored in CtrlPoint.',
  'Saved API keys, wallet address settings, GitHub connection records, and custom domain records stored in CtrlPoint.',
  'Support messages that are no longer required for legal, security, or abuse-prevention reasons.',
]

const retainedItems = [
  'Billing, fraud-prevention, security, and legal records may be retained where required by law or needed to resolve disputes.',
  'Public blockchain or decentralized-network data, including deployed website assets and MNS records, may remain accessible outside CtrlPoint control.',
  'Backups and operational logs may persist for a limited period before normal deletion cycles remove them.',
]

export default function AccountDeletion() {
  return (
    <div className="min-h-dvh bg-[var(--bg)] text-[var(--text)]">
      <header className="border-b border-white/[0.06] bg-[var(--bg)]/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="inline-flex items-center">
            <img src="/logo.png" className="brand-logo-dark h-7 w-auto" alt="CtrlPoint" />
            <img src="/logo-black.png" className="brand-logo-light h-7 w-auto" alt="CtrlPoint" />
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle compact />
            <Link to="/auth" className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-[var(--text-soft)] transition hover:bg-white/[0.08]">
              Log in
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
        <section className="max-w-3xl">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--brand-300)]">Account deletion</p>
          <h1 className="mt-3 text-4xl font-black tracking-normal sm:text-5xl">Request deletion of your CtrlPoint account</h1>
          <p className="mt-6 text-base leading-8 text-[var(--text-soft)]">
            You can request deletion of your CtrlPoint account and associated personal data at any time. Send the request from the email address
            used for your CtrlPoint account so we can verify ownership.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <a href={mailto} className="btn-primary px-5 py-3 text-center text-sm">
              Request account deletion
            </a>
            <Link
              to="/privacy"
              className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-bold text-[var(--text-soft)] transition hover:bg-white/[0.08]"
            >
              Privacy policy
            </Link>
          </div>
        </section>

        <section className="mt-10 grid gap-4 lg:grid-cols-2">
          <div className="card p-5 sm:p-6">
            <h2 className="text-lg font-black">How to request deletion</h2>
            <ol className="mt-4 grid list-decimal gap-3 pl-5 text-sm font-medium leading-7 text-[var(--text-soft)]">
              <li>Email <span className="font-black text-[var(--text)]">{requestEmail}</span> with the subject “CtrlPoint account deletion request”.</li>
              <li>Include the email address used for your CtrlPoint account.</li>
              <li>We may ask for confirmation if the request is not sent from the account email.</li>
              <li>After verification, we will process the deletion request and confirm when it is complete.</li>
            </ol>
          </div>

          <div className="card p-5 sm:p-6">
            <h2 className="text-lg font-black">Deletion timeline</h2>
            <p className="mt-4 text-sm font-medium leading-7 text-[var(--text-soft)]">
              Verified deletion requests are typically processed within 30 days. Some records may be retained longer where required for legal,
              billing, security, fraud-prevention, or dispute-resolution purposes.
            </p>
          </div>
        </section>

        <section className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="card p-5 sm:p-6">
            <h2 className="text-lg font-black">Data deleted</h2>
            <div className="mt-4 grid gap-3">
              {deletedItems.map((item) => (
                <p key={item} className="text-sm font-medium leading-7 text-[var(--text-soft)]">{item}</p>
              ))}
            </div>
          </div>

          <div className="card p-5 sm:p-6">
            <h2 className="text-lg font-black">Data that may remain</h2>
            <div className="mt-4 grid gap-3">
              {retainedItems.map((item) => (
                <p key={item} className="text-sm font-medium leading-7 text-[var(--text-soft)]">{item}</p>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
