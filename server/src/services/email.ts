import { Resend } from 'resend'
import { cfg } from '../config'
import { AppError } from '../middleware/errorHandler'

let resend: Resend | null = null

function client() {
  if (!cfg.resendApiKey) return null
  if (!resend) resend = new Resend(cfg.resendApiKey)
  return resend
}

export async function sendOtpEmail(email: string, code: string, purpose: 'register' | 'reset') {
  const subject = purpose === 'register' ? 'Your CtrlPoint sign-up code' : 'Reset your CtrlPoint password'
  const action = purpose === 'register' ? 'finish creating your CtrlPoint account' : 'reset your CtrlPoint password'
  const html = `
    <div style="font-family:Inter,Arial,sans-serif;background:#030404;color:#f4f0e8;padding:28px">
      <div style="max-width:440px;margin:0 auto;background:#0a0c0b;border:1px solid rgba(244,240,232,.12);border-radius:14px;padding:24px">
        <h1 style="font-size:22px;margin:0 0 10px">CtrlPoint verification</h1>
        <p style="color:#d9d3c8;line-height:1.6;margin:0 0 18px">Use this code to ${action}. It expires in 10 minutes.</p>
        <div style="font-size:34px;letter-spacing:8px;font-weight:900;color:#67e8a4;background:rgba(103,232,164,.08);border-radius:12px;padding:16px;text-align:center">${code}</div>
        <p style="color:#9f988d;font-size:13px;line-height:1.6;margin:18px 0 0">If you did not request this, you can ignore this email.</p>
      </div>
    </div>
  `

  const api = client()
  if (!api) {
    if (cfg.nodeEnv !== 'production') console.log(`[auth:${purpose}] OTP for ${email}: ${code}`)
    return
  }

  try {
    const { error } = await api.emails.send({
      from: cfg.resendFromEmail,
      to: [email],
      subject,
      html,
    })
    if (error) throw new Error(error.message)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not send verification email.'
    const setupError = /domain is not verified|verify your domain|testing emails/i.test(message)

    if (cfg.nodeEnv !== 'production' && setupError) {
      console.warn(`[auth:${purpose}] Email delivery skipped: ${message}`)
      console.log(`[auth:${purpose}] OTP for ${email}: ${code}`)
      return
    }

    if (setupError) {
      throw new AppError(
        503,
        'Email verification is not ready yet. The sending domain must be verified in Resend.',
      )
    }

    throw new AppError(502, message || 'Could not send verification email.')
  }
}
