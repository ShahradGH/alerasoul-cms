/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-ignore Generated during `opennextjs-cloudflare build`
import { default as openNextHandler } from '../.open-next/worker.js'
// @ts-ignore Generated during `opennextjs-cloudflare build`
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from '../.open-next/worker.js'

import { applySecurityHeaders, handleEdgeRequest } from './lib/edge-middleware'
import { promoteScheduledPosts } from './lib/cron-publisher'

const workerHandler = {
  async fetch(request: Request, env: CloudflareEnv, ctx: ExecutionContext): Promise<Response> {
    const edgeResp = await handleEdgeRequest(request, { R2: env.R2 })
    if (edgeResp) {
      return applySecurityHeaders(edgeResp)
    }

    const response = await openNextHandler.fetch(request, env, ctx)
    return applySecurityHeaders(response)
  },

  async scheduled(_controller: ScheduledController, env: CloudflareEnv, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      promoteScheduledPosts(env.D1).then((res) => {
        if (res.promotedCount > 0) {
          console.log(JSON.stringify({ level: 'info', msg: 'Promoted scheduled posts', ...res }))
        }
      }),
    )
  },
} satisfies ExportedHandler<CloudflareEnv>

export default workerHandler
