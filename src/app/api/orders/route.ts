import { apiOk } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { listSyncedOrders, readSyncedOrdersStore, syncConfirmedOrders } from '@/lib/synced-orders'
import { buildOrderStatusMap } from '@/lib/status-projection'

export async function GET() {
  const auth = await requireUser(['Admin', 'Operations'])
  if (!auth.ok) return auth.response
  const store = await readSyncedOrdersStore()
  const orders = await listSyncedOrders()
  const { stages, statuses } = await buildOrderStatusMap(orders)
  return apiOk({ source: 'local_confirmed_sales_orders', orders, stages, orderStatuses: statuses, lastSuccessfulSyncAt: store.lastSuccessfulSyncAt, lastError: store.lastError || null, syncing: Boolean(store.syncing) })
}

export async function POST() {
  const auth = await requireUser(['Admin', 'Operations'])
  if (!auth.ok) return auth.response
  try {
    const store = await syncConfirmedOrders()
    const orders = await listSyncedOrders()
    const { stages, statuses } = await buildOrderStatusMap(orders)
    return apiOk({ source: 'zoho_confirmed_sales_orders', orders, stages, orderStatuses: statuses, lastSuccessfulSyncAt: store.lastSuccessfulSyncAt })
  } catch (error) {
    const store = await readSyncedOrdersStore()
    const orders = await listSyncedOrders()
    const { stages, statuses } = await buildOrderStatusMap(orders)
    return Response.json({ ok: false, error: error instanceof Error ? `${error.message}. Showing last successfully synchronized data.` : 'Confirmed order sync failed. Showing last successfully synchronized data.', data: { orders, stages, orderStatuses: statuses, lastSuccessfulSyncAt: store.lastSuccessfulSyncAt } }, { status: 502 })
  }
}
