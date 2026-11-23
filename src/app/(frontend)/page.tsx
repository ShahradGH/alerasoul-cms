import configPromise from '@payload-config'
import { getPayload, type Where } from 'payload'
import Link from 'next/link'
import React from 'react'
import { PostCard, type PostCardDoc } from '@/components/PostCard'

export const dynamic = 'force-dynamic'

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; s?: string }>
}) {
  const sp = await searchParams
  const page = Math.max(1, Number.parseInt(sp.page || '1', 10) || 1)
  const searchQuery = String(sp.s || '').trim().slice(0, 120)
  const payload = await getPayload({ config: configPromise })

  const where: Where = searchQuery
    ? {
        and: [
          { status: { equals: 'published' } },
          {
            or: [
              { title: { contains: searchQuery } },
              { excerpt: { contains: searchQuery } },
              { slug: { contains: searchQuery } },
            ],
          },
        ],
      }
    : { status: { equals: 'published' } }

  const [postsRes, catsRes] = await Promise.all([
    payload.find({
      collection: 'posts',
      where,
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
  const pageHref = (targetPage: number) =>
    searchQuery
      ? `/?page=${targetPage}&s=${encodeURIComponent(searchQuery)}`
      : `/?page=${targetPage}`

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

      <form method="GET" action="/" className="sov-search-bar" role="search" aria-label="Search Advisories">
        <input
          type="search"
          name="s"
          defaultValue={searchQuery}
          placeholder="Search advisories (e.g. Azure, Entra, KQL, Control Plane)..."
          aria-label="Search advisories"
          maxLength={120}
        />
        <button type="submit" className="sov-search-btn">
          Search
        </button>
        {searchQuery && (
          <Link href="/" className="sov-pill">
            Clear
          </Link>
        )}
      </form>

      <div className="sov-filter-bar" aria-label="Category Filters">
        <Link href="/" className={`sov-pill${searchQuery ? '' : ' active'}`}>
          All Advisories{searchQuery ? '' : ` (${postsRes.totalDocs})`}
        </Link>
        {catsRes.docs.map((cat) => (
          <Link key={String(cat.id)} href={`/category/${cat.slug}/`} className="sov-pill">
            {cat.name}
          </Link>
        ))}
      </div>

      {searchQuery && (
        <p style={{ color: 'var(--sov-text-muted)', marginBottom: '20px' }}>
          Found <strong>{postsRes.totalDocs}</strong> matching{' '}
          {postsRes.totalDocs === 1 ? 'advisory' : 'advisories'} for{' '}
          <code>{searchQuery}</code>.
        </p>
      )}

      {posts.length === 0 ? (
        <p style={{ color: 'var(--sov-text-muted)' }}>
          {searchQuery
            ? `No published advisories matched "${searchQuery}".`
            : 'No published advisories available yet.'}
        </p>
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
            <Link href={pageHref(page - 1)} className="sov-pill">
              &larr; Newer
            </Link>
          )}
          <span className="sov-pill active">
            Page {postsRes.page} of {postsRes.totalPages}
          </span>
          {postsRes.hasNextPage && (
            <Link href={pageHref(page + 1)} className="sov-pill">
              Older &rarr;
            </Link>
          )}
        </div>
      )}
    </>
  )
}
