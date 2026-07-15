import { apiOk } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { readSyncedOrdersStore } from '@/lib/synced-orders'

type WoodenQueue = { lastSuccessAt?: string | null; items: { id: string; salesOrderId: string; salesOrderNumber: string; customerName: string; itemName: string; requiredQuantity: number }[] }

async function buildQueue(): Promise<WoodenQueue> {
  const store = await readSyncedOrdersStore()
  const items: WoodenQueue['items'] = []
  for (const id of store.orderIds) {
    const order = store.orders[id]
    if (!order) continue
    for (const item of order.lineItems) {
      if (!item.woodenPackingRequired || item.pendingQuantity <= 0) continue
      items.push({ id: `${order.id}-${item.id}`, salesOrderId: order.id, salesOrderNumber: order.salesOrderNumber, customerName: order.customerName, itemName: item.itemName, requiredQuantity: item.pendingQuantity })
    }
  }
  return { lastSuccessAt: store.lastSuccessfulSyncAt, items }
}

export async function GET() {
  const auth = await requireUser(['Admin', 'Operations'])
  if (!auth.ok) return auth.response
  return apiOk({ queue: await buildQueue() })
}

export async function POST() {
  const auth = await requireUser(['Admin', 'Operations'])
  if (!auth.ok) return auth.response
  return apiOk({ queue: await buildQueue() })
}
