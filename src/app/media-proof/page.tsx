import { DashboardShell } from '@/components/DashboardShell'
import { MediaProofClient } from '@/components/MediaProofClient'
import { listMediaProofOrders } from '@/lib/media-proof'

export const dynamic = 'force-dynamic'

export default async function MediaProofPage() {
  const { orders, records } = await listMediaProofOrders()
  return <DashboardShell active="Media Proof"><MediaProofClient initialOrders={orders} initialRecords={records} /></DashboardShell>
}
