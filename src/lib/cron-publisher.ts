/**
 * Scheduled Post Auto-Publisher (Cloudflare Workers 15-minute Cron handler).
 * Promotes Posts with `status = 'scheduled'` and `published_at <= now()` to `published`.
 */

export interface D1PreparedLike {
  bind(...values: unknown[]): D1PreparedLike
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>
  run(): Promise<{ meta?: { changes?: number } }>
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedLike
}

export interface CronPromoteResult {
  checkedAt: string
  promotedCount: number
  promotedSlugs: string[]
}

export async function promoteScheduledPosts(
  db: D1DatabaseLike,
  nowIso: string = new Date().toISOString(),
): Promise<CronPromoteResult> {
  const dueRows = await db
    .prepare(
      `SELECT id, slug FROM posts WHERE status = 'scheduled' AND published_at IS NOT NULL AND published_at <= ?1`,
    )
    .bind(nowIso)
    .all<{ id: number; slug: string }>()

  const rows = dueRows?.results ?? []
  if (rows.length === 0) {
    return {
      checkedAt: nowIso,
      promotedCount: 0,
      promotedSlugs: [],
    }
  }

  await db
    .prepare(
      `UPDATE posts SET status = 'published', updated_at = ?1 WHERE status = 'scheduled' AND published_at IS NOT NULL AND published_at <= ?1`,
    )
    .bind(nowIso)
    .run()

  return {
    checkedAt: nowIso,
    promotedCount: rows.length,
    promotedSlugs: rows.map((r) => r.slug),
  }
}
