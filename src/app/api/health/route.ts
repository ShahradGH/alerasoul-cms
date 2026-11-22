import configPromise from '@payload-config'
import { getPayload } from 'payload'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const payload = await getPayload({ config: configPromise })
    const result = await payload.count({
      collection: 'posts',
      where: {
        status: {
          equals: 'published',
        },
      },
    })
    return Response.json(
      {
        ok: true,
        service: 'alerasoul-cms',
        publishedPosts: result.totalDocs,
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      },
    )
  } catch (err) {
    return Response.json(
      {
        ok: false,
        service: 'alerasoul-cms',
        error: err instanceof Error ? err.message : 'Health check failed',
      },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
