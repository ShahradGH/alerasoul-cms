/**
 * Pure SEO builders for `/sitemap.xml` and `/robots.txt` so routes and unit tests share
 * deterministic canonical URL formatting without hard-coding DB runtime dependencies.
 */

import type { MetadataRoute } from 'next'
import { slugifyTag } from './tags'

export interface SitemapPostLike {
  slug?: string | null
  updatedAt?: string | null
  publishedAt?: string | null
}

export interface SitemapPageLike {
  slug?: string | null
  updatedAt?: string | null
}

export interface SitemapCategoryLike {
  slug?: string | null
  updatedAt?: string | null
}

function parseSafeDate(raw: string | null | undefined): Date | undefined {
  if (!raw) return undefined
  const ms = Date.parse(raw)
  return Number.isNaN(ms) ? undefined : new Date(ms)
}

export function buildSitemapEntries({
  posts = [],
  pages = [],
  categories = [],
  tags = [],
  siteUrl = 'https://alerasoul.net',
}: {
  posts?: SitemapPostLike[]
  pages?: SitemapPageLike[]
  categories?: SitemapCategoryLike[]
  tags?: string[]
  siteUrl?: string
}): MetadataRoute.Sitemap {
  const cleanSiteUrl = siteUrl.replace(/\/$/, '')
  const entries: MetadataRoute.Sitemap = [
    {
      url: `${cleanSiteUrl}/`,
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${cleanSiteUrl}/contact`,
      changeFrequency: 'monthly',
      priority: 0.6,
    },
  ]

  const seenUrls = new Set<string>(entries.map((e) => e.url))

  for (const pg of pages) {
    if (!pg?.slug) continue
    const url = `${cleanSiteUrl}/${pg.slug}`
    if (seenUrls.has(url)) continue
    seenUrls.add(url)
    entries.push({
      url,
      lastModified: parseSafeDate(pg.updatedAt),
      changeFrequency: 'monthly',
      priority: 0.7,
    })
  }

  for (const cat of categories) {
    if (!cat?.slug) continue
    const url = `${cleanSiteUrl}/category/${cat.slug}`
    if (seenUrls.has(url)) continue
    seenUrls.add(url)
    entries.push({
      url,
      lastModified: parseSafeDate(cat.updatedAt),
      changeFrequency: 'weekly',
      priority: 0.7,
    })
  }

  for (const post of posts) {
    if (!post?.slug) continue
    const url = `${cleanSiteUrl}/${post.slug}`
    if (seenUrls.has(url)) continue
    seenUrls.add(url)
    entries.push({
      url,
      lastModified: parseSafeDate(post.updatedAt || post.publishedAt),
      changeFrequency: 'weekly',
      priority: 0.8,
    })
  }

  for (const rawTag of tags) {
    const tagSlug = slugifyTag(rawTag)
    if (!tagSlug) continue
    const url = `${cleanSiteUrl}/tag/${tagSlug}`
    if (seenUrls.has(url)) continue
    seenUrls.add(url)
    entries.push({
      url,
      changeFrequency: 'weekly',
      priority: 0.5,
    })
  }

  return entries
}

export function buildRobotsMetadata(siteUrl = 'https://alerasoul.net'): MetadataRoute.Robots {
  const cleanSiteUrl = siteUrl.replace(/\/$/, '')
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/admin/', '/api/'],
      },
    ],
    sitemap: `${cleanSiteUrl}/sitemap.xml`,
  }
}
