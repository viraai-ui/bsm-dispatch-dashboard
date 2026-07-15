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
    const fallback = mockOrders.find((item) => item.id === id || item.zohoSalesOrderId === id)
    if (fallback) return apiOk({ source: 'zoho_error_mock_fallback', error: error instanceof Error ? error.message : 'Zoho fetch failed', order: fallback })
    return apiError(error instanceof Error ? error.message : 'Order not found', 404)
  }
}
