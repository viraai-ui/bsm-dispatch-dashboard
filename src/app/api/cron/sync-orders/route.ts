import { type NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { readSyncedOrdersStore, syncConfirmedOrders } from '@/lib/synced-orders'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

function isAuthorizedCron(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization') || ''
  return Boolean((cronSecret && authHeader === `Bearer ${cronSecret}`) || request.headers.get('x-vercel-cron') === '1')
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    const auth = await requireUser(['Admin'])
    if (!auth.ok) return auth.response
  }

  try {
    const startedAt = Date.now()
    const store = await syncConfirmedOrders()
    return apiOk({
      synced: true,
      orderCount: store.orderIds.length,
      lastSuccessfulSyncAt: store.lastSuccessfulSyncAt,
      durationMs: Date.now() - startedAt,
    })
  } catch (error) {
    const store = await readSyncedOrdersStore()
    return apiError(
      error instanceof Error ? `${error.message}. Last successful sync: ${store.lastSuccessfulSyncAt || 'never'}` : 'Auto sync failed',
      500,
    )
  }
}
