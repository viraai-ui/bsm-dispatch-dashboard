import { apiError, apiOk } from '@/lib/api'
import { orders as mockOrders } from '@/lib/mock-data'
import { fetchZohoOrderDetail, zohoConfigured } from '@/lib/zoho'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!zohoConfigured()) {
    const order = mockOrders.find((item) => item.id === id || item.zohoSalesOrderId === id)
    return order ? apiOk({ source: 'mock', order }) : apiError('Order not found', 404)
  }
  try {
    const order = await fetchZohoOrderDetail(id)
    return apiOk({ source: 'zoho_inventory_live', order })
  } catch (error) {
    return apiError(error instanceof Error ? `Zoho order detail failed: ${error.message}` : 'Order not found', 502)
  }
}
