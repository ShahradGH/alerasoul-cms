import { describe, it, expect } from 'vitest'
import {
  assertZeroLeakContent,
  computeReadingMetrics,
  findZeroLeakViolations,
  hasSiloSequencePrefix,
  sanitizePublicSlug,
} from '@/lib/zero-leak'

describe('Zero-Leak & Silo Endeavours Policy Guard', () => {
  it('strips Silo sequence prefixes when sanitising public slugs', () => {
    expect(sanitizePublicSlug('001-authority-before-capability')).toBe('authority-before-capability')
    expect(sanitizePublicSlug('idea-042-autonomous-dr-failover')).toBe('autonomous-dr-failover')
    expect(hasSiloSequencePrefix('001-test')).toBe(true)
    expect(hasSiloSequencePrefix('idea-12-test')).toBe(true)
    expect(hasSiloSequencePrefix('autonomous-dr-failover')).toBe(false)
  })

  it('vetoes Silo prefixes in slugs and non-documentation public IPv4 literals', () => {
    expect(() =>
      assertZeroLeakContent({ slug: '003-test-article' }),
    ).toThrow(/Zero-Leak veto/i)

    expect(findZeroLeakViolations('Origin host 203.0.113.45 and RFC1918 172.20.16.5')).toEqual([])
    expect(findZeroLeakViolations('Azure WireServer 168.63.129.16 and 172.20.16.0/20')).toEqual([])
    expect(findZeroLeakViolations('Leaked public origin 45.83.221.19 detected')).toEqual([
      'disallowed_public_ip:45.83.221.19',
    ])
  })

  it('computes reading metrics accurately from HTML', () => {
    const words = Array.from({ length: 440 }, () => 'architecture').join(' ')
    const metrics = computeReadingMetrics(`<p>${words}</p>`)
    expect(metrics.wordCount).toBe(440)
    expect(metrics.readingTimeMinutes).toBe(2)
  })
})
