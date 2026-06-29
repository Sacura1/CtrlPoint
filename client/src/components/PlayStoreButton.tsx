const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=dev.ctrlpoint.app'

export default function PlayStoreButton({ className = '' }: { className?: string }) {
  return (
    <a
      href={PLAY_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`group inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left transition hover:-translate-y-0.5 hover:bg-white/[0.08] hover:shadow-lg hover:shadow-black/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50 ${className}`}
      aria-label="Download CtrlPoint on Google Play"
    >
      <GooglePlayIcon />
      <span className="leading-none">
        <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--muted)]">
          Get it on
        </span>
        <span className="mt-1 block text-sm font-black text-[var(--text)]">
          Google Play
        </span>
      </span>
    </a>
  )
}

function GooglePlayIcon() {
  return (
    <svg width="30" height="30" viewBox="0 0 512 512" fill="none" aria-hidden="true" className="shrink-0">
      <path d="M61.2 31.9c-8.2 4.4-13.7 13.2-13.7 24.7v398.8c0 11.5 5.5 20.3 13.7 24.7l223.2-224.1L61.2 31.9Z" fill="#00D084" />
      <path d="m361.3 178.7-76.9 77.3 77 77.3 93.5-53.1c28.8-16.3 28.8-32.1 0-48.5l-93.6-53Z" fill="#FFD34E" />
      <path d="M61.2 31.9 284.4 256l76.9-77.3L93.3 26.5c-12.2-6.9-23.3-5.6-32.1 5.4Z" fill="#35A8FF" />
      <path d="M61.2 480.1c8.8 11 19.9 12.3 32.1 5.4l268.1-152.2-77-77.3L61.2 480.1Z" fill="#FF4B55" />
    </svg>
  )
}
