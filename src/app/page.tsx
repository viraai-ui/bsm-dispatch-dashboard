import { Badge, DashboardShell } from '@/components/DashboardShell'
import { machines, orders } from '@/lib/mock-data'

const totalUnits = machines.length
const dispatched = machines.filter((m) => m.status === 'Dispatched').length
const ready = machines.filter((m) => m.mediaPhotos >= 2 && m.mediaVideos >= 1 && m.status !== 'Dispatched').length
const pendingPacking = machines.filter((m) => m.woodenPacking === 'Pending').length
const mediaPending = machines.filter((m) => m.mediaPhotos < 2 || m.mediaVideos < 1).length
const review = orders.filter((o) => o.reviewRequired).length

const flow = [
  { label: 'QR', value: machines.filter((m) => m.serialNumber).length, tone: 'blue' as const },
  { label: 'Packing', value: machines.filter((m) => m.woodenPacking === 'Completed').length, tone: 'green' as const },
  { label: 'Media', value: machines.filter((m) => m.mediaPhotos >= 2 && m.mediaVideos >= 1).length, tone: 'amber' as const },
  { label: 'Dispatch', value: dispatched, tone: 'green' as const },
]

const queue = [
  { label: 'Packing Pending', value: pendingPacking },
  { label: 'Media Pending', value: mediaPending },
  { label: 'Ready Dispatch', value: ready },
  { label: 'Review', value: review },
]

export default function Home() {
  return (
    <DashboardShell active="Dashboard">
      <header className="top compact-top"><div><h1 className="h1">Dashboard</h1></div><Badge tone="green">Live</Badge></header>
      <section className="grid stats"><Stat label="Orders" value={orders.length} /><Stat label="Machines" value={totalUnits} /><Stat label="Ready" value={ready} /><Stat label="Review" value={review} /></section>
      <section className="grid two analytics-grid">
        <div className="card"><h2>Dispatch Funnel</h2><div className="funnel-chart">{flow.map((item) => <div className="funnel-row" key={item.label}><span>{item.label}</span><div className="bar-track"><i style={{ width: `${Math.max(8, (item.value / totalUnits) * 100)}%` }} /></div><Badge tone={item.tone}>{item.value}</Badge></div>)}</div></div>
        <div className="card"><h2>Queue Load</h2><div className="donut-wrap"><div className="donut" style={{ '--a': `${(pendingPacking / totalUnits) * 100}%`, '--b': `${((pendingPacking + mediaPending) / totalUnits) * 100}%`, '--c': `${((pendingPacking + mediaPending + ready) / totalUnits) * 100}%` } as React.CSSProperties}><strong>{totalUnits}</strong><span>Units</span></div><div className="legend">{queue.map((q) => <div className="machine-row compact" key={q.label}><span>{q.label}</span><strong>{q.value}</strong></div>)}</div></div></div>
      </section>
      <section className="grid three" style={{ marginTop: 16 }}>
        {queue.map((q) => <div className="card module-card" key={q.label}><h2>{q.label}</h2><div className="big-number">{q.value}</div></div>)}
        <div className="card module-card"><h2>Zoho Sync</h2><Badge tone="green">Healthy</Badge></div>
        <div className="card module-card"><h2>Warranty Active</h2><div className="big-number">{machines.filter((m) => m.warrantyStart).length}</div></div>
      </section>
    </DashboardShell>
  )
}
function Stat({ label, value }: { label: string; value: number }) { return <div className="card stat shine-card"><span className="muted">{label}</span><b>{value}</b></div> }
