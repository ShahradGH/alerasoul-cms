import { describe, it, expect } from 'vitest'
import {
  applySecurityHeaders,
  evaluateEdgeRedirectOrBlock,
  handleEdgeRequest,
  serveLegacyUploadFromR2,
} from '@/lib/edge-middleware'

describe('Edge Middleware (Caddyfile Replacement)', () => {
  it('redirects www.alerasoul.net to apex https://alerasoul.net with 301', () => {
    const res = evaluateEdgeRedirectOrBlock(new URL('https://www.alerasoul.net/about/?ref=nav'))
    expect(res).not.toBeNull()
    expect(res!.status).toBe(301)
    expect(res!.headers.get('location')).toBe('https://alerasoul.net/about/?ref=nav')
  })

  it('redirects Silo numeric prefix ^/0\\d{2}-(.+)$ (001 through 099) with 301', () => {
    const res1 = evaluateEdgeRedirectOrBlock(
      new URL('https://alerasoul.net/001-authority-before-capability-enterprise-agent-identity-graph/'),
    )
    expect(res1).not.toBeNull()
    expect(res1!.status).toBe(301)
    expect(res1!.headers.get('location')).toBe(
      'https://alerasoul.net/authority-before-capability-enterprise-agent-identity-graph/',
    )

    const res12 = evaluateEdgeRedirectOrBlock(
      new URL('https://alerasoul.net/012-sample-redirect?utm_source=linkedin'),
    )
    expect(res12).not.toBeNull()
    expect(res12!.status).toBe(301)
    expect(res12!.headers.get('location')).toBe('https://alerasoul.net/sample-redirect?utm_source=linkedin')

    const res99 = evaluateEdgeRedirectOrBlock(
      new URL('https://alerasoul.net/099-sovereign-control-plane/'),
    )
    expect(res99).not.toBeNull()
    expect(res99!.status).toBe(301)
    expect(res99!.headers.get('location')).toBe('https://alerasoul.net/sovereign-control-plane/')
  })

  it('redirects Silo named prefix ^/idea-\\d{1,3}-(.+)$ with 301', () => {
    const res = evaluateEdgeRedirectOrBlock(
      new URL('https://alerasoul.net/idea-042-autonomous-dr-failover-coworker/'),
    )
    expect(res).not.toBeNull()
    expect(res!.status).toBe(301)
    expect(res!.headers.get('location')).toBe(
      'https://alerasoul.net/autonomous-dr-failover-coworker/',
    )
  })

  it('blocks sensitive WordPress paths with 403', () => {
    for (const p of ['/xmlrpc.php', '/wp-config.php', '/readme.html', '/license.txt']) {
      const res = evaluateEdgeRedirectOrBlock(new URL(`https://alerasoul.net${p}`))
      expect(res?.status).toBe(403)
    }
  })

  it('serves /wp-content/uploads/* directly from R2 with immutable cache headers', async () => {
    const mockR2 = {
      async get(key: string) {
        if (key === 'wp-content/uploads/2023/08/logo.png') {
          return {
            body: new Uint8Array([137, 80, 78, 71]),
            etag: '"abc123"',
          }
        }
        return null
      },
    }
    const okRes = await handleEdgeRequest(
      new URL('https://alerasoul.net/wp-content/uploads/2023/08/logo.png').toString()
        ? new Request('https://alerasoul.net/wp-content/uploads/2023/08/logo.png')
        : new Request('https://alerasoul.net'),
      { R2: mockR2 },
    )
    expect(okRes?.status).toBe(200)
    expect(okRes?.headers.get('content-type')).toBe('image/png')
    expect(okRes?.headers.get('cache-control')).toContain('immutable')

    const missRes = await serveLegacyUploadFromR2('/wp-content/uploads/2023/08/missing.png', mockR2)
    expect(missRes?.status).toBe(404)

    const travRes = await serveLegacyUploadFromR2('/wp-content/uploads/../../etc/passwd', mockR2)
    expect(travRes?.status).toBe(403)
  })

  it('applies HSTS and security hardening headers', () => {
    const res = applySecurityHeaders(new Response('ok'))
    expect(res.headers.get('strict-transport-security')).toContain('max-age=63072000')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN')
  })
})
