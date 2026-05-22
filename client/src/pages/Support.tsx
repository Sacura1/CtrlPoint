import { useState } from 'react'
import Header from '../components/Header'
import { support as supportApi } from '../api'
import { useAuth } from '../store/auth'

export default function Support() {
  const { user } = useAuth()
  const [email, setEmail] = useState(user?.email ?? '')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSending(true)
    setMsg(null)
    try {
      await supportApi.createTicket({ email, title, body })
      setTitle('')
      setBody('')
      setMsg({ ok: true, text: 'Support request sent. We will reply by email if we need more details.' })
    } catch (err: any) {
      setMsg({ ok: false, text: err.message })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="min-h-dvh" style={{ background: 'var(--bg)' }}>
      <Header />

      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <div className="mb-8">
          <h1 className="text-2xl font-black" style={{ color: 'var(--text)' }}>Support</h1>
          <p className="mt-1 text-sm leading-6" style={{ color: 'var(--muted)' }}>
            Send an issue, question, or bug report. Include the web-app name or URL if it is about a deployment.
          </p>
        </div>

        <form onSubmit={submit} className="overflow-hidden rounded-2xl"
          style={{ background: 'color-mix(in srgb, var(--panel) 80%, transparent)', border: '1px solid var(--line)' }}>
          <div className="space-y-4 p-5">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>Email</span>
              <input
                className="input w-full"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>Title</span>
              <input
                className="input w-full"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Short summary"
                maxLength={140}
                required
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--muted)' }}>Message</span>
              <textarea
                className="input min-h-40 w-full resize-y py-3"
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder="What happened? What did you expect?"
                required
              />
            </label>

            {msg && (
              <p className="rounded-xl px-3 py-2 text-xs"
                style={{
                  color: msg.ok ? 'var(--success)' : '#f87171',
                  background: msg.ok ? 'rgba(var(--success-rgb),0.08)' : 'rgba(248,113,113,0.08)',
                  border: `1px solid ${msg.ok ? 'rgba(var(--success-rgb),0.18)' : 'rgba(248,113,113,0.18)'}`,
                }}>
                {msg.text}
              </p>
            )}
          </div>

          <div className="flex justify-end px-5 py-4" style={{ borderTop: '1px solid var(--line)' }}>
            <button type="submit" disabled={sending || !email.trim() || !title.trim() || !body.trim()} className="btn-primary px-5 py-2 text-sm">
              {sending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </form>
      </main>
    </div>
  )
}
