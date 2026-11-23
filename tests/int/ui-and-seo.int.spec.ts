import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'

const navMocks = vi.hoisted(() => ({
  pathname: '/article-one/',
  getPayloadMock: vi.fn(),
  getCloudflareContextMock: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => navMocks.pathname,
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))

vi.mock('payload', async (importOriginal) => {
  const actual = await importOriginal<typeof import('payload')>()
  return {
    ...actual,
    getPayload: navMocks.getPayloadMock,
  }
})

vi.mock('@payload-config', () => ({ default: Promise.resolve({}) }))

vi.mock('@opennextjs/cloudflare', () => ({
  getCloudflareContext: navMocks.getCloudflareContextMock,
}))

import { ThemeAndEnhancements } from '@/components/ThemeAndEnhancements'
import sitemap from '@/app/sitemap'
import { generateMetadata as generateSlugMetadata } from '@/app/(frontend)/[slug]/page'
import HomePage from '@/app/(frontend)/page'
import TagArchivePage from '@/app/(frontend)/tag/[slug]/page'

describe('SPA Enhancements, Dynamic Sitemap, SEO Metadata, Tag Archive & Search', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    vi.clearAllMocks()
    ;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    navMocks.pathname = '/article-one/'
    navMocks.getCloudflareContextMock.mockRejectedValue(new Error('no cf context'))
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('re-runs ThemeAndEnhancements on pathname navigation without duplicating TOC or copy buttons', async () => {
    const content = document.createElement('div')
    content.className = 'entry-content'
    content.innerHTML = `
      <h2>Section One</h2>
      <h2>Section Two</h2>
      <h3>Sub Section</h3>
      <pre><code>az group list</code></pre>
      <table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>
      <img src="/api/media/file/diagram.png" alt="Diagram" />
    `
    document.body.appendChild(content)

    const root = createRoot(container)
    await act(async () => {
      root.render(React.createElement(ThemeAndEnhancements))
    })

    expect(document.querySelectorAll('.sov-toc-container').length).toBe(1)
    expect(document.querySelectorAll('.sov-copy-btn').length).toBe(1)
    expect(document.querySelectorAll('.sov-anchor-link').length).toBe(3)
    expect(document.querySelectorAll('.sovereign-table-wrap').length).toBe(1)

    // Simulate SPA route navigation to a second article
    navMocks.pathname = '/article-two/'
    content.innerHTML = `
      <h2>New One</h2>
      <h2>New Two</h2>
      <h2>New Three</h2>
      <pre><code>wrangler deploy</code></pre>
    `
    await act(async () => {
      root.render(React.createElement(ThemeAndEnhancements))
    })

    expect(document.querySelectorAll('.sov-toc-container').length).toBe(1)
    expect(document.querySelector('.sov-toc-container')?.textContent).toContain('New One')
    expect(document.querySelectorAll('.sov-copy-btn').length).toBe(1)

    await act(async () => {
      root.unmount()
    })
  })

  it('generates canonical, OpenGraph article, and Twitter metadata in [slug]/page.tsx', async () => {
    navMocks.getPayloadMock.mockResolvedValue({
      find: vi.fn(async ({ collection }: { collection: string }) => {
        if (collection === 'posts') {
          return {
            docs: [
              {
                id: 10,
                title: 'Zero Trust Control Plane',
                slug: 'zero-trust-control-plane',
                excerpt: 'Deterministic Azure IAM control plane guide.',
                publishedAt: '2026-11-22T10:00:00.000Z',
                updatedAt: '2026-11-22T12:00:00.000Z',
                featuredImage: { filename: 'control-plane.png', alt: 'Topology' },
                seo: {
                  metaTitle: 'Zero Trust Control Plane SEO',
                  metaDescription: 'Custom SEO description.',
                },
              },
            ],
          }
        }
        return { docs: [] }
      }),
    })

    const meta = await generateSlugMetadata({
      params: Promise.resolve({ slug: 'zero-trust-control-plane' }),
    })

    expect(meta.title).toBe('Zero Trust Control Plane SEO')
    expect(meta.description).toBe('Custom SEO description.')
    expect(meta.alternates?.canonical).toBe('https://alerasoul.net/zero-trust-control-plane/')
    expect((meta.openGraph as any)?.type).toBe('article')
    expect((meta.openGraph as any)?.url).toBe('https://alerasoul.net/zero-trust-control-plane/')
    expect((meta.openGraph as any)?.images?.[0]?.url).toBe(
      'https://alerasoul.net/api/media/file/control-plane.png',
    )
    expect((meta.twitter as any)?.card).toBe('summary_large_image')
  })

  it('falls back cleanly in sitemap() when DB is unavailable and queries published entries when available', async () => {
    navMocks.getPayloadMock.mockRejectedValueOnce(new Error('D1 unavailable'))
    const fallback = await sitemap()
    expect(fallback.map((e) => e.url)).toEqual([
      'https://alerasoul.net/',
      'https://alerasoul.net/contact',
    ])

    navMocks.getPayloadMock.mockResolvedValueOnce({
      find: vi.fn(async ({ collection }: { collection: string }) => {
        if (collection === 'posts') {
          return {
            docs: [
              {
                slug: 'resilient-hub',
                publishedAt: '2026-11-22T10:00:00.000Z',
                tags: [{ tag: 'Azure' }],
              },
            ],
          }
        }
        if (collection === 'pages') {
          return { docs: [{ slug: 'about', updatedAt: '2026-11-20T10:00:00.000Z' }] }
        }
        if (collection === 'categories') {
          return { docs: [{ slug: 'enterprise-architecture' }] }
        }
        return { docs: [] }
      }),
    })

    const full = await sitemap()
    const urls = full.map((e) => e.url)
    expect(urls).toContain('https://alerasoul.net/resilient-hub')
    expect(urls).toContain('https://alerasoul.net/about')
    expect(urls).toContain('https://alerasoul.net/category/enterprise-architecture')
    expect(urls).toContain('https://alerasoul.net/tag/azure')
  })

  it('supports search query filtering in HomePage and tag resolution in TagArchivePage', async () => {
    const findMock = vi.fn(async ({ collection }: { collection: string }) => {
      if (collection === 'posts') {
        return {
          docs: [
            {
              id: 1,
              title: 'Azure Control Plane',
              slug: 'azure-control-plane',
              tags: [{ tag: 'Azure' }],
              categories: [{ id: 1, name: 'Enterprise Architecture & AI', slug: 'enterprise-architecture' }],
            },
          ],
          totalDocs: 1,
          totalPages: 1,
          page: 1,
          hasPrevPage: false,
          hasNextPage: false,
        }
      }
      return { docs: [{ id: 1, name: 'Enterprise Architecture & AI', slug: 'enterprise-architecture' }] }
    })
    navMocks.getPayloadMock.mockResolvedValue({ find: findMock })

    const homeEl = await HomePage({ searchParams: Promise.resolve({ s: 'Azure' }) })
    expect(homeEl).toBeTruthy()
    expect(findMock).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'posts',
        where: expect.objectContaining({
          and: expect.arrayContaining([
            { status: { equals: 'published' } },
            expect.objectContaining({ or: expect.any(Array) }),
          ]),
        }),
      }),
    )

    const tagEl = await TagArchivePage({ params: Promise.resolve({ slug: 'azure' }) })
    expect(tagEl).toBeTruthy()
    expect(findMock).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'posts',
        where: {
          and: [
            { status: { equals: 'published' } },
            { 'tags.tag': { in: ['Azure'] } },
          ],
        },
      }),
    )
  })
})
