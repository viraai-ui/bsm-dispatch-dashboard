import { apiError, apiOk } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { listSyncedOrders } from '@/lib/synced-orders'
import { markDispatched, readDispatchStore } from '@/lib/order-stage'
import { readMediaProofStore } from '@/lib/media-proof'

export async function GET() {
  const auth = await requireUser(['Admin', 'Operations'])
  if (!auth.ok) return auth.response
  const orders = await listSyncedOrders()
  const media = await readMediaProofStore('loading')
  const dispatch = await readDispatchStore()
  const ready = orders.filter((order) => media.records[order.id]?.submittedAt && !dispatch.dispatched[order.id])
  return apiOk({ orders: ready, dispatched: dispatch.dispatched })
}

export async function POST(request: Request) {
  const auth = await requireUser(['Admin', 'Operations'])
  if (!auth.ok) return auth.response
  const body = await request.json()
  const orders = await listSyncedOrders()
  const order = orders.find((item) => item.id === body.orderId || item.salesOrderNumber === body.orderId)
  if (!order) return apiError('Order not found', 404)
  const media = await readMediaProofStore('loading')
  if (!media.records[order.id]?.submittedAt) return apiError('Media proof must be submitted before dispatch', 400)
  return apiOk({ dispatched: await markDispatched(order) })
}
