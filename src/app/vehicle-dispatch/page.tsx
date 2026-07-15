import { DashboardShell } from '@/components/DashboardShell'
import { VehicleLauncherClient } from '@/components/VehicleLauncherClient'

export default function VehicleDispatchPage() {
  return <DashboardShell active="Vehicle / Dispatch">
    <main className="vehicle-launcher-page">
      <section className="vehicle-launcher-hero">
        <span className="eyebrow">Transport Apps</span>
        <h1 className="h1">Vehicle / Dispatch</h1>
        <p className="muted">Quick access to trusted third-party vehicle booking platforms inside the dashboard.</p>
      </section>
      <VehicleLauncherClient />
    </main>
  </DashboardShell>
}
