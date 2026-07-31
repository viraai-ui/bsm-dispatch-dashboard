import { DashboardShell } from '@/components/DashboardShell'
import { ReadyToShipClient } from '@/components/ReadyToShipClient'
import { hasPageAccess } from '@/lib/page-auth'
import { listReadyToShipItems, readTransportersStore } from '@/lib/ready-to-ship'

export const dynamic = 'force-dynamic'

export default async function ReadyToShipPage() {
  const authed = await hasPageAccess(['Admin'])
  const [items, transporters] = authed ? await Promise.all([listReadyToShipItems(), readTransportersStore()]) : [[], { transporters: [] }]
  return <DashboardShell active="Ready to Ship"><ReadyToShipClient initialItems={items} initialTransporters={transporters.transporters} /></DashboardShell>
}
