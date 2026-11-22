import { NextResponse, type NextRequest } from 'next/server'
import { evaluateEdgeRedirectOrBlock } from './lib/edge-middleware'

export function middleware(request: NextRequest) {
  const edgeResp = evaluateEdgeRedirectOrBlock(request.nextUrl)
  if (edgeResp) {
    return edgeResp
  }

  // Serve /feed/ directly without a 308 redirect for strict RSS readers
  if (request.nextUrl.pathname === '/feed/') {
    const rewriteUrl = request.nextUrl.clone()
    rewriteUrl.pathname = '/feed'
    return NextResponse.rewrite(rewriteUrl)
  }

  const res = NextResponse.next()
  res.headers.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload')
  res.headers.set('X-Content-Type-Options', 'nosniff')
  res.headers.set('X-Frame-Options', 'SAMEORIGIN')
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
