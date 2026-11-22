// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { Users } from '@/collections/Users'
import { Media } from '@/collections/Media'
import { Categories } from '@/collections/Categories'
import { Posts } from '@/collections/Posts'
import { Pages } from '@/collections/Pages'
import { ContactSubmissions } from '@/collections/ContactSubmissions'

describe('Payload Collections & Hooks Contract', () => {
  it('registers all 6 required collections with expected slugs and auth settings', () => {
    const slugs = [Users, Media, Categories, Posts, Pages, ContactSubmissions].map((c) => c.slug)
    expect(slugs).toEqual([
      'users',
      'media',
      'categories',
      'posts',
      'pages',
      'contact-submissions',
    ])
    expect(Users.auth).toEqual({ useAPIKey: true })
    expect(Media.upload).toMatchObject({ crop: false, focalPoint: false, disableLocalStorage: true })
  })

  it('enforces Posts hooks: strips Silo prefixes, computes reading time, and blocks Zero-Leak violations', async () => {
    const beforeValidate = Posts.hooks?.beforeValidate?.[0]
    const beforeChange = Posts.hooks?.beforeChange?.[0]
    expect(beforeValidate).toBeTypeOf('function')
    expect(beforeChange).toBeTypeOf('function')

    const validated = await beforeValidate!({
      data: { title: 'My Advisory', slug: '004-my-advisory' },
    } as any)
    expect(validated.slug).toBe('my-advisory')

    const changed = await beforeChange!({
      data: {
        title: 'My Advisory',
        slug: 'my-advisory',
        status: 'published',
        legacyHtml: `<p>${Array.from({ length: 450 }, () => 'cloud').join(' ')}</p>`,
      },
    } as any)
    expect(changed.publishedAt).toBeTruthy()
    expect(changed.readingTimeMinutes).toBe(3)

    expect(() =>
      beforeChange!({
        data: {
          title: 'Bad',
          slug: '002-bad',
          legacyHtml: '<p>ok</p>',
        },
      } as any),
    ).toThrow(/Zero-Leak veto/i)
  })

  it('keeps public read access on Posts scoped to published only for unauthenticated visitors', () => {
    const readAccess = Posts.access?.read
    expect(readAccess).toBeTypeOf('function')
    expect(readAccess!({ req: { user: null } } as any)).toEqual({
      status: { equals: 'published' },
    })
    expect(readAccess!({ req: { user: { id: 1 } } } as any)).toBe(true)
  })
})
