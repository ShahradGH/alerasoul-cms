/**
 * Zero-Leak & Silo Endeavours sanitisation helpers.
 * Ensures public articles, slugs, and metadata contain no non-RFC5737 public
 * origin IPv4 addresses, Silo sequence prefixes, or runtime-blocked keywords.
 */

const SILO_SLUG_PREFIX_RE = /^(?:0\d{2}|idea-\d{1,3})-/i
const IPV4_RE = /\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\b/g

function isAllowedDocumentationOrPrivateIp(a: number, b: number, c: number, d: number): boolean {
  if (a > 255 || b > 255 || c > 255 || d > 255) return true // not a valid IPv4
  if (a === 10) return true // RFC 1918
  if (a === 172 && b >= 16 && b <= 31) return true // RFC 1918
  if (a === 192 && b === 168) return true // RFC 1918
  if (a === 192 && b === 0 && c === 2) return true // RFC 5737 TEST-NET-1
  if (a === 198 && b === 51 && c === 100) return true // RFC 5737 TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true // RFC 5737 TEST-NET-3
  if (a === 100 && b >= 64 && b <= 127) return true // RFC 6598 CGNAT
  if (a === 127 || a === 0 || a === 169 && b === 254) return true // loopback / unspecified / link-local
  if (a === 8 && b === 8 && c === 8 && (d === 8 || d === 4)) return true // public DNS fixture
  if (a === 1 && b === 1 && c === 1 && d === 1) return true // public DNS fixture
  if (a === 168 && b === 63 && c === 129 && d === 16) return true // Azure WireServer documented constant
  return false
}

function getDynamicBlockRegexes(): RegExp[] {
  const raw = process.env.ZERO_LEAK_BLOCKLIST || ''
  if (!raw.trim()) return []
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length >= 4)
    .map((pattern) => new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'))
}

export function sanitizePublicSlug(raw: string): string {
  const cleaned = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(SILO_SLUG_PREFIX_RE, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
  return cleaned || 'article'
}

export function hasSiloSequencePrefix(slug: string): boolean {
  return SILO_SLUG_PREFIX_RE.test(String(slug || '').trim())
}

export function findZeroLeakViolations(text: string): string[] {
  if (!text || typeof text !== 'string') return []
  const violations: string[] = []

  for (const match of text.matchAll(IPV4_RE)) {
    const a = Number(match[1])
    const b = Number(match[2])
    const c = Number(match[3])
    const d = Number(match[4])
    // Skip version numbers preceded by 'v' or common software version patterns when obvious, check real IPs
    if (!isAllowedDocumentationOrPrivateIp(a, b, c, d)) {
      violations.push(`disallowed_public_ip:${match[0]}`)
    }
  }

  for (const re of getDynamicBlockRegexes()) {
    if (re.test(text)) {
      violations.push(`blocked_pattern_match`)
    }
  }

  return violations
}

export function assertZeroLeakContent(fields: Record<string, string | undefined | null>): void {
  for (const [label, value] of Object.entries(fields)) {
    if (!value) continue
    if (label === 'slug' && hasSiloSequencePrefix(value)) {
      throw new Error(`Zero-Leak veto: Silo sequence prefix prohibited in public slug "${value}".`)
    }
    const violations = findZeroLeakViolations(value)
    if (violations.length > 0) {
      throw new Error(`Zero-Leak veto in "${label}": ${violations.join(', ')}`)
    }
  }
}

export function computeReadingMetrics(htmlOrText: string): { wordCount: number; readingTimeMinutes: number } {
  const plain = String(htmlOrText || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const wordCount = plain ? plain.split(' ').length : 0
  const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 220))
  return { wordCount, readingTimeMinutes }
}
