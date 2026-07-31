import { apiOk } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { getOperationalOrderIds } from '@/lib/synced-orders'
import { listProcessedOrders } from '@/lib/workflow-store'

export async function GET() {
  const auth = await requireUser(['Admin', 'Operations'])
  if (!auth.ok) return auth.response
  const activeIds = await getOperationalOrderIds()
  const orders = (await listProcessedOrders()).filter((order) => activeIds.has(order.salesOrderId))
  return apiOk({ orders })
}
