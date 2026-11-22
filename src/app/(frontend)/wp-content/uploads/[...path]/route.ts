import { getCloudflareContext } from '@opennextjs/cloudflare'
import { serveLegacyUploadFromR2, type EdgeR2Bucket } from '@/lib/edge-middleware'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params
  const pathname = `/wp-content/uploads/${path.join('/')}`

  try {
    const cf = await getCloudflareContext({ async: true })
    const r2 = (cf?.env as { R2?: EdgeR2Bucket } | undefined)?.R2
    const res = await serveLegacyUploadFromR2(pathname, r2)
    if (res) return res
  } catch {
    // Fall through to 404 when R2 binding unavailable
  }

  return new Response('Not Found', { status: 404 })
}
