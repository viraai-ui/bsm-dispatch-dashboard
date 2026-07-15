import { apiOk } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { readSyncedOrdersStore, syncConfirmedOrders } from '@/lib/synced-orders'

export async function GET() {
  const auth = await requireUser(['Admin', 'Operations'])
  if (!auth.ok) return auth.response
  const store = await readSyncedOrdersStore()
  const orders = store.orderIds.map((id) => store.orders[id]).filter(Boolean)
  return apiOk({ source: 'local_confirmed_sales_orders', orders, lastSuccessfulSyncAt: store.lastSuccessfulSyncAt, lastError: store.lastError || null, syncing: Boolean(store.syncing) })
}

export async function POST() {
  const auth = await requireUser(['Admin', 'Operations'])
  if (!auth.ok) return auth.response
  try {
    const store = await syncConfirmedOrders()
    const orders = store.orderIds.map((id) => store.orders[id]).filter(Boolean)
    return apiOk({ source: 'zoho_confirmed_sales_orders', orders, lastSuccessfulSyncAt: store.lastSuccessfulSyncAt })
  } catch (error) {
    const store = await readSyncedOrdersStore()
    return Response.json({ ok: false, error: error instanceof Error ? `${error.message}. Showing last successfully synchronized data.` : 'Confirmed order sync failed. Showing last successfully synchronized data.', data: { orders: store.orderIds.map((id) => store.orders[id]).filter(Boolean), lastSuccessfulSyncAt: store.lastSuccessfulSyncAt } }, { status: 502 })
  }
}
