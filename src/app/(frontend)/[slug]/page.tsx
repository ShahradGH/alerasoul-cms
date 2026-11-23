import configPromise from '@payload-config'
import { getPayload } from 'payload'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import React from 'react'
import { formatUtcEditorialDate, resolveMediaPublicUrl, type MediaLike } from '@/lib/media-url'
import { renderLexicalToHtml } from '@/lib/lexical-render'
import { slugifyTag } from '@/lib/tags'
import { computeReadingMetrics } from '@/lib/zero-leak'
import { ShareAndAuthor } from '@/components/ShareAndAuthor'
import type { Category } from '@/payload-types'

export const dynamic = 'force-dynamic'

function getSiteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://alerasoul.net').replace(/\/$/, '')
}

function toAbsoluteUrl(pathOrUrl: string | null | undefined, siteUrl: string): string | undefined {
  if (!pathOrUrl) return undefined
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl
  return `${siteUrl}${pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`}`
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const payload = await getPayload({ config: configPromise })
  const siteUrl = getSiteUrl()

  const postRes = await payload.find({
    collection: 'posts',
    where: { and: [{ slug: { equals: slug } }, { status: { equals: 'published' } }] },
    limit: 1,
    depth: 1,
  })
  const post = postRes.docs[0]
  if (post) {
    const title = post.seo?.metaTitle || post.title
    const description = post.seo?.metaDescription || post.excerpt || undefined
    const canonicalUrl = `${siteUrl}/${post.slug}/`
    const featuredUrl = resolveMediaPublicUrl(post.featuredImage as MediaLike | null)
    const featuredAbsUrl = toAbsoluteUrl(featuredUrl, siteUrl)

    return {
      title,
      description,
      alternates: {
        canonical: canonicalUrl,
      },
      openGraph: {
        title,
        description,
        url: canonicalUrl,
        type: 'article',
        publishedTime: post.publishedAt || post.createdAt || undefined,
        modifiedTime: post.updatedAt || undefined,
        authors: ['Shahrad Alerasoul'],
        ...(featuredAbsUrl ? { images: [{ url: featuredAbsUrl, alt: title }] } : {}),
      },
      twitter: {
        card: featuredAbsUrl ? 'summary_large_image' : 'summary',
        title,
        description,
        ...(featuredAbsUrl ? { images: [featuredAbsUrl] } : {}),
      },
    }
  }

  const pageRes = await payload.find({
    collection: 'pages',
    where: { and: [{ slug: { equals: slug } }, { status: { equals: 'published' } }] },
    limit: 1,
  })
  const pg = pageRes.docs[0]
  if (pg) {
    const title = pg.seo?.metaTitle || pg.title
    const description = pg.seo?.metaDescription || undefined
    const canonicalUrl = `${siteUrl}/${pg.slug}/`
    return {
      title,
      description,
      alternates: {
        canonical: canonicalUrl,
      },
      openGraph: {
        title,
        description,
        url: canonicalUrl,
        type: 'website',
      },
      twitter: {
        card: 'summary',
        title,
        description,
      },
    }
  }

  return { title: 'Not Found' }
}

export default async function SlugPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const payload = await getPayload({ config: configPromise })
  const siteUrl = getSiteUrl()

  // 1. Check Published Posts (/%postname%/)
  const postRes = await payload.find({
    collection: 'posts',
    where: {
      and: [{ slug: { equals: slug } }, { status: { equals: 'published' } }],
    },
    limit: 1,
    depth: 1,
  })
  const post = postRes.docs[0]

  if (post) {
    const htmlBody = post.legacyHtml || renderLexicalToHtml(post.content)
    const { wordCount, readingTimeMinutes } = computeReadingMetrics(htmlBody)
    const finalReadingMins = post.readingTimeMinutes || readingTimeMinutes
    const formattedDate = formatUtcEditorialDate(post.publishedAt || post.createdAt)
    const featuredUrl = resolveMediaPublicUrl(post.featuredImage as MediaLike | null)
    const categories = Array.isArray(post.categories)
      ? post.categories.filter((c): c is Category => typeof c === 'object' && c !== null)
      : []
    const tags = Array.isArray(post.tags)
      ? post.tags.filter((t): t is { tag: string; id?: string | null } => Boolean(t?.tag && slugifyTag(t.tag)))
      : []

    const canonicalUrl = `${siteUrl}/${post.slug}/`
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'TechArticle',
      headline: post.title,
      url: canonicalUrl,
      datePublished: post.publishedAt || post.createdAt,
      dateModified: post.updatedAt || post.publishedAt || post.createdAt,
      author: {
        '@type': 'Person',
        name: 'Shahrad Alerasoul',
        jobTitle: 'Principal Enterprise Cloud Architect',
        url: `${siteUrl}/about/`,
        sameAs: ['https://www.linkedin.com/in/shahradalerasoul/', 'https://github.com/ShahradGH'],
      },
      publisher: {
        '@type': 'Organization',
        name: 'Shahrad Alerasoul',
        url: siteUrl,
      },
      description: post.excerpt || '',
      ...(featuredUrl ? { image: featuredUrl.startsWith('http') ? featuredUrl : `${siteUrl}${featuredUrl}` } : {}),
    }

    const bodyAlreadyShowsRepo = Boolean(
      post.githubRepoUrl && htmlBody.includes(post.githubRepoUrl),
    )

    return (
      <article className="sov-article-shell ast-single-post">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <header className="sov-article-header">
          <div className="sov-card-meta">
            {categories.map((cat) => (
              <Link key={String(cat.id)} href={`/category/${cat.slug}/`} className="sov-cat-badge">
                {cat.name}
              </Link>
            ))}
            {formattedDate && <span>Published {formattedDate}</span>}
          </div>
          <h1 className="sov-article-title">{post.title}</h1>
          <div className="sov-reading-badge">
            <span>Sovereign Advisory</span>
            <span>&bull;</span>
            <span>
              {finalReadingMins} min read ({wordCount.toLocaleString('en-GB')} words)
            </span>
          </div>
          {tags.length > 0 && (
            <div className="sov-tag-list" aria-label="Article Tags">
              {tags.map((item, idx) => (
                <Link
                  key={item.id || `${slugifyTag(item.tag)}-${idx}`}
                  href={`/tag/${slugifyTag(item.tag)}/`}
                  className="sov-tag-pill"
                >
                  #{item.tag}
                </Link>
              ))}
            </div>
          )}
        </header>

        {featuredUrl && !htmlBody.includes(featuredUrl) && (
          <figure style={{ margin: '0 0 28px 0' }}>
            <img
              src={featuredUrl}
              alt={
                typeof post.featuredImage === 'object' && post.featuredImage?.alt
                  ? post.featuredImage.alt
                  : post.title
              }
              style={{ width: '100%', borderRadius: '12px', boxShadow: 'var(--sov-shadow)' }}
            />
          </figure>
        )}

        {post.githubRepoUrl && !bodyAlreadyShowsRepo && (
          <div
            style={{
              background: 'linear-gradient(135deg,#0a1128 0%,#0f172a 100%)',
              color: '#f8fafc',
              padding: '18px 22px',
              borderRadius: '10px',
              borderLeft: '4px solid #00a8e8',
              margin: '0 0 28px 0',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <span style={{ fontSize: '0.94rem', color: '#e2e8f0' }}>
              <strong>Verified Code &amp; Deterministic Test Suite:</strong>
            </span>
            <a
              href={post.githubRepoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="sov-github-btn"
            >
              View GitHub Repository &rarr;
            </a>
          </div>
        )}

        <div className="entry-content" dangerouslySetInnerHTML={{ __html: htmlBody }} />

        <ShareAndAuthor canonicalUrl={canonicalUrl} />
      </article>
    )
  }

  // 2. Fallback: Published Pages (/about/, /architecture/, /privacy/)
  const pageRes = await payload.find({
    collection: 'pages',
    where: {
      and: [{ slug: { equals: slug } }, { status: { equals: 'published' } }],
    },
    limit: 1,
  })
  const pg = pageRes.docs[0]
  if (pg) {
    const htmlBody = pg.legacyHtml || renderLexicalToHtml(pg.content)
    return (
      <article className="sov-article-shell">
        <header className="sov-article-header">
          <h1 className="sov-article-title">{pg.title}</h1>
        </header>
        <div className="entry-content" dangerouslySetInnerHTML={{ __html: htmlBody }} />
      </article>
    )
  }

  notFound()
}
