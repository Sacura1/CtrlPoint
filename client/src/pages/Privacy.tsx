import { Link } from 'react-router-dom'
import ThemeToggle from '../components/ThemeToggle'

const lastUpdated = 'May 30, 2026'

const sections = [
  {
    title: 'Information We Collect',
    body: [
      'Account information, such as your email address, authentication provider identifiers, and basic profile data returned by Google or GitHub when you choose those sign-in methods.',
      'Content you create or upload, including prompts, generated website code, uploaded files, site names, deployment metadata, and support messages.',
      'Optional configuration data, such as Massa wallet addresses, GitHub repository settings, custom domain records, and API keys. API keys are encrypted before storage and are not shown again after saving.',
      'Usage, device, and diagnostic data, such as request logs, IP-derived security signals, app errors, deployment status, and basic analytics needed to operate and protect CtrlPoint.',
      'Payment and billing records if you buy credits. Payment card details are processed by our payment provider and are not stored by CtrlPoint.',
    ],
  },
  {
    title: 'How We Use Information',
    body: [
      'To provide CtrlPoint features, including AI site generation, uploads, previews, deployments, MNS registration, GitHub deploys, custom domains, credits, and account support.',
      'To authenticate users, prevent abuse, enforce usage limits, debug failures, improve reliability, and protect the service.',
      'To send service-related messages, such as support replies, security notices, billing confirmations, or important product updates.',
    ],
  },
  {
    title: 'Sharing and Service Providers',
    body: [
      'We do not sell your personal information.',
      'We share information only as needed to operate CtrlPoint, including with hosting, database, authentication, AI model, blockchain, analytics, payment, email, and support providers.',
      'When you use optional integrations, we share the minimum data needed with those services. For example, GitHub deploys require repository metadata, AI generation sends prompts and relevant site context to the selected AI provider, and DeWeb deployments publish website assets and MNS data to Massa network infrastructure.',
    ],
  },
  {
    title: 'Security',
    body: [
      'We use HTTPS in transit, access controls, credential encryption where appropriate, and operational monitoring to protect user data.',
      'No internet service can be guaranteed completely secure. Keep your account credentials, API keys, wallet keys, and private keys safe.',
    ],
  },
  {
    title: 'Retention and Deletion',
    body: [
      'We keep account, site, deployment, billing, and support data for as long as needed to provide CtrlPoint, comply with legal obligations, resolve disputes, prevent abuse, and maintain service records.',
      'You can delete draft web-apps in the product. For account or data deletion requests, use the account deletion request page.',
      'Content deployed to decentralized networks or public infrastructure may remain publicly accessible outside CtrlPoint control even if removed from your CtrlPoint account.',
    ],
  },
  {
    title: 'Children',
    body: [
      'CtrlPoint is not directed to children under 13, and we do not knowingly collect personal information from children under 13. If you believe a child provided personal information, contact us so we can take appropriate action.',
    ],
  },
  {
    title: 'Your Choices',
    body: [
      'You can choose not to connect optional integrations such as GitHub, custom domains, API keys, or wallet addresses.',
      'You can access and update account settings inside CtrlPoint. You may request help with data access, correction, or deletion through support.',
    ],
  },
  {
    title: 'Changes',
    body: [
      'We may update this Privacy Policy as CtrlPoint changes. When we make material changes, we will update the date above and, where appropriate, provide additional notice.',
    ],
  },
]

export default function Privacy() {
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
        <div className="max-w-3xl">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--brand-300)]">CtrlPoint</p>
          <h1 className="mt-3 text-4xl font-black tracking-normal sm:text-5xl">Privacy Policy</h1>
          <p className="mt-4 text-sm font-semibold text-[var(--muted)]">Last updated: {lastUpdated}</p>
          <p className="mt-6 text-base leading-8 text-[var(--text-soft)]">
            This Privacy Policy explains how CtrlPoint collects, uses, shares, and protects information when you use the CtrlPoint website,
            API, and mobile app. CtrlPoint helps users generate, edit, upload, and deploy web-apps to Massa DeWeb.
          </p>
        </div>

        <div className="mt-10 grid gap-4">
          {sections.map((section) => (
            <section key={section.title} className="card p-5 sm:p-6">
              <h2 className="text-lg font-black">{section.title}</h2>
              <div className="mt-4 grid gap-3">
                {section.body.map((item) => (
                  <p key={item} className="text-sm font-medium leading-7 text-[var(--text-soft)]">
                    {item}
                  </p>
                ))}
              </div>
            </section>
          ))}
        </div>

        <section className="mt-4 card p-5 sm:p-6">
          <h2 className="text-lg font-black">Contact Us</h2>
          <p className="mt-4 text-sm font-medium leading-7 text-[var(--text-soft)]">
            For privacy questions or data requests, contact CtrlPoint through the support page at{' '}
            <Link to="/support" className="font-black text-[var(--brand-300)] underline underline-offset-4">
              ctrlpoint.dev/support
            </Link>
            .
            {' '}For account deletion requests, use{' '}
            <Link to="/account-deletion" className="font-black text-[var(--brand-300)] underline underline-offset-4">
              ctrlpoint.dev/account-deletion
            </Link>
            .
          </p>
        </section>
      </main>
    </div>
  )
}
