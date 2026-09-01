import type { SafeUser } from './auth'
import { githubReadJson, githubRequest, githubWriteRetryDelay, isGitHubWriteConflict, listWorkflows } from './workflow-store'
import { isOrderTombstoned, LIFECYCLE_BASELINE_PATH, type LifecycleBaselineStore, type LifecycleTombstone } from './operational-orders'
import { readSyncedOrdersStore } from './synced-orders'

const fallback: LifecycleBaselineStore = { version: 1, cutoverVersion: '', cutoverDate: '', tombstones: {} }

export async function cancelOrderFromDashboard(orderId: string, salesOrderNumber: string, actor: SafeUser) {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const [source, workflows, current] = await Promise.all([readSyncedOrdersStore(), listWorkflows(), githubReadJson<LifecycleBaselineStore>(LIFECYCLE_BASELINE_PATH, fallback)])
    if (source.syncing) throw new Error('Order sync is currently running. Wait for it to finish, then try again.')
    const order = source.orders[orderId] || Object.values(source.orders).find((item) => item.zohoSalesOrderId === orderId || item.salesOrderNumber === salesOrderNumber) || workflows[orderId]?.processedOrder
    if (!order) throw new Error('Order was not found. Refresh the dashboard and try again.')
    const existing = isOrderTombstoned(order, current.data.tombstones)
    if (!existing) {
      const now = new Date().toISOString()
      const tombstone: LifecycleTombstone = { orderId: order.id, salesOrderNumber: order.salesOrderNumber, reason: 'cancelled_from_dashboard', stageAtCutover: 'open', tombstonedAt: now, cutoverVersion: 'admin-cancel-v1', cutoverDate: now.slice(0, 10), actor: { id: actor.id, name: actor.name, email: actor.email }, sourceRevision: current.sha }
      const next = { ...current.data, tombstones: { ...current.data.tombstones, [order.id]: tombstone } }
      const body: Record<string, string> = { message: `Cancel ${order.salesOrderNumber} from active dashboard`, content: Buffer.from(JSON.stringify(next, null, 2)).toString('base64') }
      if (current.sha) body.sha = current.sha
      try { await githubRequest(`/contents/${LIFECYCLE_BASELINE_PATH}`, { method: 'PUT', body: JSON.stringify(body) }) }
      catch (error) {
        lastError = error
        if (isGitHubWriteConflict(error) && attempt < 2) { await new Promise((resolve) => setTimeout(resolve, githubWriteRetryDelay(attempt))); continue }
        throw error
      }
    }
    const readBack = await githubReadJson<LifecycleBaselineStore>(LIFECYCLE_BASELINE_PATH, fallback)
    if (!isOrderTombstoned(order, readBack.data.tombstones)) throw new Error('Cancellation could not be verified. The order remains visible; please retry.')
    return { orderId: order.id, salesOrderNumber: order.salesOrderNumber, cancelled: true, alreadyCancelled: existing }
  }
  throw lastError instanceof Error ? lastError : new Error('Cancellation conflicted with another update. Please retry.')
}
