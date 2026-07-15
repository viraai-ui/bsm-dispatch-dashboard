import { apiError, apiOk } from '@/lib/api'
import { orders as mockOrders } from '@/lib/mock-data'
import { fetchZohoOpenOrders, zohoConfigured } from '@/lib/zoho'

export async function GET(request: Request) {
  if (!zohoConfigured()) {
    return apiOk({ source: 'mock_open_orders_until_zoho_credentials', orders: mockOrders })
  }
  try {
    const url = new URL(request.url)
    const full = url.searchParams.get('full') === '1'
    const orders = await fetchZohoOpenOrders(full ? 100 : 2)
    return apiOk({ source: 'zoho_inventory_live', rule: 'open_and_partially_shipped_only_closed_excluded', mode: full ? 'full' : 'fast', orders })
  } catch (error) {
    return apiError(error instanceof Error ? `Zoho sync failed: ${error.message}` : 'Zoho sync failed', 502)
  }
}
