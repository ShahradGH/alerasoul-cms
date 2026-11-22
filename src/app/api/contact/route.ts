import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { getCloudflareContext } from '@opennextjs/cloudflare'
import { verifyTurnstileToken } from '@/lib/turnstile'

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

  let secret = process.env.TURNSTILE_SECRET_KEY || ''
  if (!secret) {
    try {
      const cf = await getCloudflareContext({ async: true })
      secret = cf?.env?.TURNSTILE_SECRET_KEY || ''
    } catch {
      secret = ''
    }
  }

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

  const payload = await getPayload({ config: configPromise })
  const created = await payload.create({
    collection: 'contact-submissions',
    overrideAccess: true,
    data: {
      name,
      email,
      subject: subject || 'Website Inquiry',
      message,
      turnstileVerified: true,
      submittedAt: new Date().toISOString(),
    },
  })

  return Response.json(
    {
      ok: true,
      id: created.id,
      turnstileVerified: true,
    },
    { status: 201 },
  )
}
