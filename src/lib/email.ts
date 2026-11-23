/**
 * Edge-safe notification and email delivery helpers for alerasoul.net.
 * Supports:
 *  - Resend REST API email delivery (gracefully skips when RESEND_API_KEY is unset)
 *  - Discord #ops-digest webhook embed notifications for verified contact submissions
 *  - Payload CMS v3 EmailAdapter implementation for system and password-reset emails
 */

import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { EmailAdapter, SendEmailOptions } from 'payload'

export interface EmailDeliveryResult {
  sent: boolean
  id?: string
  skipped?: string
  error?: string
}

export interface ContactNotificationInput {
  id: number | string
  name: string
  email: string
  subject?: string | null
  message: string
  submittedAt?: string
}

export const DEFAULT_CONTACT_FROM_EMAIL = 'noreply@alerasoul.net'
export const DEFAULT_CONTACT_TO_EMAIL = 'admin@alerasoul.net'

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatAddress(addr: unknown): string {
  if (!addr) return ''
  if (typeof addr === 'string') return addr.trim()
  if (typeof addr === 'object' && 'address' in addr) {
    const typed = addr as { address?: unknown; name?: unknown }
    const email = String(typed.address || '').trim()
    const name = String(typed.name || '').trim()
    if (!email) return ''
    return name ? `${name} <${email}>` : email
  }
  return ''
}

function normalizeAddressList(value: unknown): string[] {
  if (!value) return []
  const items = Array.isArray(value) ? value : [value]
  return items.map(formatAddress).filter(Boolean)
}

