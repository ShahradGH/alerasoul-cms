/**
 * Edge Middleware Policy Engine (replaces Caddyfile rules for alerasoul.net).
 * Handles:
 *  - Canonical www -> apex 301 redirect
 *  - Silo Endeavours legacy prefix 301 redirects (^/00[1-9]-(.+)$ and ^/idea-\d{1,3}-(.+)$)
 *  - Sensitive WordPress artefact blocking (403)
 *  - Legacy /wp-content/uploads/* serving directly from Cloudflare R2
 */

export interface EdgeR2Object {
  body: ReadableStream | Uint8Array | string | null
  etag?: string
  httpEtag?: string
  httpMetadata?: {
    contentType?: string
    cacheControl?: string
  }
}

export interface EdgeR2Bucket {
  get(key: string): Promise<EdgeR2Object | null>
}

const BLOCKED_WP_PATHS = new Set([
  '/xmlrpc.php',
  '/wp-config.php',
  '/wp-config.php.bak',
  '/readme.html',
  '/license.txt',
])

const SILO_NUMERIC_RE = /^\/00[1-9]-(.+)$/
const SILO_NAMED_RE = /^\/idea-\d{1,3}-(.+)$/i

const EXTENSION_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2',
}

export function guessContentType(pathname: string, explicitType?: string): string {
  if (explicitType) return explicitType
  const dot = pathname.lastIndexOf('.')
  if (dot >= 0) {
    const ext = pathname.slice(dot).toLowerCase()
    if (EXTENSION_MIME[ext]) return EXTENSION_MIME[ext]
  }
  return 'application/octet-stream'
}

export function applySecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers)
  headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('X-Frame-Options', 'SAMEORIGIN')
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export function evaluateEdgeRedirectOrBlock(url: URL): Response | null {
  const hostname = url.hostname.toLowerCase()
  const pathname = url.pathname

  // 1. Canonical www.alerasoul.net -> https://alerasoul.net (301)
  if (hostname === 'www.alerasoul.net') {
    return Response.redirect(`https://alerasoul.net${pathname}${url.search}`, 301)
  }

  // 2. Block sensitive WordPress files (403)
  if (BLOCKED_WP_PATHS.has(pathname.toLowerCase())) {
    return new Response('Forbidden', {
      status: 403,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    })
  }

  // 3. Silo Endeavours regex 301 redirects
  const numMatch = pathname.match(SILO_NUMERIC_RE)
  if (numMatch) {
    const cleanTarget = `/${numMatch[1].replace(/^\/+/, '')}${url.search}`
    return Response.redirect(`${url.origin}${cleanTarget}`, 301)
  }

  const namedMatch = pathname.match(SILO_NAMED_RE)
  if (namedMatch) {
    const cleanTarget = `/${namedMatch[1].replace(/^\/+/, '')}${url.search}`
    return Response.redirect(`${url.origin}${cleanTarget}`, 301)
  }

  return null
}

export async function serveLegacyUploadFromR2(pathname: string, r2?: EdgeR2Bucket): Promise<Response | null> {
  if (!pathname.startsWith('/wp-content/uploads/')) return null
  if (!r2) return null

  const rawKey = pathname.slice(1) // strip leading '/' -> wp-content/uploads/...
  let decodedKey = rawKey
  try {
    decodedKey = decodeURIComponent(rawKey)
  } catch {
    return new Response('Bad Request', { status: 400 })
  }

  // Guard against path traversal
  if (decodedKey.includes('..') || !decodedKey.startsWith('wp-content/uploads/')) {
    return new Response('Forbidden', { status: 403 })
  }

  const obj = await r2.get(decodedKey)
  if (!obj || !obj.body) {
    return new Response('Not Found', { status: 404 })
  }

  const headers = new Headers()
  headers.set('Content-Type', guessContentType(decodedKey, obj.httpMetadata?.contentType))
  headers.set('Cache-Control', obj.httpMetadata?.cacheControl || 'public, max-age=31536000, immutable')
  headers.set('X-Content-Type-Options', 'nosniff')
  const etag = obj.httpEtag || obj.etag
  if (etag) headers.set('ETag', etag)

  return new Response(obj.body as BodyInit, { status: 200, headers })
}

export async function handleEdgeRequest(
  request: Request,
  env?: { R2?: EdgeR2Bucket },
): Promise<Response | null> {
  const url = new URL(request.url)
  const redirectOrBlock = evaluateEdgeRedirectOrBlock(url)
  if (redirectOrBlock) return redirectOrBlock

  if (url.pathname.startsWith('/wp-content/uploads/') && env?.R2) {
    return await serveLegacyUploadFromR2(url.pathname, env.R2)
  }

  return null
}
