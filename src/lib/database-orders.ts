import type { Order } from '@/types/domain'
import { listSerialSheetDatabaseOrders } from './serial-sheet-backup'
import { listSyncedOrders } from './synced-orders'
import { readDispatchStore } from './order-stage'
import { listWorkflows, type OrderWorkflow } from './workflow-store'
import { readShipmentStore } from './ready-to-ship'

export async function loadDatabaseOrders() {
  const orders = await listSyncedOrders()
  const workflows = await listWorkflows()
  const workflowOrderIds = new Set(Object.keys(workflows))
  const workflowOrders = orders
    .filter((order) => workflowOrderIds.has(order.id))
    .map((order) => databaseOrderFromWorkflow(order, workflows[order.id]))
    .sort((a, b) => databaseSortTime(workflows[b.id], b) - databaseSortTime(workflows[a.id], a))
  const existingSerials = new Set(workflowOrders.flatMap((order) => order.machines.map((machine) => machine.serialNumber).filter(Boolean)))
  const serialSheet = await listSerialSheetDatabaseOrders(existingSerials)
  const databaseOrders = [...workflowOrders, ...serialSheet.orders]
  const [dispatchStore, shipmentStore] = await Promise.all([readDispatchStore(), readShipmentStore()])
  const warrantyDates = {
    ...Object.fromEntries(workflowOrders.map((order) => [order.id, dispatchStore.dispatched[order.id]?.dispatchedAt || order.deliveryDate || ''])),
    ...serialSheet.warrantyDates,
  }
  return { databaseOrders, workflows, warrantyDates, serialSheet, shipmentRecords: shipmentStore.shipments }
}

function databaseOrderFromWorkflow(order: Order, workflow?: OrderWorkflow): Order {
  if (!workflow?.processedOrder) return order
  const processedMachineIds = new Set((workflow.processedOrder.machines || []).map((machine) => machine.id))
  const workflowHasSerials = (workflow.processedOrder.machines || []).some((machine) => machine.serialNumber)
  if (!processedMachineIds.size || !workflowHasSerials) return order
  const syncedMachineById = new Map((order.machines || []).map((machine) => [machine.id, machine]))
  const machines = workflow.processedOrder.machines.map((machine) => ({
    ...(syncedMachineById.get(machine.id) || {}),
    ...machine,
  }))
  const processedLineItemIds = new Set(machines.map((machine) => machine.lineItemId).filter(Boolean))
  return {
    ...order,
    ...workflow.processedOrder,
    machines,
    lineItems: (workflow.processedOrder.lineItems || order.lineItems || []).filter((item) => !processedLineItemIds.size || processedLineItemIds.has(item.id)),
    dashboardStatus: order.dashboardStatus,
  }
}

function databaseSortTime(workflow: OrderWorkflow | undefined, order: Order) {
  const machineTimes = Object.values(workflow?.machines || {}).flatMap((machine) => [machine.dispatchedAt, machine.processedAt, machine.qrGeneratedAt].filter(Boolean) as string[])
  const value = workflow?.processedAt || machineTimes.sort().at(-1) || order.deliveryDate || ''
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : 0
}
