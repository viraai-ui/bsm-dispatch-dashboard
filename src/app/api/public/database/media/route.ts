import { NextRequest, NextResponse } from 'next/server'
import { loadDatabaseOrders } from '@/lib/database-orders'
import { readMediaProofStore } from '@/lib/media-proof'
import { readShipmentStore } from '@/lib/ready-to-ship'
import { capabilityIsReferenced, isAllowedGithubUrl, verifyPublicMediaCapability } from '@/lib/public-database-media'
import { createR2ViewUrl } from '@/lib/r2'
import { getZohoAccessToken } from '@/lib/zoho'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const attempts = new Map<string, { count: number; reset: number }>()
const LIMIT = 60
const WINDOW_MS = 60_000
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' }

export async function GET(request: NextRequest) { return resolveMedia(request) }
export async function HEAD(request: NextRequest) { return resolveMedia(request) }

async function resolveMedia(request: NextRequest) {
  if (!withinRateLimit(request)) return new NextResponse('Too many media requests. Please try again shortly.', { status: 429, headers: { ...PRIVATE_HEADERS, 'Retry-After': '60' } })
  const token = request.nextUrl.searchParams.get('token') || ''
  const capability = verifyPublicMediaCapability(token)
  if (!capability) return new NextResponse('This media link is invalid or expired. Refresh the Database page and try again.', { status: 403, headers: PRIVATE_HEADERS })

  const [{ databaseOrders }, packing, loading, shipmentStore] = await Promise.all([
    loadDatabaseOrders(), readMediaProofStore('packing'), readMediaProofStore('loading'), readShipmentStore(),
  ])
  if (!databaseOrders.some((order) => order.id === capability.orderId) || !capabilityIsReferenced(capability, packing.records, loading.records, shipmentStore.shipments)) {
    return new NextResponse('This attachment is no longer available on the public Database record.', { status: 404, headers: PRIVATE_HEADERS })
  }

  if (capability.source === 'r2') {
    const response = NextResponse.redirect(createR2ViewUrl(capability.value, 120), 302)
    for (const [key, value] of Object.entries(PRIVATE_HEADERS)) response.headers.set(key, value)
    return response
  }
  if (capability.source === 'github' && isAllowedGithubUrl(capability.value)) {
    const response = NextResponse.redirect(capability.value, 302)
    for (const [key, value] of Object.entries(PRIVATE_HEADERS)) response.headers.set(key, value)
    return response
  }

  const tokenValue = await getZohoAccessToken()
  const upstream = await fetch(`${zohoApiDomain()}/workdrive/api/v1/download/${encodeURIComponent(capability.value)}`, {
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
