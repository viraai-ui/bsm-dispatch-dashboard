import { apiError, apiOk } from '@/lib/api'
import { requireUser, safeUser } from '@/lib/auth'
import { cancelOrderFromDashboard } from '@/lib/order-cancellation'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(['Admin', 'Operations'])
  if (!auth.ok) return auth.response
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const result = await cancelOrderFromDashboard(id, String(body.salesOrderNumber || ''), safeUser(auth.user))
    return apiOk(result)
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Could not cancel order from dashboard', 409)
  }
}
