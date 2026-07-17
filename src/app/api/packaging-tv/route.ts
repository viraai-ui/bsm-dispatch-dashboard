import { apiOk } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { githubReadJson, githubWriteJson, listProcessedOrders } from '@/lib/workflow-store'
import type { Order } from '@/types/domain'

type CompletedStore = { completed: Record<string, { completedAt: string; order: Order }> }
const COMPLETED_PATH = 'data/packaging-completed-store.json'

export async function GET() {
  const auth = await requireUser(['Admin', 'Operations', 'Dispatch'])
  if (!auth.ok) return auth.response
  const processed = await listProcessedOrders()
  const { data: completed } = await githubReadJson<CompletedStore>(COMPLETED_PATH, { completed: {} })
  const orders = processed
    .filter((item) => Boolean(item.processedOrder))
    .map((item) => ({ ...(item.processedOrder as Order), dispatchPriority: item.dispatchPriority || 'regular' }))
    .filter((order) => !completed.completed[order.id])
  return apiOk({ orders, completedCount: Object.keys(completed.completed).length })
}

export async function POST(request: Request) {
  const auth = await requireUser(['Admin', 'Operations', 'Dispatch'])
  if (!auth.ok) return auth.response
  const body = await request.json()
  const order = body.order as Order
  if (!order?.id) return Response.json({ ok: false, error: 'Missing order' }, { status: 400 })
  const completedAt = new Date().toISOString()
  const { data: completed } = await githubReadJson<CompletedStore>(COMPLETED_PATH, { completed: {} })
  completed.completed[order.id] = { completedAt, order }
  await githubWriteJson(COMPLETED_PATH, completed, 'Mark packaging completed')
  return apiOk({ completedAt })
}
