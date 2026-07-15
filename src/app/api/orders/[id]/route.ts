import { apiError, apiOk } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { getSyncedOrder } from '@/lib/synced-orders'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(['Admin', 'Operations'])
  if (!auth.ok) return auth.response
  const { id } = await params
  const order = await getSyncedOrder(id)
  return order ? apiOk({ source: 'local_confirmed_sales_orders', order }) : apiError('Order not found', 404)
}
