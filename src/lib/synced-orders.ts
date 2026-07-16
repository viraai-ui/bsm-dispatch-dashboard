import type { MachineUnit, Order } from '@/types/domain'
import { fetchZohoConfirmedOrders } from './zoho'
import { deriveWorkflowStatus, githubReadJson, githubWriteJson, listWorkflows, type OrderWorkflow } from './workflow-store'

export type SyncedOrdersStore = {
  orders: Record<string, Order>
  orderIds: string[]
  lastSuccessfulSyncAt: string | null
  lastAttemptAt?: string | null
  lastError?: string | null
  syncing?: boolean
}

const SYNCED_ORDERS_PATH = 'data/synced-confirmed-orders-store.json'
let inMemorySync: Promise<SyncedOrdersStore> | null = null

const fallbackStore: SyncedOrdersStore = { orders: {}, orderIds: [], lastSuccessfulSyncAt: null }

export async function readSyncedOrdersStore() {
  const { data } = await githubReadJson<SyncedOrdersStore>(SYNCED_ORDERS_PATH, fallbackStore)
  return normalizeStore(data)
}

function normalizeStore(store: SyncedOrdersStore): SyncedOrdersStore {
  const orders = store.orders || {}
  const orderIds = (store.orderIds?.length ? store.orderIds : Object.keys(orders)).filter((id) => Boolean(orders[id]))
  return { ...fallbackStore, ...store, orders, orderIds }
}

export async function writeSyncedOrdersStore(store: SyncedOrdersStore, message = 'Update confirmed sales order sync store') {
  await githubWriteJson(SYNCED_ORDERS_PATH, normalizeStore(store), message)
}

export async function listSyncedOrders() {
  const store = await readSyncedOrdersStore()
  const workflows = await listWorkflows()
  return store.orderIds.map((id) => store.orders[id] ? applyWorkflow(store.orders[id], workflows[id]) : null).filter(Boolean) as Order[]
}

export async function getSyncedOrder(id: string) {
  const store = await readSyncedOrdersStore()
  const workflows = await listWorkflows()
  const order = store.orders[id] || Object.values(store.orders).find((item) => item.zohoSalesOrderId === id || item.salesOrderNumber === id) || null
  return order ? applyWorkflow(order, workflows[order.id]) : null
}

export async function syncConfirmedOrders() {
  if (inMemorySync) return inMemorySync
  inMemorySync = performSync().finally(() => { inMemorySync = null })
  return inMemorySync
}

async function performSync() {
  const previous = await readSyncedOrdersStore()
  if (previous.syncing && previous.lastAttemptAt && Date.now() - new Date(previous.lastAttemptAt).getTime() < 10 * 60 * 1000) {
    throw new Error('A confirmed order sync is already running')
  }
  await writeSyncedOrdersStore({ ...previous, syncing: true, lastAttemptAt: new Date().toISOString(), lastError: null }, 'Start confirmed sales order sync')
  try {
    const fetched = await fetchZohoConfirmedOrders()
    if (!Array.isArray(fetched)) throw new Error('Invalid Zoho response')
    if (!fetched.length) throw new Error('Zoho sync returned zero confirmed sales orders; keeping last saved data')
    if (fetched.some((order) => !order.id || !order.zohoSalesOrderId)) throw new Error('Zoho sync returned invalid sales order IDs')
    const orders: Record<string, Order> = {}
    for (const order of fetched) orders[order.id] = order
    const orderIds = fetched.map((order) => order.id)
    if (new Set(orderIds).size !== orderIds.length) throw new Error('Zoho sync returned duplicate sales order IDs')
    const next: SyncedOrdersStore = { orders, orderIds, lastSuccessfulSyncAt: new Date().toISOString(), lastAttemptAt: new Date().toISOString(), lastError: null, syncing: false }
    await writeSyncedOrdersStore(next, 'Complete confirmed sales order sync')
    return next
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Confirmed sales order sync failed'
    const safe = { ...previous, syncing: false, lastAttemptAt: new Date().toISOString(), lastError: message }
    await writeSyncedOrdersStore(safe, 'Confirmed sales order sync failed')
    throw new Error(message)
  }
}

function applyWorkflow(order: Order, workflow?: OrderWorkflow): Order {
  if (!workflow) return order
  const machines = order.machines.map((machine) => applyMachineWorkflow(machine, workflow))
  const status = deriveWorkflowStatus(workflow, machines.length)
  return {
    ...order,
    machines,
    dashboardStatus: status === 'processed' ? 'Processed' : status === 'qr_generated' ? 'QR Generated' : status === 'partially_generated' ? 'QR Generated' : order.dashboardStatus,
  }
}

function applyMachineWorkflow(machine: MachineUnit, workflow: OrderWorkflow): MachineUnit {
  const saved = workflow.machines?.[machine.id]
  if (!saved) return machine
  return {
    ...machine,
    serialNumber: saved.serialNumber || machine.serialNumber,
    qrToken: saved.qrToken || machine.qrToken,
    status: workflow.status === 'processed' ? 'Processed' : saved.qrStatus === 'generated' ? 'QR Generated' : saved.qrStatus === 'not_required' ? 'QR Printed' : machine.status,
  }
}
