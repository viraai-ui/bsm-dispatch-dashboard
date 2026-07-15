import { DashboardShell } from '@/components/DashboardShell'
import { OrdersClient } from '@/components/OrdersClient'
import { listSyncedOrders } from '@/lib/synced-orders'

export const dynamic = 'force-dynamic'

export default async function OrdersPage() {
  const orders = await listSyncedOrders()
  return <DashboardShell active="Orders"><header className="top compact-top"><div><h1 className="h1">Orders</h1></div></header><OrdersClient orders={orders} live /></DashboardShell>
}
