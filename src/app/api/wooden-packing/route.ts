import { apiOk } from '@/lib/api'
import { fetchZohoOpenOrders, fetchZohoOrderDetail } from '@/lib/zoho'
import { githubReadJson, githubWriteJson } from '@/lib/workflow-store'

type WoodenQueue = { lastSuccessAt?: string; items: { id: string; salesOrderId: string; salesOrderNumber: string; customerName: string; itemName: string; requiredQuantity: number }[] }
const PATH = 'data/wooden-packing-store.json'

export async function GET() {
  const { data } = await githubReadJson<WoodenQueue>(PATH, { items: [] })
  return apiOk({ queue: data })
}

export async function POST() {
  try {
    const summaries = await fetchZohoOpenOrders(100)
    const items = [] as WoodenQueue['items']
    for (const summary of summaries) {
      const order = await fetchZohoOrderDetail(summary.zohoSalesOrderId || summary.id)
      for (const item of order.lineItems) {
        if (!item.woodenPackingRequired || item.pendingQuantity <= 0) continue
        items.push({ id: `${order.id}-${item.id}`, salesOrderId: order.id, salesOrderNumber: order.salesOrderNumber, customerName: order.customerName, itemName: item.itemName, requiredQuantity: item.pendingQuantity })
      }
    }
    const deduped = [...new Map(items.map((item) => [item.id, item])).values()]
    const queue = { lastSuccessAt: new Date().toISOString(), items: deduped }
    await githubWriteJson(PATH, queue, 'Update wooden packing queue')
    return apiOk({ queue })
  } catch (error) {
    console.error('Wooden Packing sync failed', error)
    const { data } = await githubReadJson<WoodenQueue>(PATH, { items: [] })
    return Response.json({ ok: false, error: 'Wooden Packing sync failed. Showing the last successfully synced data.', data: { queue: data } }, { status: 502 })
  }
}
