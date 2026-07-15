import { Badge } from '@/components/DashboardShell'
import { machines, mediaQueue, orders, packagingQueue, vehicleQueue } from '@/lib/mock-data'

export const moduleCopy = {
  qr: { active: 'QR & Serial', title: 'QR & Serial' },
  wooden: { active: 'Wooden Packing', title: 'Wooden Packing' },
  media: { active: 'Media Proof', title: 'Media Proof' },
  vehicle: { active: 'Vehicle / Dispatch', title: 'Vehicle Dispatch' },
  lookup: { active: 'Machine Lookup', title: 'Machine Lookup' },
  sync: { active: 'Sync Monitor', title: 'Sync Monitor' },
}

export function ModuleHeader({ moduleKey }: { moduleKey: keyof typeof moduleCopy }) {
  const item = moduleCopy[moduleKey]
  return <header className="top compact-top"><div><h1 className="h1">{item.title}</h1></div><button className="btn red">Sync Zoho</button></header>
}

export function QueueTable({ kind }: { kind: 'qr' | 'wooden' | 'media' | 'vehicle' | 'lookup' | 'sync' }) {
  const rows = kind === 'media' ? mediaQueue : kind === 'vehicle' ? vehicleQueue : kind === 'wooden' ? packagingQueue : machines
  return (
    <section className="card">
      <h2>{kind === 'lookup' ? 'Machines' : 'Queue'}</h2>
      <div className="desktop-table table-wrap"><table className="table"><thead><tr><th>Serial</th><th>SO</th><th>Customer</th><th>Item</th><th>Status</th><th>Action</th></tr></thead><tbody>{rows.map((m) => <tr key={m.id}><td><strong>{m.serialNumber || 'Pending'}</strong></td><td>{m.salesOrderNumber}</td><td>{m.customerName}</td><td>{m.itemName}</td><td><Badge tone={m.status === 'Dispatched' ? 'green' : m.status === 'Review Required' ? 'red' : 'blue'}>{kind === 'wooden' ? m.woodenPacking : kind === 'media' ? `${m.mediaPhotos}P · ${m.mediaVideos}V` : m.status}</Badge></td><td><a className="btn light" href={`/m/${m.qrToken || m.serialNumber}`}>Open</a></td></tr>)}</tbody></table></div>
      <div className="mobile-cards module-mobile-list">{rows.map((m) => <article className="card mobile-order-card" key={m.id}><strong>{m.serialNumber || 'Pending'}</strong><div className="meta-grid"><div><span>SO</span><strong>{m.salesOrderNumber}</strong></div><div><span>Status</span><strong>{m.status}</strong></div></div><a className="btn light full" href={`/m/${m.qrToken || m.serialNumber}`}>Open</a></article>)}</div>
    </section>
  )
}

export function SyncSettingsCard() {
  return <section className="card"><h2>Sync Health</h2><div className="machine"><div className="machine-row"><span>Zoho Inventory</span><Badge tone={process.env.ZOHO_CLIENT_ID ? 'green' : 'amber'}>{process.env.ZOHO_CLIENT_ID ? 'Ready' : 'Mock'}</Badge></div><div className="machine-row"><span>Fetch rule</span><Badge>Open only</Badge></div><div className="machine-row"><span>Closed orders</span><Badge tone="green">Excluded</Badge></div><div className="machine-row"><span>Conflicts</span><Badge tone={orders.some((o) => o.reviewRequired) ? 'red' : 'green'}>{orders.filter((o) => o.reviewRequired).length}</Badge></div></div></section>
}
