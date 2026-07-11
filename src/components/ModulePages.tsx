import { Badge } from '@/components/DashboardShell'
import { machines, orders } from '@/lib/mock-data'

export const moduleCopy = {
  qr: { active: 'QR & Serial', eyebrow: 'Serial control', title: 'QR & Serial Generation', text: 'Generate serial numbers, QR labels and machine passport tokens from approved Zoho Sales Orders.' },
  wooden: { active: 'Wooden Packing', eyebrow: 'Packing queue', title: 'Wooden Packing', text: 'Track wooden packing requirement, vendor status, QC and issue/rework loop by machine.' },
  media: { active: 'Media Proof', eyebrow: 'Proof before dispatch', title: 'Media Proof', text: 'Collect the required photos and videos before dispatch is unlocked.' },
  vehicle: { active: 'Vehicle / Dispatch', eyebrow: 'Dispatch lock', title: 'Vehicle Dispatch', text: 'Capture transporter, LR/docket, loading proof and warranty start for dispatched machines.' },
  lookup: { active: 'Machine Lookup', eyebrow: 'Passport lookup', title: 'Machine Lookup', text: 'Find machines by serial number, QR token, order, customer or dispatch status.' },
  sync: { active: 'Sync Monitor', eyebrow: 'Zoho health', title: 'Sync Monitor', text: 'Monitor Zoho webhook, backup sync, WorkDrive fallback and conflict handling.' },
}

export function ModuleHeader({ moduleKey }: { moduleKey: keyof typeof moduleCopy }) {
  const item = moduleCopy[moduleKey]
  return <header className="top"><div><div className="eyebrow">{item.eyebrow}</div><h1 className="h1">{item.title}</h1><p className="muted">{item.text}</p></div><button className="btn red">Sync Zoho Now</button></header>
}

export function QueueTable({ kind }: { kind: 'qr' | 'wooden' | 'media' | 'vehicle' | 'lookup' | 'sync' }) {
  return (
    <section className="card">
      <h2>{kind === 'lookup' ? 'Machine records' : 'Live queue'}</h2>
      <div className="desktop-table table-wrap"><table className="table"><thead><tr><th>Serial</th><th>SO</th><th>Customer</th><th>Item</th><th>Status</th><th>Action</th></tr></thead><tbody>{machines.map((m) => <tr key={m.id}><td><strong>{m.serialNumber}</strong></td><td>{m.salesOrderNumber}</td><td>{m.customerName}</td><td>{m.itemName}</td><td><Badge tone={m.status === 'Dispatched' ? 'green' : m.status === 'Review Required' ? 'red' : 'blue'}>{kind === 'wooden' ? m.woodenPacking : kind === 'media' ? `${m.mediaPhotos} photos · ${m.mediaVideos} video` : m.status}</Badge></td><td><a className="btn light" href={`/m/${m.qrToken}`}>Open</a></td></tr>)}</tbody></table></div>
      <div className="mobile-cards module-mobile-list">{machines.map((m) => <article className="card mobile-order-card" key={m.id}><strong>{m.serialNumber}</strong><p className="muted">{m.customerName} · {m.itemName}</p><div className="meta-grid"><div><span>SO</span><strong>{m.salesOrderNumber}</strong></div><div><span>Status</span><strong>{m.status}</strong></div></div><a className="btn light full" href={`/m/${m.qrToken}`}>Open Machine</a></article>)}</div>
    </section>
  )
}

export function SyncSettingsCard() {
  return <section className="card"><h2>Sync health</h2><div className="machine"><div className="machine-row"><span>Zoho webhook</span><Badge tone="green">Ready</Badge></div><div className="machine-row"><span>Backup sync every 10–15 min</span><Badge>Planned</Badge></div><div className="machine-row"><span>WorkDrive media fallback</span><Badge tone="amber">Supported</Badge></div><div className="machine-row"><span>Conflict review</span><Badge tone={orders.some((o) => o.reviewRequired) ? 'red' : 'green'}>{orders.filter((o) => o.reviewRequired).length} pending</Badge></div></div></section>
}
