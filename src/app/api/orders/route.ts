import { apiOk } from '@/lib/api'
import { orders } from '@/lib/mock-data'

export async function GET() {
  const hasZohoEnv = Boolean(process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET && process.env.ZOHO_REFRESH_TOKEN && process.env.ZOHO_ORGANIZATION_ID)
  return apiOk({
    source: hasZohoEnv ? 'zoho_ready_env_present' : 'mock_open_orders_until_zoho_credentials',
    rule: 'fetch_open_and_partially_shipped_orders_only_closed_orders_excluded',
    orders: orders.filter((order) => order.status === 'open' || order.status === 'partially_shipped'),
  })
}
