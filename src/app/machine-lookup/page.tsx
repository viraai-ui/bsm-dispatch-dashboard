import { DashboardShell } from '@/components/DashboardShell'
import { Badge } from '@/components/DashboardShell'
import { listSyncedOrders } from '@/lib/synced-orders'
import { hasPageAccess } from '@/lib/page-auth'
import { MachineLookupClient } from '@/components/MachineLookupClient'

export const dynamic = 'force-dynamic'

export default async function MachineLookupPage() {
  const authed = await hasPageAccess(['Admin', 'Operations'])
  const orders = authed ? await listSyncedOrders() : []
  const machines = orders.flatMap((order) => order.machines.map((machine) => ({ order, machine }))).filter(({ machine }) => machine.serialNumber || machine.qrToken)
  return <DashboardShell active="Database">
    <header className="top compact-top"><div><h1 className="h1">Machine Lookup</h1><p className="muted">Find printed QR labels and machine passports</p></div><Badge tone="blue">{machines.length} machines</Badge></header>
    <MachineLookupClient rows={machines} />
  </DashboardShell>
}
