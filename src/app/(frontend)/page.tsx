import configPromise from '@payload-config'
import { getPayload } from 'payload'
import Link from 'next/link'
import React from 'react'
import { PostCard, type PostCardDoc } from '@/components/PostCard'

export const dynamic = 'force-dynamic'

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const sp = await searchParams
  const page = Math.max(1, Number.parseInt(sp.page || '1', 10) || 1)
  const payload = await getPayload({ config: configPromise })

  const [postsRes, catsRes] = await Promise.all([
    payload.find({
      collection: 'posts',
      where: { status: { equals: 'published' } },
      sort: '-publishedAt',
      limit: 12,
      page,
      depth: 1,
    }),
    payload.find({
      collection: 'categories',
      limit: 20,
      sort: 'name',
    }),
  ])

  const posts = postsRes.docs as unknown as PostCardDoc[]

  return (
    <>
      <section className="sov-hero">
        <div className="sov-hero-eyebrow">Sovereign Enterprise Architecture Journal</div>
        <h1>Falsifiable Cloud Engineering, AI Control Planes &amp; Azure Resilience</h1>
        <p>
          Executive architecture decisions, deterministic verification suites, Microsoft Graph v2.x runbooks, and
          production KQL telemetry authored by Shahrad Alerasoul.
        </p>
      </section>

      <div className="sov-filter-bar" aria-label="Category Filters">
        <Link href="/" className="sov-pill active">
          All Advisories ({postsRes.totalDocs})
        </Link>
        {catsRes.docs.map((cat) => (
          <Link key={String(cat.id)} href={`/category/${cat.slug}/`} className="sov-pill">
            {cat.name}
          </Link>
        ))}
      </div>

      {posts.length === 0 ? (
        <p style={{ color: 'var(--sov-text-muted)' }}>No published advisories available yet.</p>
      ) : (
        <section className="sov-post-grid">
          {posts.map((post) => (
            <PostCard key={String(post.id)} post={post} />
          ))}
        </section>
      )}

      {postsRes.totalPages > 1 && (
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '36px' }}>
          {postsRes.hasPrevPage && (
            <Link href={`/?page=${page - 1}`} className="sov-pill">
              &larr; Newer
            </Link>
          )}
          <span className="sov-pill active">
            Page {postsRes.page} of {postsRes.totalPages}
          </span>
          {postsRes.hasNextPage && (
            <Link href={`/?page=${page + 1}`} className="sov-pill">
              Older &rarr;
            </Link>
          )}
        </div>
      )}
    </>
  )
}
