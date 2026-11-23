import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { sendContactDiscordAlert, sendContactNotificationEmail } from '@/lib/email'
import { verifyTurnstileToken } from '@/lib/turnstile'

async function resolveOptionalBindings(): Promise<Partial<CloudflareEnv>> {
  try {
    const cf = await getCloudflareContext({ async: true })
    return (cf?.env as Partial<CloudflareEnv>) || {}
  } catch {
    return {}
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON payload' }, { status: 400 })
  }

  const name = String(body.name || '').trim()
  const email = String(body.email || '').trim()
  const subject = String(body.subject || '').trim()
  const message = String(body.message || '').trim()
  const turnstileToken = String(body.turnstileToken || body['cf-turnstile-response'] || '').trim()

  if (!name || !email || !message || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json(
      { ok: false, error: 'Name, valid email, and message are required.' },
      { status: 400 },
    )
  }

  const cfEnv = await resolveOptionalBindings()
  const secret = (process.env.TURNSTILE_SECRET_KEY || cfEnv.TURNSTILE_SECRET_KEY || '').trim()

  const remoteIp =
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    null

  const verification = await verifyTurnstileToken({
    token: turnstileToken,
    secret,
    remoteIp,
  })

  if (!verification.success) {
    return Response.json(
      {
        ok: false,
        error: 'Cloudflare Turnstile verification failed.',
        errorCodes: verification.errorCodes,
      },
      { status: 403 },
    )
  }

  const submittedAt = new Date().toISOString()
  const resolvedSubject = subject || 'Website Inquiry'

  const payload = await getPayload({ config: configPromise })
  const created = await payload.create({
    collection: 'contact-submissions',
    overrideAccess: true,
    data: {
      name,
      email,
      subject: resolvedSubject,
      message,
      turnstileVerified: true,
      submittedAt,
    },
  })

  const discordWebhookUrl = (process.env.DISCORD_WEBHOOK_OPS_DIGEST || cfEnv.DISCORD_WEBHOOK_OPS_DIGEST || '').trim()
  const resendApiKey = (process.env.RESEND_API_KEY || cfEnv.RESEND_API_KEY || '').trim()
  const contactFromEmail = (process.env.CONTACT_FROM_EMAIL || cfEnv.CONTACT_FROM_EMAIL || '').trim()
  const contactToEmail = (process.env.CONTACT_TO_EMAIL || cfEnv.CONTACT_TO_EMAIL || '').trim()

  const submissionPayload = {
    id: created.id,
    name,
    email,
    subject: resolvedSubject,
    message,
    submittedAt,
  }

  const [discordOutcome, emailOutcome] = await Promise.allSettled([
    sendContactDiscordAlert(submissionPayload, { webhookUrl: discordWebhookUrl }),
    sendContactNotificationEmail(submissionPayload, {
      apiKey: resendApiKey,
      fromEmail: contactFromEmail || undefined,
      toEmail: contactToEmail || undefined,
    }),
  ])

  const discordNotified = discordOutcome.status === 'fulfilled' && discordOutcome.value.sent === true
  const emailNotified = emailOutcome.status === 'fulfilled' && emailOutcome.value.sent === true

  return Response.json(
    {
      ok: true,
      id: created.id,
      turnstileVerified: true,
      notified: {
        discord: discordNotified,
        email: emailNotified,
      },
    },
    { status: 201 },
  )
}
