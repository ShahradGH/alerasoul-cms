import configPromise from '@payload-config'
import { getPayload } from 'payload'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import React from 'react'
import { PostCard, type PostCardDoc } from '@/components/PostCard'

export const dynamic = 'force-dynamic'

export default async function CategoryArchivePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const payload = await getPayload({ config: configPromise })

  const catRes = await payload.find({
    collection: 'categories',
    where: { slug: { equals: slug } },
    limit: 1,
  })
  const category = catRes.docs[0]
  if (!category) {
    notFound()
  }

  const postsRes = await payload.find({
    collection: 'posts',
    where: {
      and: [
        { status: { equals: 'published' } },
        { categories: { equals: category.id } },
      ],
    },
    sort: '-publishedAt',
    limit: 50,
    depth: 1,
  })

  const posts = postsRes.docs as unknown as PostCardDoc[]

  return (
    <>
      <section className="sov-hero">
        <div className="sov-hero-eyebrow">Category Archive</div>
        <h1>{category.name}</h1>
        {category.description && <p>{category.description}</p>}
      </section>

      <div className="sov-filter-bar">
        <Link href="/" className="sov-pill">
          &larr; All Advisories
        </Link>
        <span className="sov-pill active">
          {category.name} ({posts.length})
        </span>
      </div>

      {posts.length === 0 ? (
        <p style={{ color: 'var(--sov-text-muted)' }}>
          No published articles in {category.name} yet. Check back soon or subscribe via{' '}
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
