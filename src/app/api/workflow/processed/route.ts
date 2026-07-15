import { apiOk } from '@/lib/api'
import { listProcessedOrders } from '@/lib/workflow-store'

export async function GET() {
  const orders = await listProcessedOrders()
  return apiOk({ orders })
}
