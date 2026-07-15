import { DashboardShell } from '@/components/DashboardShell'
import { OrdersClient } from '@/components/OrdersClient'
import { orders } from '@/lib/mock-data'

export default function OrdersPage() {
  return <DashboardShell active="Orders"><header className="top compact-top"><div><h1 className="h1">Orders</h1></div><button className="btn red">Sync Zoho</button></header><OrdersClient orders={orders} /></DashboardShell>
}
