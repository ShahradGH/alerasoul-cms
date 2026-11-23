import Link from 'next/link'
import React from 'react'
import { formatUtcEditorialDate, resolveMediaPublicUrl, type MediaLike } from '@/lib/media-url'
import { slugifyTag } from '@/lib/tags'

export interface PostCardDoc {
  id: number | string
  title: string
  slug: string
  publishedAt?: string | null
  createdAt?: string | null
  excerpt?: string | null
  readingTimeMinutes?: number | null
  githubRepoUrl?: string | null
  featuredImage?: MediaLike | number | null
  categories?: Array<{ id: number | string; name?: string | null; slug?: string | null } | number> | null
  tags?: Array<{ id?: string | null; tag: string }> | null
}

export function PostCard({ post }: { post: PostCardDoc }) {
  const thumbUrl = resolveMediaPublicUrl(post.featuredImage)
  const cats = Array.isArray(post.categories)
    ? post.categories.filter(
        (c): c is { id: number | string; name?: string | null; slug?: string | null } =>
          typeof c === 'object' && c !== null,
      )
    : []
  const tags = Array.isArray(post.tags)
    ? post.tags.filter((t): t is { id?: string | null; tag: string } => Boolean(t?.tag && slugifyTag(t.tag)))
    : []
  const formattedDate = formatUtcEditorialDate(post.publishedAt || post.createdAt)

  return (
    <article className="sov-card">
      {thumbUrl && (
        <Link href={`/${post.slug}/`}>
          <img
            src={thumbUrl}
            alt={typeof post.featuredImage === 'object' && post.featuredImage?.alt ? post.featuredImage.alt : post.title}
            className="sov-card-thumb"
            loading="lazy"
          />
        </Link>
      )}
      <div className="sov-card-body">
        <div className="sov-card-meta">
          {cats.map((cat) => (
            <Link key={String(cat.id)} href={`/category/${cat.slug}/`} className="sov-cat-badge">
              {cat.name}
            </Link>
          ))}
          {formattedDate && <span>{formattedDate}</span>}
          {post.readingTimeMinutes ? <span>&bull; {post.readingTimeMinutes} min read</span> : null}
        </div>
        <h2 className="sov-card-title">
          <Link href={`/${post.slug}/`}>{post.title}</Link>
        </h2>
        {post.excerpt && <p className="sov-card-excerpt">{post.excerpt}</p>}
        {tags.length > 0 && (
          <div className="sov-tag-list" aria-label="Post Tags">
            {tags.slice(0, 4).map((item, idx) => (
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
        <div className="sov-card-actions">
          <Link href={`/${post.slug}/`} className="sov-read-more">
            Read Advisory &rarr;
          </Link>
          {post.githubRepoUrl && (
            <a
              href={post.githubRepoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="sov-github-btn"
            >
              View GitHub Repo &rarr;
            </a>
          )}
        </div>
      </div>
    </article>
  )
}
