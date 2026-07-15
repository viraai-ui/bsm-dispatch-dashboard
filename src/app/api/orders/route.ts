import { apiError, apiOk } from '@/lib/api'
import { orders as mockOrders } from '@/lib/mock-data'
import { fetchZohoOpenOrders, zohoConfigured } from '@/lib/zoho'

export async function GET() {
  if (!zohoConfigured()) {
    return apiOk({ source: 'mock_open_orders_until_zoho_credentials', orders: mockOrders })
  }
  try {
    const orders = await fetchZohoOpenOrders()
    return apiOk({ source: 'zoho_inventory_live', rule: 'open_and_partially_shipped_only_closed_excluded', orders })
  } catch (error) {
    return apiError(error instanceof Error ? `Zoho sync failed: ${error.message}` : 'Zoho sync failed', 502)
  }
}
