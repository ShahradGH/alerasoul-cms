import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { buildRssFeedXml } from '@/lib/rss'
import { renderLexicalToHtml } from '@/lib/lexical-render'
import { resolveMediaPublicUrl } from '@/lib/media-url'

describe('Publishing Contract, RSS 2.0, Lexical & PaaS Guardrails', () => {
  it('enforces workers_dev = false, preview_urls = false, and cron trigger in wrangler.jsonc', () => {
    const raw = fs.readFileSync(path.resolve(process.cwd(), 'wrangler.jsonc'), 'utf8')
    const cfg = JSON.parse(raw)
    expect(cfg.workers_dev).toBe(false)
    expect(cfg.preview_urls).toBe(false)
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

  it('renders Lexical AST and resolves legacy vs Payload media URLs', () => {
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
            ],
          },
        ],
      },
    })
    expect(html).toContain('<h2 class="sov-article-heading">Overview</h2>')
    expect(html).toContain('<code class="sov-inline-code">wrangler</code>')

    expect(
      resolveMediaPublicUrl({
        prefix: 'wp-content/uploads/2023/08',
        filename: 'logo.png',
      }),
    ).toBe('/wp-content/uploads/2023/08/logo.png')
    expect(resolveMediaPublicUrl({ filename: 'new-stencil.png' })).toBe('/api/media/file/new-stencil.png')
  })
})
