import configPromise from '@payload-config'
import type { MetadataRoute } from 'next'
import { getPayload } from 'payload'
import { buildSitemapEntries } from '@/lib/seo'

export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://alerasoul.net').replace(/\/$/, '')

  try {
    const payload = await getPayload({ config: configPromise })
    const [postsRes, pagesRes, catsRes] = await Promise.all([
      payload.find({
        collection: 'posts',
        where: { status: { equals: 'published' } },
        sort: '-publishedAt',
        limit: 1000,
        depth: 0,
      }),
      payload.find({
        collection: 'pages',
        where: { status: { equals: 'published' } },
        limit: 100,
        depth: 0,
      }),
      payload.find({
        collection: 'categories',
        limit: 50,
        depth: 0,
      }),
    ])

    const tagNames: string[] = []
    for (const post of postsRes.docs) {
      if (Array.isArray(post.tags)) {
        for (const item of post.tags) {
          if (item?.tag) tagNames.push(item.tag)
        }
      }
    }

    return buildSitemapEntries({
      posts: postsRes.docs,
      pages: pagesRes.docs,
      categories: catsRes.docs,
      tags: tagNames,
      siteUrl,
    })
  } catch (err) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        msg: 'Sitemap DB query unavailable; returning fallback static entries',
        error: err instanceof Error ? err.message : String(err),
      }),
    )
    return buildSitemapEntries({ siteUrl })
  }
}
