/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-ignore Generated during `opennextjs-cloudflare build`
import { default as openNextHandler } from '../.open-next/worker.js'
// @ts-ignore Generated during `opennextjs-cloudflare build`
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from '../.open-next/worker.js'

import { applySecurityHeaders, handleEdgeRequest } from './lib/edge-middleware'
import { promoteScheduledPosts } from './lib/cron-publisher'

function isPublicHtmlCacheCandidate(request: Request): boolean {
  if (request.method !== 'GET') return false
  if (request.headers.has('rsc') || request.headers.has('next-router-prefetch')) return false
  const cookie = request.headers.get('cookie') || ''
  if (cookie.includes('payload-token')) return false

  const url = new URL(request.url)
  if (url.searchParams.has('preview')) return false
  const p = url.pathname.toLowerCase()
  if (p.startsWith('/admin') || p.startsWith('/api') || p.startsWith('/_next') || p.startsWith('/wp-content')) {
    return false
  }
  return true
}

function getDefaultEdgeCache(): Cache | null {
  try {
    if (typeof caches !== 'undefined' && caches && 'default' in caches) {
      return (caches as unknown as { default: Cache }).default
    }
  } catch {
    // Non-Worker test runtime
  }
  return null
}

const workerHandler = {
  async fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContext): Promise<Response> {
    const edgeResp = await handleEdgeRequest(request, { R2: env.R2 })
    if (edgeResp) {
      return applySecurityHeaders(edgeResp)
    }

    const canCache = isPublicHtmlCacheCandidate(request)
    const edgeCache = canCache ? getDefaultEdgeCache() : null
    const cacheKey = canCache ? new Request(request.url, { method: 'GET' }) : null

    if (edgeCache && cacheKey) {
      const cached = await edgeCache.match(cacheKey)
      if (cached) {
        const hitHeaders = new Headers(cached.headers)
        hitHeaders.set('X-Sovereign-Edge-Cache', 'HIT')
        return applySecurityHeaders(
          new Response(cached.body, {
            status: cached.status,
            statusText: cached.statusText,
            headers: hitHeaders,
          }),
        )
      }
    }

    const rawResponse = await openNextHandler.fetch(request, env, ctx)
    const secured = applySecurityHeaders(rawResponse)
    const ct = (secured.headers.get('content-type') || '').toLowerCase()

    if (edgeCache && cacheKey && secured.status === 200 && ct.includes('text/html') && !secured.headers.has('set-cookie')) {
      const headers = new Headers(secured.headers)
      headers.set('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600')
      headers.set('X-Sovereign-Edge-Cache', 'MISS')
      const cacheable = new Response(secured.body, {
        status: secured.status,
        statusText: secured.statusText,
        headers,
      })
      ctx.waitUntil(edgeCache.put(cacheKey, cacheable.clone()))
      return cacheable
    }

    return secured
  },

  async scheduled(_controller: ScheduledController, env: CloudflareEnv, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      promoteScheduledPosts(env.D1).then((res) => {
        if (res.promotedCount > 0) {
          console.log(JSON.stringify({ level: 'info', msg: 'Promoted scheduled posts', ...res }))
        }
      }),
    )
  },
} satisfies ExportedHandler<CloudflareEnv>

export default workerHandler
