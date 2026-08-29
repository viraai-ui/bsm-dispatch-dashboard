import { githubReadJson, githubWriteJson } from './workflow-store'
import { fetchZohoPaymentOpenOrders } from './zoho'
import { normalizePaymentOrderSearch, paymentOrderStatus } from './payment-order-lookup'
import { toPaymentOrderSuggestions, type PaymentOrderSuggestion } from './payment-open-sales-orders'

const STORE_PATH = 'data/payment-order-index.json'
const FRESH_MS = 5 * 60_000
const REFRESH_COOLDOWN_MS = 60_000
export type PaymentOrderSnapshot = { version: 1; updatedAt: string; orders: [string, string, string, string][] }
type Indexed = PaymentOrderSuggestion & { search: string }
type Cache = { loadedAt: number; updatedAt: string; orders: Indexed[] }

let cache: Cache | null = null
let loadFlight: Promise<Cache> | null = null
let refreshFlight: Promise<Cache> | null = null
let lastRefreshStarted = 0

function decode(snapshot: PaymentOrderSnapshot): Cache {
  const orders = (snapshot.orders || []).map(([id, salesOrderNumber, customerName, rawStatus]) => ({
    id, salesOrderNumber, customerName, rawStatus, status: paymentOrderStatus(rawStatus),
    search: normalizePaymentOrderSearch(`${salesOrderNumber} ${customerName}`),
  }))
  return { loadedAt: Date.now(), updatedAt: snapshot.updatedAt || '', orders }
}

function encode(orders: PaymentOrderSuggestion[]): PaymentOrderSnapshot {
  return { version: 1, updatedAt: new Date().toISOString(), orders: orders.map((order) => [order.id, order.salesOrderNumber, order.customerName, order.rawStatus]) }
}

async function readBundled(): Promise<PaymentOrderSnapshot> {
  try {
    const { readFile } = await import('node:fs/promises')
    return JSON.parse(await readFile(`${process.cwd()}/${STORE_PATH}`, 'utf8'))
  } catch { return { version: 1, updatedAt: '', orders: [] } }
}

async function loadSnapshot() {
  if (cache) return cache
  if (!loadFlight) loadFlight = (async () => {
    const bundled = await readBundled()
    const { data } = await githubReadJson<PaymentOrderSnapshot>(STORE_PATH, bundled)
    const loaded = decode(data.orders?.length ? data : bundled)
    if (!loaded.orders.length) throw new Error('Payment sales-order index is unavailable. Use Sync to retry.')
    return (cache = loaded)
  })().finally(() => { loadFlight = null })
  return loadFlight
}

export async function refreshPaymentOrderIndex(force = false) {
  const now = Date.now()
  if (refreshFlight) return refreshFlight
  if (!force && cache && now - cache.loadedAt < FRESH_MS) return cache
  if (force && now - lastRefreshStarted < REFRESH_COOLDOWN_MS) throw new Error('Sales-order sync was recently started. Please wait one minute.')
  lastRefreshStarted = now
  refreshFlight = (async () => {
    const orders = toPaymentOrderSuggestions(await fetchZohoPaymentOpenOrders())
    if (!orders.length) throw new Error('Zoho returned no payment sales orders; existing index was kept.')
    const snapshot = encode(orders)
    await githubWriteJson(STORE_PATH, snapshot, `Refresh payment order index (${orders.length} orders)`)
    return (cache = decode(snapshot))
  })().finally(() => { refreshFlight = null })
  return refreshFlight
}

export async function searchPaymentOrders(query = '', limit = 10) {
  const started = performance.now()
  const current = await loadSnapshot()
  if (Date.now() - current.loadedAt > FRESH_MS && !refreshFlight) void refreshPaymentOrderIndex().catch((error) => console.warn('[payment-order-index] background refresh failed', error instanceof Error ? error.message : error))
  const needle = normalizePaymentOrderSearch(query)
  const orders = (needle ? current.orders.filter((order) => order.search.includes(needle)) : current.orders).slice(0, Math.max(1, Math.min(limit, 50)))
    .map(({ search: _search, ...safe }) => safe)
  return { orders, total: current.orders.length, updatedAt: current.updatedAt, stale: Date.now() - current.loadedAt > FRESH_MS, searchMs: performance.now() - started }
}

export async function validatePaymentOrder(id: string, number: string, customer: string) {
  const current = await loadSnapshot()
  return current.orders.find((order) => order.id === id && order.salesOrderNumber === number && order.customerName === customer) || null
}

export function resetPaymentOrderSearchForTests() { cache = null; loadFlight = null; refreshFlight = null; lastRefreshStarted = 0 }
