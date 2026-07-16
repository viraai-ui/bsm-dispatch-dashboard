import { apiError, apiOk } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { getSyncedOrder } from '@/lib/synced-orders'
import { buildOrderStatusMap } from '@/lib/status-projection'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(['Admin', 'Operations'])
  if (!auth.ok) return auth.response
  const { id } = await params
  const order = await getSyncedOrder(id)
  if (!order) return apiError('Order not found', 404)
  const { statuses, stages } = await buildOrderStatusMap([order])
  return apiOk({ source: 'local_confirmed_sales_orders', order, stage: stages[order.id] || 'open', status: statuses[order.id] })
}
