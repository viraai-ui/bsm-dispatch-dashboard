import { apiError, apiOk } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { listPaymentOpenSalesOrders } from '@/lib/payment-open-sales-orders'

export async function GET(request: Request) {
  const auth = await requireUser(['Admin', 'Accounts'])
  if (!auth.ok) return auth.response
  try {
    const refresh = new URL(request.url).searchParams.get('refresh') === '1'
    const orders = await listPaymentOpenSalesOrders(refresh)
    return apiOk({ source: refresh ? 'zoho_read_only' : 'local_synced_read_only', orders })
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Could not load open sales orders', 502)
  }
}