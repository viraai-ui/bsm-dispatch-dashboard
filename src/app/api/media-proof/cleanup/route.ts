import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { cleanupExpiredMediaProofs } from '@/lib/media-proof'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    const auth = await requireUser(['Admin'])
    if (!auth.ok) return auth.response
  }
  try {
    const packing = await cleanupExpiredMediaProofs('packing')
    const loading = await cleanupExpiredMediaProofs('loading')
    return apiOk({ packing, loading })
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Media cleanup failed', 500)
  }
}
