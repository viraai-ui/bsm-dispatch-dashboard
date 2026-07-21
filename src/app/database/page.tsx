import { DashboardShell } from '@/components/DashboardShell'
import { DatabaseClient } from '@/components/DatabaseClient'
import { listSyncedOrders } from '@/lib/synced-orders'
import { buildOrderStatusMap } from '@/lib/status-projection'
import { readDispatchStore } from '@/lib/order-stage'
import { listWorkflows } from '@/lib/workflow-store'

export const dynamic = 'force-dynamic'

export default async function DatabasePage() {
  const orders = await listSyncedOrders()
  const workflows = await listWorkflows()
  const workflowOrderIds = new Set(Object.keys(workflows))
  const databaseOrders = orders.filter((order) => workflowOrderIds.has(order.id))
  const { statuses, mediaRecords } = await buildOrderStatusMap(databaseOrders, workflows)
  const dispatchStore = await readDispatchStore()
  const warrantyDates = Object.fromEntries(databaseOrders.map((order) => [order.id, dispatchStore.dispatched[order.id]?.dispatchedAt || order.deliveryDate || '']))
  return <DashboardShell active="Database"><DatabaseClient orders={databaseOrders} mediaRecords={mediaRecords} statuses={statuses} warrantyDates={warrantyDates} /></DashboardShell>
}
