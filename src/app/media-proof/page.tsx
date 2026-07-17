import { DashboardShell } from '@/components/DashboardShell'
import { MediaProofClient } from '@/components/MediaProofClient'
import { listMediaProofOrders } from '@/lib/media-proof'

import { hasPageAccess } from '@/lib/page-auth'

export const dynamic = 'force-dynamic'

export default async function MediaProofPage() {
  const authed = await hasPageAccess(['Admin', 'Operations', 'Media'])
  const { orders, records } = authed ? await listMediaProofOrders() : { orders: [], records: {} }
  return <DashboardShell active="Video Upload"><MediaProofClient initialOrders={orders} initialRecords={records} /></DashboardShell>
}