function truncateText(text: string, maxLength: number): string {
  const clean = String(text || '').trim()
  if (clean.length <= maxLength) return clean
  return `${clean.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

async function resolveRuntimeEnvVar(key: keyof CloudflareEnv): Promise<string> {
  const fromProcess = process.env[key]
  if (typeof fromProcess === 'string' && fromProcess.trim()) {
    return fromProcess.trim()
  }
  try {
    const cf = await getCloudflareContext({ async: true })
    const val = cf?.env?.[key]
    return typeof val === 'string' ? val.trim() : ''
  } catch {
    return ''
  }
}

export async function sendResendEmail({
  to,
  subject,
  html,
  text,
  from,
  replyTo,
  cc,
  bcc,
  apiKey,
  fetchImpl = fetch,
}: {
  to: string | string[]
  subject: string
  html?: string
  text?: string
  from?: string
  replyTo?: string | string[]
  cc?: string | string[]
  bcc?: string | string[]
  apiKey?: string | null
  fetchImpl?: typeof fetch
}): Promise<EmailDeliveryResult> {
  const resolvedKey = (apiKey ?? process.env.RESEND_API_KEY ?? '').trim()
  if (!resolvedKey) {
    return { sent: false, skipped: 'RESEND_API_KEY_UNSET' }
  }

  const toList = normalizeAddressList(to)
  if (toList.length === 0) {
    return { sent: false, error: 'Missing recipient address' }
  }

  const defaultFrom = (process.env.CONTACT_FROM_EMAIL || DEFAULT_CONTACT_FROM_EMAIL).trim()
  const resolvedFrom = (from || defaultFrom).trim()
  const formattedFrom = resolvedFrom.includes('<')
    ? resolvedFrom
    : `Shahrad Alerasoul <${resolvedFrom}>`

  const body: Record<string, unknown> = {
    from: formattedFrom,
    to: toList,
    subject: subject || 'Notification from alerasoul.net',
  }

  if (html) body.html = html
  if (text) body.text = text
  if (!html && !text) body.text = subject || ''

  const replyList = normalizeAddressList(replyTo)
  if (replyList.length === 1) body.reply_to = replyList[0]
  else if (replyList.length > 1) body.reply_to = replyList

  const ccList = normalizeAddressList(cc)
  if (ccList.length > 0) body.cc = ccList

  const bccList = normalizeAddressList(bcc)
  if (bccList.length > 0) body.bcc = bccList

  try {
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resolvedKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    const rawText = await res.text()
    let parsed: { id?: string; message?: string; name?: string } = {}
    try {
      parsed = rawText ? (JSON.parse(rawText) as { id?: string; message?: string; name?: string }) : {}
    } catch {
      parsed = {}
    }

    if (!res.ok) {
      const errorMsg = parsed.message || `Resend HTTP ${res.status}`
      console.error(JSON.stringify({ level: 'error', msg: 'Resend email delivery failed', status: res.status, error: errorMsg }))
      return { sent: false, error: errorMsg }
    }

    return { sent: true, id: parsed.id }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Resend network error'
    console.error(JSON.stringify({ level: 'error', msg: 'Resend email exception', error: errorMsg }))
    return { sent: false, error: errorMsg }
  }
}

export async function sendContactNotificationEmail(
  submission: ContactNotificationInput,
  options?: {
    apiKey?: string | null
    fromEmail?: string | null
    toEmail?: string | null
    fetchImpl?: typeof fetch
  },
): Promise<EmailDeliveryResult> {
  const fromEmail = (options?.fromEmail || process.env.CONTACT_FROM_EMAIL || DEFAULT_CONTACT_FROM_EMAIL).trim()
  const toEmail = (options?.toEmail || process.env.CONTACT_TO_EMAIL || DEFAULT_CONTACT_TO_EMAIL).trim()
  const subjectText = (submission.subject || 'Website Inquiry').trim()
  const submittedIso = submission.submittedAt || new Date().toISOString()

  const html = [
    `<div style="font-family:Inter,-apple-system,Segoe UI,sans-serif;max-width:640px;margin:0 auto;padding:20px;background:#0a1128;color:#f1f5f9;border-radius:10px;border:1px solid #1e293b;">`,
    `<h2 style="margin:0 0 12px 0;color:#38bdf8;">New Verified Contact Submission</h2>`,
    `<p style="margin:0 0 16px 0;color:#94a3b8;font-size:14px;">D1 Record ID: <strong>${escapeHtml(String(submission.id))}</strong> &bull; ${escapeHtml(submittedIso)}</p>`,
    `<table style="width:100%;border-collapse:collapse;margin-bottom:16px;">`,
    `<tr><td style="padding:6px 0;color:#94a3b8;width:100px;">Name</td><td style="padding:6px 0;color:#f8fafc;"><strong>${escapeHtml(submission.name)}</strong></td></tr>`,
    `<tr><td style="padding:6px 0;color:#94a3b8;">Email</td><td style="padding:6px 0;"><a href="mailto:${escapeHtml(submission.email)}" style="color:#38bdf8;">${escapeHtml(submission.email)}</a></td></tr>`,
    `<tr><td style="padding:6px 0;color:#94a3b8;">Subject</td><td style="padding:6px 0;color:#f8fafc;">${escapeHtml(subjectText)}</td></tr>`,
    `</table>`,
    `<div style="background:#0f172a;border-left:4px solid #00a8e8;padding:14px 16px;border-radius:6px;white-space:pre-wrap;color:#e2e8f0;line-height:1.6;">${escapeHtml(submission.message)}</div>`,
    `</div>`,
  ].join('')

  const text = [
    'New Verified Contact Submission (alerasoul.net)',
    `D1 Record ID: ${submission.id}`,
    `Submitted At: ${submittedIso}`,
    `Name: ${submission.name}`,
    `Email: ${submission.email}`,
    `Subject: ${subjectText}`,
    '',
    submission.message,
  ].join('\n')

  return sendResendEmail({
    to: toEmail,
    from: fromEmail,
    replyTo: submission.email,
    subject: `[alerasoul.net] ${subjectText}`,
    html,
    text,
    apiKey: options?.apiKey,
    fetchImpl: options?.fetchImpl,
  })
}

export async function sendContactDiscordAlert(
  submission: ContactNotificationInput,
  options?: {
    webhookUrl?: string | null
    fetchImpl?: typeof fetch
  },
): Promise<EmailDeliveryResult> {
  const webhookUrl = (options?.webhookUrl ?? process.env.DISCORD_WEBHOOK_OPS_DIGEST ?? '').trim()
  if (!webhookUrl) {
    return { sent: false, skipped: 'DISCORD_WEBHOOK_OPS_DIGEST_UNSET' }
  }

  const fetchImpl = options?.fetchImpl ?? fetch
  const subjectText = truncateText(submission.subject || 'Website Inquiry', 200)
  const preview = truncateText(submission.message, 500)
  const timestamp = submission.submittedAt || new Date().toISOString()

  const payload = {
    username: 'alerasoul.net Contact',
    embeds: [
      {
        title: 'New Verified Contact Submission',
        color: 0x00a8e8,
        fields: [
          { name: 'Name', value: truncateText(submission.name, 120) || 'Unknown', inline: true },
          { name: 'Email', value: truncateText(submission.email, 120) || 'Unknown', inline: true },
          { name: 'D1 ID', value: String(submission.id), inline: true },
          { name: 'Subject', value: subjectText || 'Website Inquiry', inline: false },
          { name: 'Message Preview', value: preview || '(empty)', inline: false },
        ],
        footer: { text: 'alerasoul.net • Turnstile Verified' },
        timestamp,
      },
    ],
  }

  try {
    const res = await fetchImpl(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const errorText = `Discord webhook HTTP ${res.status}`
      console.error(JSON.stringify({ level: 'error', msg: 'Discord contact alert failed', status: res.status }))
      return { sent: false, error: errorText }
    }

    return { sent: true }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Discord webhook network error'
    console.error(JSON.stringify({ level: 'error', msg: 'Discord contact alert exception', error: errorMsg }))
    return { sent: false, error: errorMsg }
  }
}

export const resendEmailAdapter: EmailAdapter<EmailDeliveryResult> = () => {
  const defaultFromAddress =
    (typeof process !== 'undefined' && process.env?.CONTACT_FROM_EMAIL?.trim()) ||
    DEFAULT_CONTACT_FROM_EMAIL
  const defaultFromName = 'Shahrad Alerasoul'

  return {
    name: 'resend-edge',
    defaultFromAddress,
    defaultFromName,
    sendEmail: async (message: SendEmailOptions): Promise<EmailDeliveryResult> => {
      const apiKey = await resolveRuntimeEnvVar('RESEND_API_KEY')
      const fromEnv = await resolveRuntimeEnvVar('CONTACT_FROM_EMAIL')
      const toList = normalizeAddressList(message.to)

      if (!apiKey) {
        console.warn(
          JSON.stringify({
            level: 'warn',
            msg: 'RESEND_API_KEY unset; skipping Payload system email',
            to: toList,
            subject: message.subject || '',
          }),
        )
        return { sent: false, skipped: 'RESEND_API_KEY_UNSET' }
      }

      const explicitFrom = formatAddress(message.from)
      const resolvedFrom = explicitFrom || (fromEnv ? fromEnv : `${defaultFromName} <${defaultFromAddress}>`)

      return sendResendEmail({
        to: toList,
        from: resolvedFrom,
        subject: message.subject || 'Notification from alerasoul.net',
        html: typeof message.html === 'string' ? message.html : undefined,
        text: typeof message.text === 'string' ? message.text : undefined,
        replyTo: normalizeAddressList(message.replyTo),
        cc: normalizeAddressList(message.cc),
        bcc: normalizeAddressList(message.bcc),
        apiKey,
      })
    },
  }
}
