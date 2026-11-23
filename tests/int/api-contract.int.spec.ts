import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { buildRssFeedXml } from '@/lib/rss'
import { renderLexicalToHtml } from '@/lib/lexical-render'
import { resolveMediaPublicUrl } from '@/lib/media-url'
import { buildRobotsMetadata, buildSitemapEntries } from '@/lib/seo'
import { slugifyTag } from '@/lib/tags'

describe('Publishing Contract, RSS 2.0, Lexical, SEO & PaaS Guardrails', () => {
  it('enforces workers_dev = false, preview_urls = false, placement, and cron trigger in wrangler.jsonc', () => {
    const raw = fs.readFileSync(path.resolve(process.cwd(), 'wrangler.jsonc'), 'utf8')
    const cfg = JSON.parse(raw)
    expect(cfg.workers_dev).toBe(false)
    expect(cfg.preview_urls).toBe(false)
    expect(cfg.placement?.region).toBe('aws:eu-west-2')
    expect(cfg.triggers?.crons).toContain('*/15 * * * *')
    expect(cfg.d1_databases?.[0]?.database_name).toBe('alerasoul_cms')
    expect(cfg.r2_buckets?.[0]?.bucket_name).toBe('alerasoul-cms-media')
  })

  it('ships a 12-line PORTABILITY_ESCAPE_HATCH_ONLY Dockerfile', () => {
    const df = fs.readFileSync(path.resolve(process.cwd(), 'Dockerfile'), 'utf8').trim().split(/\r?\n/)
    expect(df[0]).toContain('# PORTABILITY_ESCAPE_HATCH_ONLY')
    expect(df.length).toBe(12)
  })

  it('exposes valid publishing API contract schema and documentation', () => {
    const schema = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), 'docs/publishing-api-contract.schema.json'), 'utf8'),
    )
    expect(schema.definitions.PostUpsertRequest.properties.status.enum).toEqual([
      'draft',
      'scheduled',
      'published',
    ])
    expect(schema.definitions.Category.properties.slug.enum).toEqual([
      'enterprise-architecture',
      'personal',
      'psychology',
    ])
    const md = fs.readFileSync(path.resolve(process.cwd(), 'docs/PUBLISHING-API-CONTRACT.md'), 'utf8')
    expect(md).toContain('Authorization: users API-Key')
    expect(md).toContain('POST /api/media')
    expect(md).toContain('POST /api/posts')
    expect(md).toContain('PATCH /api/posts/:id')
  })

  it('builds valid RSS 2.0 XML with CDATA safety', () => {
    const xml = buildRssFeedXml({
      posts: [
        {
          title: 'Zero-Trust & Identity',
          slug: 'zero-trust-identity',
          publishedAt: '2026-11-21T10:00:00.000Z',
          excerpt: 'Summary with <special> chars',
          html: '<p>Body ]]> test</p>',
          categories: [{ name: 'Enterprise Architecture & AI' }],
        },
      ],
    })
    expect(xml).toContain('<rss version="2.0"')
    expect(xml).toContain('<title>Zero-Trust &amp; Identity</title>')
    expect(xml).toContain('<link>https://alerasoul.net/zero-trust-identity/</link>')
    expect(xml).toContain(']]]]><![CDATA[>')
  })

  it('renders Lexical AST with uploads, horizontal rules, tables, and bitmask formats safely', () => {
    const html = renderLexicalToHtml({
      root: {
        type: 'root',
        children: [
          { type: 'heading', tag: 'h2', children: [{ type: 'text', text: 'Overview' }] },
          {
            type: 'paragraph',
            children: [
              { type: 'text', text: 'Run ' },
              { type: 'text', text: 'wrangler', format: 16 },
              { type: 'text', text: ' bold-underline', format: 1 | 8 },
              { type: 'text', text: ' deprecated', format: 4 },
            ],
          },
          { type: 'horizontalrule' },
          {
            type: 'upload',
            relationTo: 'media',
            value: {
              filename: 'stencil-v2.png',
              alt: 'Azure <Hub> Topology',
              caption: 'Control & Data Plane',
              width: 1200,
              height: 675,
            },
          },
          {
            type: 'table',
            children: [
              {
                type: 'tablerow',
                children: [
                  {
                    type: 'tablecell',
                    headerState: 1,
                    children: [{ type: 'text', text: 'Plane' }],
                  },
                  {
                    type: 'tablecell',
                    headerState: 1,
                    children: [{ type: 'text', text: 'Control' }],
                  },
                ],
              },
              {
                type: 'tablerow',
                children: [
                  {
                    type: 'tablecell',
                    headerState: 0,
                    children: [{ type: 'text', text: 'Edge' }],
                  },
                  {
                    type: 'tablecell',
                    headerState: 0,
                    colSpan: 1,
                    children: [{ type: 'text', text: 'Zero Trust <Access>' }],
                  },
                ],
              },
            ],
          },
        ],
      },
    })
    expect(html).toContain('<h2 class="sov-article-heading">Overview</h2>')
    expect(html).toContain('<code class="sov-inline-code">wrangler</code>')
    expect(html).toContain('<u><strong> bold-underline</strong></u>')
    expect(html).toContain('<s> deprecated</s>')
    expect(html).toContain('<hr />')
    expect(html).toContain(
      '<figure class="sov-media-figure"><img src="/api/media/file/stencil-v2.png" alt="Azure &lt;Hub&gt; Topology" width="1200" height="675" loading="lazy" /><figcaption>Control &amp; Data Plane</figcaption></figure>',
    )
    expect(html).toContain(
      '<div class="sovereign-table-wrap"><table><thead><tr><th>Plane</th><th>Control</th></tr></thead><tbody><tr><td>Edge</td><td>Zero Trust &lt;Access&gt;</td></tr></tbody></table></div>',
    )

    expect(
      resolveMediaPublicUrl({
        prefix: 'wp-content/uploads/2023/08',
        filename: 'logo.png',
      }),
    ).toBe('/wp-content/uploads/2023/08/logo.png')
    expect(resolveMediaPublicUrl({ filename: 'new-stencil.png' })).toBe('/api/media/file/new-stencil.png')
  })

  it('builds deterministic sitemap entries, robots rules, and tag slugs', () => {
    expect(slugifyTag('AI Control Planes')).toBe('ai-control-planes')
    expect(slugifyTag('Enterprise Architecture')).toBe('enterprise-architecture')

    const entries = buildSitemapEntries({
      posts: [{ slug: 'zero-trust-edge', publishedAt: '2026-11-22T09:00:00.000Z' }],
      pages: [{ slug: 'about', updatedAt: '2026-11-20T08:00:00.000Z' }],
      categories: [{ slug: 'enterprise-architecture' }],
      tags: ['AI Control Planes', 'Azure'],
    })
    const urls = entries.map((e) => e.url)
    expect(urls).toContain('https://alerasoul.net/')
    expect(urls).toContain('https://alerasoul.net/contact/')
    expect(urls).toContain('https://alerasoul.net/zero-trust-edge/')
    expect(urls).toContain('https://alerasoul.net/about/')
    expect(urls).toContain('https://alerasoul.net/category/enterprise-architecture/')
    expect(urls).toContain('https://alerasoul.net/tag/ai-control-planes/')
    expect(urls).toContain('https://alerasoul.net/tag/azure/')

    const robots = buildRobotsMetadata()
    expect(robots.sitemap).toBe('https://alerasoul.net/sitemap.xml')
    expect(robots.rules).toEqual([
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/admin/', '/api/'],
      },
    ])
  })
})
