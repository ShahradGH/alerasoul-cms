import { describe, it, expect } from 'vitest'
import { verifyTurnstileToken } from '@/lib/turnstile'

describe('Cloudflare Turnstile Server-Side Verification', () => {
  it('fails closed when token or secret is missing', async () => {
    const noSecret = await verifyTurnstileToken({ token: 'tok', secret: '' })
    expect(noSecret.success).toBe(false)
    expect(noSecret.errorCodes).toContain('missing-input-secret')

    const noToken = await verifyTurnstileToken({ token: '', secret: 'sec' })
    expect(noToken.success).toBe(false)
    expect(noToken.errorCodes).toContain('missing-input-response')
  })

  it('rejects invalid token from Cloudflare siteverify', async () => {
    const mockFetch: typeof fetch = async () =>
      new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }), {
        status: 200,
      })
    const res = await verifyTurnstileToken({
      token: 'bad-token',
      secret: 'test-secret',
      fetchImpl: mockFetch,
    })
    expect(res.success).toBe(false)
    expect(res.errorCodes).toEqual(['invalid-input-response'])
  })

  it('approves valid token and forwards remoteip', async () => {
    let capturedBody = ''
    const mockFetch: typeof fetch = async (_url, init) => {
      capturedBody = String(init?.body || '')
      return new Response(JSON.stringify({ success: true }), { status: 200 })
    }
    const res = await verifyTurnstileToken({
      token: 'valid-token',
      secret: 'test-secret',
      remoteIp: '198.51.100.10',
      fetchImpl: mockFetch,
    })
    expect(res.success).toBe(true)
    expect(capturedBody).toContain('secret=test-secret')
    expect(capturedBody).toContain('response=valid-token')
    expect(capturedBody).toContain('remoteip=198.51.100.10')
  })
})
