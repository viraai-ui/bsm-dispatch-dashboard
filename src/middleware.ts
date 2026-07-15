import { NextResponse, type NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

const cookieName = 'bsm_dispatch_session'
const dispatchOnly = '/packaging-tv'
const protectedRoutes = ['/', '/orders', '/wooden-packing', '/packaging-tv', '/media-proof', '/vehicle-dispatch', '/database', '/machine-lookup', '/settings']

function secretKey() {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || 'bsm-dispatch-dashboard-local-secret-change-me'
  return new TextEncoder().encode(secret)
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  if (!protectedRoutes.some((route) => pathname === route || (route !== '/' && pathname.startsWith(`${route}/`)))) return NextResponse.next()
  const token = request.cookies.get(cookieName)?.value
  if (!token) return NextResponse.next()
  try {
    const { payload } = await jwtVerify(token, secretKey())
    if (payload.role === 'Dispatch' && pathname !== dispatchOnly) {
      return NextResponse.redirect(new URL(dispatchOnly, request.url))
    }
    if (payload.role === 'Operations' && pathname === '/settings') {
      return NextResponse.redirect(new URL('/', request.url))
    }
  } catch {
    const response = NextResponse.next()
    response.cookies.set(cookieName, '', { path: '/', maxAge: 0 })
    return response
  }
  return NextResponse.next()
}

export const config = { matcher: ['/((?!api|_next/static|_next/image|favicon.ico|vehicle-logos).*)'] }
