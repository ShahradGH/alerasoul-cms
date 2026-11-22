import { describe, it, expect } from 'vitest'
import { promoteScheduledPosts, type D1DatabaseLike } from '@/lib/cron-publisher'

describe('Workers Cron Scheduled Post Promoter', () => {
  it('promotes only due scheduled posts (published_at <= now) and skips future/draft rows', async () => {
    const rows = [
      { id: 1, slug: 'due-post-a', status: 'scheduled', published_at: '2026-11-22T08:00:00.000Z', updated_at: '' },
      { id: 2, slug: 'future-post-b', status: 'scheduled', published_at: '2026-12-01T08:00:00.000Z', updated_at: '' },
      { id: 3, slug: 'draft-post-c', status: 'draft', published_at: '2026-11-01T08:00:00.000Z', updated_at: '' },
    ]

    const mockD1: D1DatabaseLike = {
      prepare(query: string) {
        return {
          bind(...values: unknown[]) {
            const nowIso = String(values[0])
            return {
              bind: () => this,
              async all<T>() {
                const due = rows.filter(
                  (r) => r.status === 'scheduled' && r.published_at <= nowIso,
                )
                return { results: due.map((r) => ({ id: r.id, slug: r.slug })) as T[] }
              },
              async run() {
                let changes = 0
                if (query.trim().toUpperCase().startsWith('UPDATE')) {
                  for (const r of rows) {
                    if (r.status === 'scheduled' && r.published_at <= nowIso) {
                      r.status = 'published'
                      r.updated_at = nowIso
                      changes++
                    }
                  }
                }
                return { meta: { changes } }
              },
            }
          },
          async all() {
            return { results: [] }
          },
          async run() {
            return { meta: { changes: 0 } }
          },
        }
      },
    }

    const res = await promoteScheduledPosts(mockD1, '2026-11-22T12:00:00.000Z')
    expect(res.promotedCount).toBe(1)
    expect(res.promotedSlugs).toEqual(['due-post-a'])
    expect(rows[0].status).toBe('published')
    expect(rows[1].status).toBe('scheduled')
    expect(rows[2].status).toBe('draft')

    const secondRun = await promoteScheduledPosts(mockD1, '2026-11-22T12:15:00.000Z')
    expect(secondRun.promotedCount).toBe(0)
    expect(secondRun.promotedSlugs).toEqual([])
  })
})
