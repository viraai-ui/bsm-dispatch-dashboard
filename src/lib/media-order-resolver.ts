import type { Order } from '@/types/domain'
import { getOperationalOrderIds, getSyncedOrder, isOperationalZohoOrder } from './synced-orders'
import { githubReadJson, listWorkflows } from './workflow-store'

type CompletedStore = { completed: Record<string, { completedAt: string; order: Order; machineIds?: string[] }> }
const COMPLETED_PATH = 'data/packaging-completed-store.json'

export async function getMediaOrder(orderId: string) {
  const id = String(orderId || '')
  if (!id) return null
  const synced = await getSyncedOrder(id)
  if (synced && isOperationalZohoOrder(synced)) return synced
  if (synced && !isOperationalZohoOrder(synced)) return null
  const { data } = await githubReadJson<CompletedStore>(COMPLETED_PATH, { completed: {} })
  const completed = data.completed || {}
  const entry = completed[id] || Object.values(completed).find((item) => item.order?.salesOrderNumber === id || item.order?.zohoSalesOrderId === id)
  const activeIds = await getOperationalOrderIds()
  if (entry?.order && activeIds.has(entry.order.id)) return entry.order
  const workflows = await listWorkflows()
  const workflow = workflows[id] || Object.values(workflows).find((item) => item.salesOrderNumber === id || item.processedOrder?.zohoSalesOrderId === id)
  const order = workflow?.processedOrder
  return order && activeIds.has(order.id) ? order : null
}
