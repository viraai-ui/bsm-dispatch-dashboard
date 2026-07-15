import type { Order } from '@/types/domain'
import { fetchZohoConfirmedOrders } from './zoho'
import { githubReadJson, githubWriteJson } from './workflow-store'

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
  return store.orderIds.map((id) => store.orders[id]).filter(Boolean)
}

export async function getSyncedOrder(id: string) {
  const store = await readSyncedOrdersStore()
  return store.orders[id] || Object.values(store.orders).find((order) => order.zohoSalesOrderId === id || order.salesOrderNumber === id) || null
}

export async function syncConfirmedOrders() {
  if (inMemorySync) return inMemorySync
  inMemorySync = performSync().finally(() => { inMemorySync = null })
  return inMemorySync
}

async function performSync() {
  const previous = await readSyncedOrdersStore()
  await writeSyncedOrdersStore({ ...previous, syncing: true, lastAttemptAt: new Date().toISOString(), lastError: null }, 'Start confirmed sales order sync')
  try {
    const fetched = await fetchZohoConfirmedOrders()
    if (!Array.isArray(fetched)) throw new Error('Invalid Zoho response')
    const orders: Record<string, Order> = {}
    for (const order of fetched) orders[order.id] = order
    const next: SyncedOrdersStore = { orders, orderIds: fetched.map((order) => order.id), lastSuccessfulSyncAt: new Date().toISOString(), lastAttemptAt: new Date().toISOString(), lastError: null, syncing: false }
    await writeSyncedOrdersStore(next, 'Complete confirmed sales order sync')
    return next
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Confirmed sales order sync failed'
    const safe = { ...previous, syncing: false, lastAttemptAt: new Date().toISOString(), lastError: message }
    await writeSyncedOrdersStore(safe, 'Confirmed sales order sync failed')
    throw new Error(message)
  }
}
