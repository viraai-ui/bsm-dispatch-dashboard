import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth'
import { createR2ViewUrl } from '@/lib/r2'

export const runtime = 'nodejs'

const safeObjectKey = (key: string, prefix: 'media-proof/' | 'payments/') => {
  if (!key.startsWith(prefix) || key.includes('\\') || key.includes('\0')) return false
  const segments = key.split('/')
  return segments.length > 1 && segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..' && /^[a-zA-Z0-9._-]+$/.test(segment))
}

export async function GET(request: NextRequest) {
  const auth = await requireUser(['Admin', 'Operations', 'Media', 'Accounts'])
  if (!auth.ok) return auth.response
  const key = request.nextUrl.searchParams.get('key') || ''
  const canViewMediaProof = ['Admin', 'Operations', 'Media'].includes(auth.user.role)
  const canViewPayment = ['Admin', 'Accounts'].includes(auth.user.role)
  const allowed = (canViewMediaProof && safeObjectKey(key, 'media-proof/')) || (canViewPayment && safeObjectKey(key, 'payments/'))
  if (!allowed) return new NextResponse('Invalid media key', { status: 400 })
  return NextResponse.redirect(createR2ViewUrl(key), 302)
}
