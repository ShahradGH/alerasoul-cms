/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-ignore Generated during `opennextjs-cloudflare build`
import { default as openNextHandler } from '../.open-next/worker.js'
// @ts-ignore Generated during `opennextjs-cloudflare build`
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from '../.open-next/worker.js'

import { applySecurityHeaders, handleEdgeRequest } from './lib/edge-middleware'
import { promoteScheduledPosts } from './lib/cron-publisher'
import {
  buildEdgeCacheKey,
  CANONICAL_CATEGORY_SLUGS,
  collectPostPurgePaths,
  getDefaultEdgeCache,
  isCacheableEdgeContentType,
  isPublicEdgeCacheCandidate,
  purgeEdgeCachePaths,
} from './lib/edge-cache'
import { slugifyTag } from './lib/tags'

async function collectScheduledPurgePaths(db: D1Database, promotedSlugs: string[]): Promise<string[]> {
  const catSlugs = new Set<string>(CANONICAL_CATEGORY_SLUGS)
  const tagSlugs = new Set<string>()

  try {
    if (promotedSlugs.length > 0) {
      const placeholders = promotedSlugs.map((_, idx) => `?${idx + 1}`).join(', ')
      const catRows = await db
        .prepare(
          `SELECT DISTINCT c.slug FROM categories c
           INNER JOIN posts_rels pr ON pr.categories_id = c.id
           INNER JOIN posts p ON p.id = pr.parent_id
           WHERE p.slug IN (${placeholders})`,
        )
        .bind(...promotedSlugs)
        .all<{ slug: string }>()
      for (const row of catRows?.results ?? []) {
        if (row.slug) catSlugs.add(row.slug)
      }

      const tagRows = await db
        .prepare(
          `SELECT DISTINCT pt.tag FROM posts_tags pt
           INNER JOIN posts p ON p.id = pt._parent_id
           WHERE p.slug IN (${placeholders})`,
        )
        .bind(...promotedSlugs)
        .all<{ tag: string }>()
      for (const row of tagRows?.results ?? []) {
        const s = slugifyTag(row.tag)
        if (s) tagSlugs.add(s)
      }
    }
  } catch (err) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        msg: 'Failed collecting promoted post taxonomy slugs for cache purge',
        error: err instanceof Error ? err.message : String(err),
      }),
    )
  }

  return collectPostPurgePaths(
    promotedSlugs.map((slug) => ({ slug })),
    Array.from(catSlugs),
    Array.from(tagSlugs),
  )
}

const workerHandler = {
  async fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContext): Promise<Response> {
    const edgeResp = await handleEdgeRequest(request, { R2: env.R2 })
    if (edgeResp) {
      return applySecurityHeaders(edgeResp)
    }

    const canCache = isPublicEdgeCacheCandidate(request)
    const edgeCache = canCache ? getDefaultEdgeCache() : null
    const cacheKey = canCache ? buildEdgeCacheKey(request.url) : null

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
    const ct = secured.headers.get('content-type') || ''
    const isCacheableRedirect = secured.status === 308 && !secured.headers.has('set-cookie')
    const isCacheableOk =
      secured.status === 200 &&
      isCacheableEdgeContentType(ct) &&
      !secured.headers.has('set-cookie')

    if (edgeCache && cacheKey && (isCacheableOk || isCacheableRedirect)) {
      const headers = new Headers(secured.headers)
      if (isCacheableRedirect) {
        headers.set('Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400')
      } else {
        const currentCc = (headers.get('Cache-Control') || '').toLowerCase()
        if (!currentCc || currentCc.includes('private') || currentCc.includes('no-store') || ct.toLowerCase().includes('text/html')) {
          headers.set('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600')
        }
      }
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
      promoteScheduledPosts(env.D1).then(async (res) => {
        if (res.promotedCount > 0) {
          const paths = await collectScheduledPurgePaths(env.D1, res.promotedSlugs)
          const purgeStats = await purgeEdgeCachePaths(paths, {
            siteUrl: env.NEXT_PUBLIC_SITE_URL,
          })
          console.log(
            JSON.stringify({
              level: 'info',
              msg: 'Promoted scheduled posts and purged edge cache',
              ...res,
              ...purgeStats,
            }),
          )
        }
      }),
    )
  },
} satisfies ExportedHandler<CloudflareEnv>

export default workerHandler
