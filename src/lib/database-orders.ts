import { listSerialSheetDatabaseOrders } from './serial-sheet-backup'
import { listSyncedOrders } from './synced-orders'
import { readDispatchStore } from './order-stage'
import { listWorkflows } from './workflow-store'

export async function loadDatabaseOrders() {
  const orders = await listSyncedOrders()
  const workflows = await listWorkflows()
  const workflowOrderIds = new Set(Object.keys(workflows))
  const workflowOrders = orders.filter((order) => workflowOrderIds.has(order.id))
  const existingSerials = new Set(workflowOrders.flatMap((order) => order.machines.map((machine) => machine.serialNumber).filter(Boolean)))
  const serialSheet = await listSerialSheetDatabaseOrders(existingSerials)
  const databaseOrders = [...workflowOrders, ...serialSheet.orders]
  const dispatchStore = await readDispatchStore()
  const warrantyDates = {
    ...Object.fromEntries(workflowOrders.map((order) => [order.id, dispatchStore.dispatched[order.id]?.dispatchedAt || order.deliveryDate || ''])),
    ...serialSheet.warrantyDates,
  }
  return { databaseOrders, workflows, warrantyDates, serialSheet }
}
