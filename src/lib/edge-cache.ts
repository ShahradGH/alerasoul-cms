/**
 * Cloudflare Workers edge cache helper (`caches.default`).
 * Handles:
 *  - Normalising cache keys by stripping marketing/tracking query parameters
 *    (`utm_*`, `fbclid`, `gclid`, `ref`, `mc_cid`, `mc_eid`, `li_fat_id`, `_hsenc`)
 *  - Deterministic cache invalidation for `/`, `/feed`, `/feed/`, `/sitemap.xml`,
 *    `/<slug>/`, `/category/<cat>/`, and `/tag/<tag>/`
 */

import { slugifyTag } from './tags'

const TRACKING_QUERY_PARAMS = new Set([
  'fbclid',
  'gclid',
  'ref',
  'mc_cid',
  'mc_eid',
  'li_fat_id',
  '_hsenc',
])

export const CANONICAL_CATEGORY_SLUGS = [
  'enterprise-architecture',
  'personal',
  'psychology',
] as const

export interface CacheablePostDoc {
  slug?: string | null
  categories?: Array<{ slug?: string | null } | number | string> | null
  tags?: Array<{ tag?: string | null } | null> | null
}

export interface CacheablePageDoc {
  slug?: string | null
}

export function isTrackingQueryParam(name: string): boolean {
  const lower = String(name || '').trim().toLowerCase()
  return lower.startsWith('utm_') || TRACKING_QUERY_PARAMS.has(lower)
}

function extractUrlString(input: Request | string | URL | { url: string }): string {
  if (typeof input === 'string') return input
  if (input && typeof input === 'object') {
    if ('url' in input && typeof input.url === 'string') {
      return input.url
    }
    if ('href' in input && typeof (input as URL).href === 'string') {
      return (input as URL).href
    }
  }
  return String(input)
}

export function normalizeCacheUrl(rawUrl: Request | string | URL | { url: string }): string {
  const url = new URL(extractUrlString(rawUrl))
  for (const key of Array.from(url.searchParams.keys())) {
    if (isTrackingQueryParam(key)) {
      url.searchParams.delete(key)
    }
  }
  url.searchParams.sort()
  return url.toString()
}

export function buildEdgeCacheKey(requestOrUrl: Request | string | URL | { url: string }): Request {
  return new Request(normalizeCacheUrl(requestOrUrl), { method: 'GET' })
}

export function isPublicEdgeCacheCandidate(request: Request): boolean {
  if (request.method !== 'GET') return false
  if (request.headers.has('rsc') || request.headers.has('next-router-prefetch')) return false
  const cookie = request.headers.get('cookie') || ''
  if (cookie.includes('payload-token')) return false

  const url = new URL(request.url)
  if (url.searchParams.has('preview') || url.searchParams.has('s')) return false
  const p = url.pathname.toLowerCase()
  if (p.startsWith('/admin') || p.startsWith('/api') || p.startsWith('/_next') || p.startsWith('/wp-content')) {
    return false
  }
  return true
}

export function isCacheableEdgeContentType(contentType: string): boolean {
  const ct = String(contentType || '').toLowerCase()
  return (
    ct.includes('text/html') ||
    ct.includes('application/rss+xml') ||
    ct.includes('application/xml') ||
    ct.includes('text/xml')
  )
}

export function getDefaultEdgeCache(): Cache | null {
  try {
    if (typeof caches !== 'undefined' && caches && 'default' in caches) {
      return (caches as unknown as { default: Cache }).default
    }
  } catch {
    // Non-Worker runtime (Vitest / Node CLI)
  }
  return null
}

function addSlashVariants(set: Set<string>, basePath: string): void {
  const clean = `/${String(basePath || '').replace(/^\/+|\/+$/g, '')}`
  if (clean === '/') {
    set.add('/')
    return
  }
  set.add(`${clean}/`)
  set.add(clean)
}

export function collectPostPurgePaths(
  docs: Array<CacheablePostDoc | null | undefined>,
  extraCategorySlugs: string[] = [],
  extraTagSlugs: string[] = [],
): string[] {
  const paths = new Set<string>(['/', '/feed', '/feed/', '/sitemap.xml'])

  for (const catSlug of extraCategorySlugs) {
    if (catSlug) addSlashVariants(paths, `category/${catSlug}`)
  }

  for (const tagSlug of extraTagSlugs) {
    if (tagSlug) addSlashVariants(paths, `tag/${tagSlug}`)
  }

  for (const doc of docs) {
    if (!doc) continue
    if (doc.slug) {
      addSlashVariants(paths, doc.slug)
    }
    if (Array.isArray(doc.categories)) {
      for (const cat of doc.categories) {
        if (cat && typeof cat === 'object' && cat.slug) {
          addSlashVariants(paths, `category/${cat.slug}`)
        }
      }
    }
    if (Array.isArray(doc.tags)) {
      for (const item of doc.tags) {
        const tagSlug = item?.tag ? slugifyTag(item.tag) : ''
        if (tagSlug) {
          addSlashVariants(paths, `tag/${tagSlug}`)
        }
      }
    }
  }

  return Array.from(paths)
}

export function collectPagePurgePaths(docs: Array<CacheablePageDoc | null | undefined>): string[] {
  const paths = new Set<string>(['/', '/sitemap.xml'])
  for (const doc of docs) {
    if (doc?.slug) {
      addSlashVariants(paths, doc.slug)
    }
  }
  return Array.from(paths)
}

export async function purgeEdgeCachePaths(
  paths: string[],
  options?: {
    siteUrl?: string
    cache?: Cache | null
  },
): Promise<{ attempted: number; purged: number }> {
  const edgeCache = options?.cache !== undefined ? options.cache : getDefaultEdgeCache()
  if (!edgeCache || paths.length === 0) {
    return { attempted: 0, purged: 0 }
  }

  const siteUrl = (options?.siteUrl || process.env.NEXT_PUBLIC_SITE_URL || 'https://alerasoul.net').replace(/\/$/, '')
  const uniquePaths = Array.from(new Set(paths))

  const results = await Promise.allSettled(
    uniquePaths.map((p) => {
      const targetUrl = new URL(p.startsWith('/') ? p : `/${p}`, siteUrl)
      return edgeCache.delete(buildEdgeCacheKey(targetUrl))
    }),
  )

  let purged = 0
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      purged++
    }
  }

  return { attempted: uniquePaths.length, purged }
}
