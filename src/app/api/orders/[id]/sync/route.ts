import { apiError, apiOk } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { syncSingleOrder } from '@/lib/synced-orders'

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(['Admin', 'Operations'])
  if (!auth.ok) return auth.response
  const { id } = await params
  try {
    const result = await syncSingleOrder(decodeURIComponent(id), `${auth.user.name} (${auth.user.id})`)
    return apiOk(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Order sync failed'
    if (message === 'CANCELLED_ORDER_TOMBSTONE') return apiError('Cancelled orders cannot be revived by sync.', 409)
    if (message === 'ORDER_UNAVAILABLE_IN_ZOHO' || /not found|sales order does not exist/i.test(message)) return apiError('Order unavailable in Zoho — use Cancel Order if required', 409)
    return apiError(`Could not sync this order. Current data was kept. ${message}`, 502)
  }
}
