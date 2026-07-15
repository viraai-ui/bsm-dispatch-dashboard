import { DashboardShell } from '@/components/DashboardShell'
import { OrdersClient } from '@/components/OrdersClient'
import { orders as mockOrders } from '@/lib/mock-data'
import { fetchZohoOpenOrders, zohoConfigured } from '@/lib/zoho'

export const dynamic = 'force-dynamic'

async function getOrders() {
  if (!zohoConfigured()) return mockOrders
  try { return await fetchZohoOpenOrders() } catch { return mockOrders }
}

export default async function OrdersPage() {
  const orders = await getOrders()
  return <DashboardShell active="Orders"><header className="top compact-top"><div><h1 className="h1">Orders</h1></div><button className="btn red">Sync Zoho</button></header><OrdersClient orders={orders} /></DashboardShell>
}
