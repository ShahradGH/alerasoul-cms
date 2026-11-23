import type { CollectionConfig } from 'payload'
import { collectPagePurgePaths, purgeEdgeCachePaths, type CacheablePageDoc } from '../lib/edge-cache'
import { assertZeroLeakContent, sanitizePublicSlug } from '../lib/zero-leak'

export const Pages: CollectionConfig = {
  slug: 'pages',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', 'status'],
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
          legacyHtml: data.legacyHtml,
          metaTitle: data.seo?.metaTitle,
          metaDescription: data.seo?.metaDescription,
        })
        return data
      },
    ],
    afterChange: [
      async ({ doc, previousDoc }) => {
        try {
          const paths = collectPagePurgePaths([
            doc as CacheablePageDoc,
            previousDoc as CacheablePageDoc | undefined,
          ])
          await purgeEdgeCachePaths(paths)
        } catch (err) {
          console.warn(
            JSON.stringify({
              level: 'warn',
              msg: 'Page afterChange edge cache purge failed',
              error: err instanceof Error ? err.message : String(err),
            }),
          )
        }
        return doc
      },
    ],
    afterDelete: [
      async ({ doc }) => {
        try {
          const paths = collectPagePurgePaths([doc as CacheablePageDoc])
          await purgeEdgeCachePaths(paths)
        } catch (err) {
          console.warn(
            JSON.stringify({
              level: 'warn',
              msg: 'Page afterDelete edge cache purge failed',
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
      defaultValue: 'published',
      index: true,
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Published', value: 'published' },
      ],
    },
    {
      name: 'content',
      type: 'richText',
    },
    {
      name: 'legacyHtml',
      type: 'textarea',
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
  ],
}
