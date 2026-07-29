import type { Order } from '@/types/domain'
import { getSyncedOrder } from './synced-orders'
import { githubReadJson } from './workflow-store'

type CompletedStore = { completed: Record<string, { completedAt: string; order: Order; machineIds?: string[] }> }
const COMPLETED_PATH = 'data/packaging-completed-store.json'

export async function getMediaOrder(orderId: string) {
  const id = String(orderId || '')
  if (!id) return null
  const synced = await getSyncedOrder(id)
  if (synced) return synced
  const { data } = await githubReadJson<CompletedStore>(COMPLETED_PATH, { completed: {} })
  const completed = data.completed || {}
  const entry = completed[id] || Object.values(completed).find((item) => item.order?.salesOrderNumber === id || item.order?.zohoSalesOrderId === id)
  return entry?.order || null
}
