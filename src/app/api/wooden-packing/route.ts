import { apiOk } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { syncConfirmedOrders } from '@/lib/synced-orders'
import { buildWoodenPackingQueue } from '@/lib/wooden-packing'

export async function GET() {
  const auth = await requireUser(['Admin', 'Operations'])
  if (!auth.ok) return auth.response
  return apiOk({ queue: await buildWoodenPackingQueue() })
}

export async function POST() {
  const auth = await requireUser(['Admin', 'Operations'])
  if (!auth.ok) return auth.response
  await syncConfirmedOrders()
  return apiOk({ queue: await buildWoodenPackingQueue() })
}
