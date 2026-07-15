import { DashboardShell } from '@/components/DashboardShell'
import { VehicleLauncherClient } from '@/components/VehicleLauncherClient'

export default function VehicleDispatchPage() {
  return <DashboardShell active="Vehicle / Dispatch">
    <main className="vehicle-launcher-page">
      <section className="vehicle-launcher-hero">
        <h1 className="h1">Vehicle / Dispatch</h1>
      </section>
      <VehicleLauncherClient />
    </main>
  </DashboardShell>
}
