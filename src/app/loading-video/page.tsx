import { DashboardShell } from '@/components/DashboardShell'
import { MediaProofClient } from '@/components/MediaProofClient'
import { listMediaProofOrders } from '@/lib/media-proof'
import { hasPageAccess } from '@/lib/page-auth'

export const dynamic = 'force-dynamic'

export default async function LoadingVideoPage() {
  const authed = await hasPageAccess(['Admin', 'Operations', 'Media'])
  const { orders, records } = authed ? await listMediaProofOrders('loading') : { orders: [], records: {} }
  return <DashboardShell active="Loading Video"><MediaProofClient title="Loading Video" apiPath="/api/loading-video" mode="loading" initialOrders={orders} initialRecords={records} /></DashboardShell>
}
