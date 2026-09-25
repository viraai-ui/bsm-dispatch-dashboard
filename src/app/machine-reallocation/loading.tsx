import { DashboardShell } from '@/components/DashboardShell'

export default function MachineReallocationLoading() {
  return <DashboardShell active="Machine Reallocation">
    <div className="reallocation-page" aria-busy="true" aria-label="Loading Machine Reallocation">
      <header className="page-head reallocation-page-head">
        <div><span className="eyebrow">Serial-safe operations</span><h1>Machine Reallocation</h1><p>Loading reallocation queue…</p></div>
      </header>
      <div className="card reallocation-loading">
        <div className="reallocation-loading-bar" />
        <div className="reallocation-loading-bar" />
        <div className="reallocation-loading-bar" />
      </div>
    </div>
  </DashboardShell>
}
