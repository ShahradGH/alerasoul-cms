import type { CollectionConfig } from 'payload'
import { assertZeroLeakContent, computeReadingMetrics, sanitizePublicSlug } from '../lib/zero-leak'

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
