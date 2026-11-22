import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { buildRssFeedXml } from '@/lib/rss'
import { renderLexicalToHtml } from '@/lib/lexical-render'
import type { Category } from '@/payload-types'

export const dynamic = 'force-dynamic'

export async function GET() {
  const payload = await getPayload({ config: configPromise })
  const result = await payload.find({
    collection: 'posts',
    where: {
      status: {
        equals: 'published',
      },
    },
    sort: '-publishedAt',
    limit: 20,
    depth: 1,
  })

  const items = result.docs.map((post) => {
    const cats = Array.isArray(post.categories)
      ? post.categories
          .filter((c): c is Category => typeof c === 'object' && c !== null)
          .map((c) => ({ name: c.name }))
      : []
    const html = post.legacyHtml || renderLexicalToHtml(post.content)
    return {
      title: post.title,
      slug: post.slug,
      publishedAt: post.publishedAt || post.createdAt,
      excerpt: post.excerpt || '',
      html,
      categories: cats,
    }
  })

  const xml = buildRssFeedXml({
    posts: items,
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'https://alerasoul.net',
  })

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  })
}
