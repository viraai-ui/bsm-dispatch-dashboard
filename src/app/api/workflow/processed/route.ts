import { apiOk } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { listProcessedOrders } from '@/lib/workflow-store'

export async function GET() {
  const auth = await requireUser(['Admin', 'Operations'])
  if (!auth.ok) return auth.response
  const orders = await listProcessedOrders()
  return apiOk({ orders })
}
