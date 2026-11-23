import { getCloudflareContext } from '@opennextjs/cloudflare'
import configPromise from '@payload-config'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPayload, type Payload } from 'payload'
import React from 'react'
import { PostCard, type PostCardDoc } from '@/components/PostCard'
import { slugifyTag } from '@/lib/tags'

export const dynamic = 'force-dynamic'

async function resolveMatchingTags(slug: string, payload: Payload): Promise<string[]> {
  const normalizedSlug = slugifyTag(slug)
  if (!normalizedSlug) return []

  const distinctTags = new Set<string>()
  try {
    const cf = await getCloudflareContext({ async: true })
    if (cf?.env?.D1) {
      const res = await cf.env.D1.prepare('SELECT DISTINCT tag FROM posts_tags').all<{ tag: string }>()
      for (const row of res?.results ?? []) {
        if (row.tag) distinctTags.add(row.tag)
      }
    }
  } catch {
    // Fallback to Payload query below when Cloudflare context is unavailable
  }

  if (distinctTags.size === 0) {
    const published = await payload.find({
      collection: 'posts',
      where: { status: { equals: 'published' } },
      limit: 200,
      depth: 0,
    })
    for (const doc of published.docs) {
      if (Array.isArray(doc.tags)) {
        for (const item of doc.tags) {
          if (item?.tag) distinctTags.add(item.tag)
        }
      }
    }
  }

  return Array.from(distinctTags).filter((t) => slugifyTag(t) === normalizedSlug)
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const payload = await getPayload({ config: configPromise })
  const matchedTags = await resolveMatchingTags(slug, payload)
  const displayTag = matchedTags[0] || slug.replace(/-/g, ' ')
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://alerasoul.net').replace(/\/$/, '')
  const canonicalUrl = `${siteUrl}/tag/${slugifyTag(slug)}/`

  return {
    title: `#${displayTag} — Tag Archive`,
    description: `Published technical advisories and architecture notes tagged ${displayTag}.`,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title: `#${displayTag} — Tag Archive`,
      description: `Published technical advisories and architecture notes tagged ${displayTag}.`,
      url: canonicalUrl,
      type: 'website',
    },
  }
}

export default async function TagArchivePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const payload = await getPayload({ config: configPromise })
  const matchedTags = await resolveMatchingTags(slug, payload)

  if (matchedTags.length === 0) {
    notFound()
  }

  const postsRes = await payload.find({
    collection: 'posts',
    where: {
      and: [
        { status: { equals: 'published' } },
        { 'tags.tag': { in: matchedTags } },
      ],
    },
    sort: '-publishedAt',
    limit: 50,
    depth: 1,
  })

  const posts = postsRes.docs as unknown as PostCardDoc[]
  const displayTag = matchedTags[0]

  return (
    <>
      <section className="sov-hero">
        <div className="sov-hero-eyebrow">Tag Archive</div>
        <h1>#{displayTag}</h1>
        <p>
          Published engineering advisories, reference implementations, and architectural notes tagged with{' '}
          <strong>{displayTag}</strong>.
        </p>
      </section>

      <div className="sov-filter-bar">
        <Link href="/" className="sov-pill">
          &larr; All Advisories
        </Link>
        <span className="sov-pill active">
          #{displayTag} ({posts.length})
        </span>
      </div>

      {posts.length === 0 ? (
        <p style={{ color: 'var(--sov-text-muted)' }}>
          No published articles tagged #{displayTag} yet. Check back soon or subscribe via{' '}
          <Link href="/feed/" prefetch={false}>RSS</Link>.
        </p>
      ) : (
        <section className="sov-post-grid">
          {posts.map((post) => (
            <PostCard key={String(post.id)} post={post} />
          ))}
        </section>
      )}
    </>
  )
}
