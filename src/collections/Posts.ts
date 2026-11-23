import type { CollectionConfig, PayloadRequest } from 'payload'
import {
  CANONICAL_CATEGORY_SLUGS,
  collectPostPurgePaths,
  purgeEdgeCachePaths,
  type CacheablePostDoc,
} from '../lib/edge-cache'
import { assertZeroLeakContent, computeReadingMetrics, sanitizePublicSlug } from '../lib/zero-leak'

async function resolveCategorySlugsForPurge(
  docs: Array<CacheablePostDoc | null | undefined>,
  req?: PayloadRequest,
): Promise<string[]> {
  const slugs = new Set<string>(CANONICAL_CATEGORY_SLUGS)
  const numericIds = new Set<number | string>()

  for (const doc of docs) {
    if (!doc || !Array.isArray(doc.categories)) continue
    for (const cat of doc.categories) {
      if (cat && typeof cat === 'object' && cat.slug) {
        slugs.add(cat.slug)
      } else if (typeof cat === 'number' || typeof cat === 'string') {
        numericIds.add(cat)
      }
    }
  }

  if (numericIds.size > 0 && req?.payload) {
    try {
      const catRes = await req.payload.find({
        collection: 'categories',
        where: { id: { in: Array.from(numericIds) } },
        limit: 20,
        overrideAccess: true,
      })
      for (const c of catRes.docs) {
        if (c.slug) slugs.add(c.slug)
      }
    } catch {
      // Fallback to canonical category slugs already in set
    }
  }

  return Array.from(slugs)
}

export const Posts: CollectionConfig = {
  slug: 'posts',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', 'status', 'publishedAt'],
  },
  access: {
    read: ({ req }) => (req.user ? true : { status: { equals: 'published' } }),
    create: ({ req }) => Boolean(req.user),
    update: ({ req }) => Boolean(req.user),
    delete: ({ req }) => Boolean(req.user),
  },
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (!data) return data
        if (typeof data.slug === 'string' && data.slug.trim()) {
          data.slug = sanitizePublicSlug(data.slug)
        } else if (typeof data.title === 'string' && data.title.trim()) {
          data.slug = sanitizePublicSlug(data.title)
        }
        return data
      },
    ],
    beforeChange: [
      ({ data }) => {
        if (!data) return data
        assertZeroLeakContent({
          title: data.title,
          slug: data.slug,
          excerpt: data.excerpt,
          legacyHtml: data.legacyHtml,
          githubRepoUrl: data.githubRepoUrl,
          metaTitle: data.seo?.metaTitle,
          metaDescription: data.seo?.metaDescription,
        })
        if (data.status === 'published' && !data.publishedAt) {
          data.publishedAt = new Date().toISOString()
        }
        if ((!data.readingTimeMinutes || data.readingTimeMinutes <= 0) && typeof data.legacyHtml === 'string') {
          data.readingTimeMinutes = computeReadingMetrics(data.legacyHtml).readingTimeMinutes
        }
        return data
      },
    ],
    afterChange: [
      async ({ doc, previousDoc, req }) => {
        try {
          const docs = [doc as CacheablePostDoc, previousDoc as CacheablePostDoc | undefined]
          const catSlugs = await resolveCategorySlugsForPurge(docs, req)
          const paths = collectPostPurgePaths(docs, catSlugs)
          await purgeEdgeCachePaths(paths)
        } catch (err) {
          console.warn(
            JSON.stringify({
              level: 'warn',
              msg: 'Post afterChange edge cache purge failed',
              error: err instanceof Error ? err.message : String(err),
            }),
          )
        }
        return doc
      },
    ],
    afterDelete: [
      async ({ doc, req }) => {
        try {
          const docs = [doc as CacheablePostDoc]
          const catSlugs = await resolveCategorySlugsForPurge(docs, req)
          const paths = collectPostPurgePaths(docs, catSlugs)
          await purgeEdgeCachePaths(paths)
        } catch (err) {
          console.warn(
            JSON.stringify({
              level: 'warn',
              msg: 'Post afterDelete edge cache purge failed',
              error: err instanceof Error ? err.message : String(err),
            }),
          )
        }
        return doc
      },
    ],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      index: true,
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Scheduled', value: 'scheduled' },
        { label: 'Published', value: 'published' },
      ],
    },
    {
      name: 'publishedAt',
      type: 'date',
      index: true,
      admin: {
        date: {
          pickerAppearance: 'dayAndTime',
        },
      },
    },
    {
      name: 'excerpt',
      type: 'textarea',
    },
    {
      name: 'content',
      type: 'richText',
    },
    {
      name: 'legacyHtml',
      type: 'textarea',
      admin: {
        description: 'Pre-compiled clean HTML article body for faithful WordPress & automated publishing parity.',
      },
    },
    {
      name: 'categories',
      type: 'relationship',
      relationTo: 'categories',
      hasMany: true,
      index: true,
    },
    {
      name: 'tags',
      type: 'array',
      fields: [
        {
          name: 'tag',
          type: 'text',
          required: true,
          index: true,
        },
      ],
    },
    {
      name: 'featuredImage',
      type: 'upload',
      relationTo: 'media',
    },
    {
      name: 'githubRepoUrl',
      type: 'text',
      validate: (value: string | null | undefined) => {
        if (!value) return true
        return /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/.test(value)
          ? true
          : 'githubRepoUrl must be a valid https://github.com/<owner>/<repo> URL'
      },
    },
    {
      name: 'seo',
      type: 'group',
      fields: [
        {
          name: 'metaTitle',
          type: 'text',
        },
        {
          name: 'metaDescription',
          type: 'textarea',
        },
      ],
    },
    {
      name: 'readingTimeMinutes',
      type: 'number',
      defaultValue: 1,
      min: 1,
    },
  ],
}
