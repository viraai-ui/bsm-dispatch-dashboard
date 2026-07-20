import { DashboardShell } from '@/components/DashboardShell'
import { VehicleLauncherClient } from '@/components/VehicleLauncherClient'

export const dynamic = 'force-dynamic'

export default async function VehicleDispatchPage() {
  return <DashboardShell active="Vehicle & Transportation">
    <main className="vehicle-launcher-page">
      <section className="vehicle-launcher-hero"><h1 className="h1">Vehicle & Transportation</h1></section>
      <VehicleLauncherClient />
    </main>
  </DashboardShell>
}
