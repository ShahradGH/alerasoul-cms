import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  buildEdgeCacheKey,
  collectPagePurgePaths,
  collectPostPurgePaths,
  isPublicEdgeCacheCandidate,
  normalizeCacheUrl,
  purgeEdgeCachePaths,
} from '@/lib/edge-cache'
import { Posts } from '@/collections/Posts'
import { Pages } from '@/collections/Pages'

describe('Edge Cache Normalisation & Invalidation', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('strips marketing and tracking parameters while preserving search and pagination params', () => {
    const normalized = normalizeCacheUrl(
      'https://alerasoul.net/my-article/?utm_source=linkedin&utm_medium=social&utm_campaign=launch&li_fat_id=li123&fbclid=fb1&gclid=gc1&ref=share&mc_cid=m1&mc_eid=e1&_hsenc=h1',
    )
    expect(normalized).toBe('https://alerasoul.net/my-article/')

    const withSearch = normalizeCacheUrl(
      'https://alerasoul.net/?utm_source=linkedin&s=azure&page=2&fbclid=abc',
    )
    expect(withSearch).toBe('https://alerasoul.net/?page=2&s=azure')

    const key = buildEdgeCacheKey('https://alerasoul.net/feed/?utm_source=rss&ref=feedly')
    expect(key.url).toBe('https://alerasoul.net/feed/')
    expect(key.method).toBe('GET')

    // Structural { url } extraction works even when Request constructors differ across runtimes
    const crossRealmKey = buildEdgeCacheKey({ url: 'https://alerasoul.net/about/?utm_source=linkedin' })
    expect(crossRealmKey.url).toBe('https://alerasoul.net/about/')
  })

  it('correctly filters public edge cache candidates', () => {
    expect(isPublicEdgeCacheCandidate(new Request('https://alerasoul.net/'))).toBe(true)
    expect(
      isPublicEdgeCacheCandidate(new Request('https://alerasoul.net/article/?utm_source=linkedin')),
    ).toBe(true)
    expect(isPublicEdgeCacheCandidate(new Request('https://alerasoul.net/?s=azure'))).toBe(false)
    expect(isPublicEdgeCacheCandidate(new Request('https://alerasoul.net/?preview=1'))).toBe(false)
    expect(isPublicEdgeCacheCandidate(new Request('https://alerasoul.net/admin'))).toBe(false)
    expect(isPublicEdgeCacheCandidate(new Request('https://alerasoul.net/api/posts'))).toBe(false)
    expect(
      isPublicEdgeCacheCandidate(
        new Request('https://alerasoul.net/article/', { headers: { cookie: 'payload-token=abc' } }),
      ),
    ).toBe(false)
    expect(
      isPublicEdgeCacheCandidate(
        new Request('https://alerasoul.net/article/', { headers: { rsc: '1' } }),
      ),
    ).toBe(false)
  })

  it('collects and purges post and page paths from caches.default', async () => {
    const postPaths = collectPostPurgePaths(
      [
        {
          slug: 'azure-control-plane',
          categories: [{ slug: 'enterprise-architecture' }],
          tags: [{ tag: 'Azure' }, { tag: 'AI Control Planes' }],
        },
      ],
      ['enterprise-architecture'],
    )
    expect(postPaths).toContain('/')
    expect(postPaths).toContain('/feed')
    expect(postPaths).toContain('/feed/')
    expect(postPaths).toContain('/sitemap.xml')
    expect(postPaths).toContain('/azure-control-plane/')
    expect(postPaths).toContain('/category/enterprise-architecture/')
    expect(postPaths).toContain('/tag/azure/')
    expect(postPaths).toContain('/tag/ai-control-planes/')

    const pagePaths = collectPagePurgePaths([{ slug: 'about' }])
    expect(pagePaths).toContain('/')
    expect(pagePaths).toContain('/sitemap.xml')
    expect(pagePaths).toContain('/about/')

    const deletedUrls: string[] = []
    const mockCache = {
      delete: vi.fn(async (req: Request) => {
        deletedUrls.push(req.url)
        return true
      }),
    } as unknown as Cache

    const res = await purgeEdgeCachePaths(postPaths, {
      siteUrl: 'https://alerasoul.net',
      cache: mockCache,
    })
    expect(res.attempted).toBe(postPaths.length)
    expect(res.purged).toBe(postPaths.length)
    expect(deletedUrls).toContain('https://alerasoul.net/sitemap.xml')
    expect(deletedUrls).toContain('https://alerasoul.net/tag/ai-control-planes/')
  })

  it('invokes cache purge in Posts and Pages afterChange and afterDelete hooks', async () => {
    const deleted: string[] = []
    vi.stubGlobal('caches', {
      default: {
        delete: async (req: Request) => {
          deleted.push(req.url)
          return true
        },
      },
    })

    const postAfterChange = Posts.hooks?.afterChange?.[0]
    const postAfterDelete = Posts.hooks?.afterDelete?.[0]
    const pageAfterChange = Pages.hooks?.afterChange?.[0]
    const pageAfterDelete = Pages.hooks?.afterDelete?.[0]

    await postAfterChange!({
      doc: {
        slug: 'new-post',
        categories: [{ slug: 'enterprise-architecture' }],
        tags: [{ tag: 'Azure' }],
      },
      previousDoc: { slug: 'old-post' },
      req: {},
    } as any)

    expect(deleted).toContain('https://alerasoul.net/new-post/')
    expect(deleted).toContain('https://alerasoul.net/old-post/')
    expect(deleted).toContain('https://alerasoul.net/tag/azure/')
    expect(deleted).toContain('https://alerasoul.net/feed/')

    deleted.length = 0
    await postAfterDelete!({
      doc: { slug: 'deleted-post', categories: [{ slug: 'personal' }], tags: [{ tag: 'Cloud' }] },
      req: {},
    } as any)
    expect(deleted).toContain('https://alerasoul.net/deleted-post/')
    expect(deleted).toContain('https://alerasoul.net/category/personal/')
    expect(deleted).toContain('https://alerasoul.net/tag/cloud/')

    deleted.length = 0
    await pageAfterChange!({ doc: { slug: 'about' }, previousDoc: { slug: 'about-me' } } as any)
    expect(deleted).toContain('https://alerasoul.net/about/')
    expect(deleted).toContain('https://alerasoul.net/about-me/')

    deleted.length = 0
    await pageAfterDelete!({ doc: { slug: 'privacy' } } as any)
    expect(deleted).toContain('https://alerasoul.net/privacy/')
  })
})
