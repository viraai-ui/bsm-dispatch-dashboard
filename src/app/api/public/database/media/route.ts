import crypto from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { verifyImmutablePublicMediaCapability } from '@/lib/public-database-media'
import { getPublicDatabaseSnapshot } from '@/lib/public-database-snapshot'
import { createR2HeadUrl, createR2ViewUrl } from '@/lib/r2'
import { getZohoAccessToken } from '@/lib/zoho'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const attempts = new Map<string, { count: number; reset: number }>()
const LIMIT = 60
const WINDOW_MS = 60_000
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' }

export async function GET(request: NextRequest) { return safelyResolveMedia(request) }
export async function HEAD(request: NextRequest) { return safelyResolveMedia(request) }

async function safelyResolveMedia(request: NextRequest) {
  try { return await resolveMedia(request) }
  catch (error) {
    const requestId=crypto.randomUUID()
    console.error(JSON.stringify({event:'public_media_failure',requestId,error:error instanceof Error?error.message:String(error)}))
    return new NextResponse(`Attachment service unavailable. Reference: ${requestId}`,{status:502,headers:PRIVATE_HEADERS})
  }
}

async function resolveMedia(request: NextRequest) {
  if (!withinRateLimit(request)) return new NextResponse('Too many media requests. Please try again shortly.', { status: 429, headers: { ...PRIVATE_HEADERS, 'Retry-After': '60' } })
  const token = request.nextUrl.searchParams.get('token') || ''
  const capability = verifyImmutablePublicMediaCapability(token)
  if (!capability) return new NextResponse('This media link is invalid or expired. Refresh the Database page and try again.', { status: 403, headers: PRIVATE_HEADERS })

  const snapshot = await getPublicDatabaseSnapshot()
  const reference = snapshot.media[capability.mediaRefId]
  if (snapshot.snapshotVersion !== capability.snapshotVersion || !reference || reference.orderId !== capability.orderId) {
    return new NextResponse('This attachment is no longer available on the public Database record.', { status: 404, headers: PRIVATE_HEADERS })
  }

  if (reference.source === 'r2') {
    const signedUrl = request.method === 'HEAD' ? createR2HeadUrl(reference.value, 120) : createR2ViewUrl(reference.value, 120)
    const response = NextResponse.redirect(signedUrl, 302)
    for (const [key, value] of Object.entries(PRIVATE_HEADERS)) response.headers.set(key, value)
    return response
  }
  if (reference.source === 'github') {
    const response = NextResponse.redirect(reference.value, 302)
    for (const [key, value] of Object.entries(PRIVATE_HEADERS)) response.headers.set(key, value)
    return response
  }

  const tokenValue = await getZohoAccessToken()
  const upstream = await fetch(`${zohoApiDomain()}/workdrive/api/v1/download/${encodeURIComponent(reference.value)}`, {
    method: request.method === 'HEAD' ? 'HEAD' : 'GET',
    headers: {
      Authorization: `Zoho-oauthtoken ${tokenValue}`,
      ...(request.headers.get('range') ? { Range: request.headers.get('range')! } : {}),
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  })
  if (!upstream.ok && upstream.status !== 206) return new NextResponse('The legacy attachment could not be loaded.', { status: upstream.status === 404 ? 404 : 502, headers: PRIVATE_HEADERS })
  const headers = new Headers(PRIVATE_HEADERS)
  for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'content-disposition', 'etag', 'last-modified']) {
    const value = upstream.headers.get(name); if (value) headers.set(name, value)
  }
  return new NextResponse(request.method === 'HEAD' ? null : upstream.body, { status: upstream.status, headers })
}

function withinRateLimit(request: NextRequest) {
  const now = Date.now()
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown'
  const current = attempts.get(ip)
  if (!current || current.reset <= now) { attempts.set(ip, { count: 1, reset: now + WINDOW_MS }); return true }
  current.count += 1
  return current.count <= LIMIT
}

function zohoApiDomain() {
  const dc = process.env.ZOHO_DC || 'in'
  return `https://www.zohoapis.${dc}`
}
