import { type NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { readSyncedOrdersStore, syncConfirmedOrders } from '@/lib/synced-orders'
import { isAuthorizedCron } from '@/lib/cron-auth'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) return apiError('Unauthorized', 401)
  return runSync()
}

export async function POST() {
  const auth = await requireUser(['Admin', 'Operations'])
  if (!auth.ok) return auth.response
  return runSync()
}

async function runSync() {
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
