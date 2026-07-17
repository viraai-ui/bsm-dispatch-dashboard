import { DashboardShell } from '@/components/DashboardShell'
import { OrdersClient } from '@/components/OrdersClient'
import { listSyncedOrders } from '@/lib/synced-orders'

import { hasPageAccess } from '@/lib/page-auth'

export const dynamic = 'force-dynamic'

export default async function OrdersPage() {
  const authed = await hasPageAccess(['Admin', 'Operations'])
  const orders = authed ? await listSyncedOrders() : []
  return <DashboardShell active="Orders"><header className="top compact-top"><div><h1 className="h1">Orders</h1></div></header><OrdersClient orders={orders} live={authed} /></DashboardShell>
}
