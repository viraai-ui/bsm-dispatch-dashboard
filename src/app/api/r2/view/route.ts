import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { createR2ViewUrl } from '@/lib/r2'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const auth = await requireUser(['Admin', 'Operations', 'Media'])
  if (!auth.ok) return auth.response
  const key = request.nextUrl.searchParams.get('key') || ''
  if (!key.startsWith('media-proof/')) return new NextResponse('Invalid media key', { status: 400 })
  return NextResponse.redirect(createR2ViewUrl(key), 302)
}
