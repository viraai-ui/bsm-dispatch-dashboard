import { DashboardShell } from '@/components/DashboardShell'
import { DatabaseClient } from '@/components/DatabaseClient'
import { listSyncedOrders } from '@/lib/synced-orders'
import { buildOrderStatusMap } from '@/lib/status-projection'

export const dynamic = 'force-dynamic'

export default async function DatabasePage() {
  const orders = await listSyncedOrders()
  const { statuses, mediaRecords } = await buildOrderStatusMap(orders)
  return <DashboardShell active="Database"><header className="top compact-top"><div><h1 className="h1">Database</h1></div></header><DatabaseClient orders={orders} mediaRecords={mediaRecords} statuses={statuses} /></DashboardShell>
}
