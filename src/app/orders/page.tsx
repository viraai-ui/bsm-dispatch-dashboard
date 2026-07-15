import { DashboardShell } from '@/components/DashboardShell'
import { OrdersClient } from '@/components/OrdersClient'

export default function OrdersPage() {
  return <DashboardShell active="Orders"><header className="top compact-top"><div><h1 className="h1">Orders</h1></div></header><OrdersClient orders={[]} live /></DashboardShell>
}
