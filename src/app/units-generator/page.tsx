import { DashboardShell } from '@/components/DashboardShell'
import { UnitsGeneratorClient } from '@/components/UnitsGeneratorClient'
import { listSyncedOrders } from '@/lib/synced-orders'
import { hasPageAccess } from '@/lib/page-auth'

export const dynamic = 'force-dynamic'

export default async function UnitsGeneratorPage() {
  const authed = await hasPageAccess(['Admin', 'Operations'])
  const orders = authed ? await listSyncedOrders() : []
  return <DashboardShell active="Units Generator"><UnitsGeneratorClient orders={orders} /></DashboardShell>
}
