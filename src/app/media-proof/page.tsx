import { DashboardShell } from '@/components/DashboardShell'
import { MediaProofClient } from '@/components/MediaProofClient'
import { listMediaProofOrders } from '@/lib/media-proof'
import { hasPageAccess } from '@/lib/page-auth'

export const dynamic = 'force-dynamic'

export default async function MediaProofPage() {
  const authed = await hasPageAccess(['Admin', 'Media'])
  const { orders, records } = authed ? await listMediaProofOrders('packing') : { orders: [], records: {} }
  return <DashboardShell active="Packing Video"><MediaProofClient title="Packing Video" apiPath="/api/media-proof" initialOrders={orders} initialRecords={records} /></DashboardShell>
}
