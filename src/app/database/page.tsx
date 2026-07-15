import { DashboardShell } from '@/components/DashboardShell'
import { DatabaseClient } from '@/components/DatabaseClient'
import { listSyncedOrders } from '@/lib/synced-orders'
import { readMediaProofStore } from '@/lib/media-proof'

export const dynamic = 'force-dynamic'

export default async function DatabasePage() {
  const orders = await listSyncedOrders()
  const media = await readMediaProofStore()
  return <DashboardShell active="Database"><header className="top compact-top"><div><h1 className="h1">Database</h1></div></header><DatabaseClient orders={orders} mediaRecords={media.records} /></DashboardShell>
}
