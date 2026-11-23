// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  resendEmailAdapter,
  sendContactDiscordAlert,
  sendContactNotificationEmail,
  sendResendEmail,
} from '@/lib/email'

const mocks = vi.hoisted(() => ({
  getPayloadMock: vi.fn(),
  verifyTurnstileMock: vi.fn(),
  getCloudflareContextMock: vi.fn(),
}))

vi.mock('payload', async (importOriginal) => {
  const actual = await importOriginal<typeof import('payload')>()
  return {
    ...actual,
    getPayload: mocks.getPayloadMock,
  }
})

vi.mock('@payload-config', () => ({ default: Promise.resolve({}) }))

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: mocks.getCloudflareContextMock,
}))

vi.mock('@/lib/turnstile', () => ({
  verifyTurnstileToken: mocks.verifyTurnstileMock,
}))

import { POST as contactPost } from '@/app/api/contact/route'

describe('Email (Resend), Discord Alert & Contact Route Dispatch', () => {
  const origEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.RESEND_API_KEY
    delete process.env.DISCORD_WEBHOOK_OPS_DIGEST
    delete process.env.CONTACT_FROM_EMAIL
    delete process.env.CONTACT_TO_EMAIL
    process.env.TURNSTILE_SECRET_KEY = 'test-turnstile-secret'
    mocks.getCloudflareContextMock.mockRejectedValue(new Error('no cf ctx in unit test'))
  })

  afterEach(() => {
    process.env = { ...origEnv }
    vi.unstubAllGlobals()
  })

  it('skips Resend gracefully when RESEND_API_KEY is unset', async () => {
    const res = await sendResendEmail({
      to: 'admin@alerasoul.net',
      subject: 'Test',
      text: 'Hello',
    })
    expect(res).toEqual({ sent: false, skipped: 'RESEND_API_KEY_UNSET' })
  })

  it('sends Resend contact email with HTML escaping and reply_to when API key is set', async () => {
    let capturedUrl = ''
    let capturedHeaders: Record<string, string> = {}
    let capturedBody: Record<string, unknown> = {}

    const mockFetch: typeof fetch = async (url, init) => {
      capturedUrl = String(url)
      capturedHeaders = (init?.headers || {}) as Record<string, string>
      capturedBody = JSON.parse(String(init?.body || '{}'))
      return new Response(JSON.stringify({ id: 're_123' }), { status: 200 })
    }

    const res = await sendContactNotificationEmail(
      {
        id: 42,
        name: 'Alice <Script>',
        email: 'alice@example.com',
        subject: 'Architecture Review',
        message: 'Hello & welcome <script>alert(1)</script>',
        submittedAt: '2026-11-23T07:00:00.000Z',
      },
      { apiKey: 're_test_key', fetchImpl: mockFetch },
    )

    expect(res).toEqual({ sent: true, id: 're_123' })
    expect(capturedUrl).toBe('https://api.resend.com/emails')
    expect(capturedHeaders.Authorization).toBe('Bearer re_test_key')
    expect(capturedBody.to).toEqual(['admin@alerasoul.net'])
    expect(capturedBody.from).toBe('Shahrad Alerasoul <noreply@alerasoul.net>')
    expect(capturedBody.reply_to).toBe('alice@example.com')
    expect(String(capturedBody.html)).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('sends Discord #ops-digest webhook embed and skips gracefully when unset', async () => {
    const skipped = await sendContactDiscordAlert({
      id: 1,
      name: 'Bob',
      email: 'bob@example.com',
      message: 'Test',
    })
    expect(skipped).toEqual({ sent: false, skipped: 'DISCORD_WEBHOOK_OPS_DIGEST_UNSET' })

    let payload: Record<string, any> = {}
    const mockFetch: typeof fetch = async (_url, init) => {
      payload = JSON.parse(String(init?.body || '{}'))
      return new Response(null, { status: 204 })
    }

    const longMessage = 'A'.repeat(700)
    const sent = await sendContactDiscordAlert(
      {
        id: 77,
        name: 'Bob',
        email: 'bob@example.com',
        subject: 'Advisory Question',
        message: longMessage,
        submittedAt: '2026-11-23T07:00:00.000Z',
      },
      { webhookUrl: 'https://discord.com/api/webhooks/123/abc', fetchImpl: mockFetch },
    )

    expect(sent).toEqual({ sent: true })
    expect(payload.embeds[0].fields.find((f: any) => f.name === 'D1 ID').value).toBe('77')
    const preview = payload.embeds[0].fields.find((f: any) => f.name === 'Message Preview').value
    expect(preview.length).toBeLessThanOrEqual(500)
    expect(preview.endsWith('…')).toBe(true)
  })

  it('configures Payload EmailAdapter to no-op cleanly when RESEND_API_KEY is unset and deliver when set', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const adapter = resendEmailAdapter({ payload: {} as any })
    expect(adapter.name).toBe('resend-edge')
    expect(adapter.defaultFromAddress).toBe('noreply@alerasoul.net')

    const skipRes = await adapter.sendEmail({
      to: 'shahrad@alerasoul.net',
      subject: 'Password Reset',
      text: 'Reset link',
    })
    expect(skipRes).toEqual({ sent: false, skipped: 'RESEND_API_KEY_UNSET' })
    expect(warnSpy).toHaveBeenCalled()
    warnSpy.mockRestore()

    process.env.RESEND_API_KEY = 're_live_mock'
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 're_sys_1' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const okRes = await adapter.sendEmail({
      to: 'shahrad@alerasoul.net',
      subject: 'Password Reset',
      html: '<p>Reset</p>',
    })
    expect(okRes).toEqual({ sent: true, id: 're_sys_1' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('wires Discord and Resend dispatch into POST /api/contact without failing D1 creation on webhook error', async () => {
    mocks.verifyTurnstileMock.mockResolvedValue({ success: true, errorCodes: [] })
    mocks.getPayloadMock.mockResolvedValue({
      create: vi.fn(async () => ({ id: 901 })),
    })

    process.env.DISCORD_WEBHOOK_OPS_DIGEST = 'https://discord.com/api/webhooks/test/hook'
    process.env.RESEND_API_KEY = 're_contact_mock'

    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('discord.com')) {
        return new Response('rate limited', { status: 429 })
      }
      return new Response(JSON.stringify({ id: 're_contact_1' }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const req = new Request('https://alerasoul.net/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test User',
        email: 'user@example.com',
        subject: 'Inquiry',
        message: 'Testing resilient notification dispatch',
        turnstileToken: 'tok_123',
      }),
    })

    const res = await contactPost(req)
    expect(res.status).toBe(201)
    const json = (await res.json()) as {
      ok: boolean
      id: number
      notified: { discord: boolean; email: boolean }
    }
    expect(json.ok).toBe(true)
    expect(json.id).toBe(901)
    expect(json.notified).toEqual({ discord: false, email: true })
  })
})
