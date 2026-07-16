import { DashboardShell } from '@/components/DashboardShell'
import { VehicleLauncherClient } from '@/components/VehicleLauncherClient'
import { readDispatchStore } from '@/lib/order-stage'
import { readMediaProofStore } from '@/lib/media-proof'
import { listSyncedOrders } from '@/lib/synced-orders'

export const dynamic = 'force-dynamic'

export default async function VehicleDispatchPage() {
  const orders = await listSyncedOrders()
  const media = await readMediaProofStore()
  const dispatch = await readDispatchStore()
  const ready = orders.filter((order) => media.records[order.id]?.submittedAt && !dispatch.dispatched[order.id])
  return <DashboardShell active="Vehicle & Transportation">
    <main className="vehicle-launcher-page">
      <section className="vehicle-launcher-hero"><h1 className="h1">Vehicle & Transportation</h1></section>
      <VehicleLauncherClient initialOrders={ready} />
    </main>
  </DashboardShell>
}
