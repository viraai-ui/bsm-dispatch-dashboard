import { Badge, DashboardShell } from '@/components/DashboardShell'
import { machines, orders } from '@/lib/mock-data'

export default function Home() {
  const readyForDispatch = machines.filter((m) => m.mediaPhotos >= 2 && m.mediaVideos >= 1 && m.status !== 'Dispatched').length
  return (
    <DashboardShell>
      <header className="top compact-top"><div><h1 className="h1">Dispatch Dashboard</h1></div><button className="btn red">Sync Zoho</button></header>
      <section className="grid stats"><Stat label="Zoho Orders" value={orders.length} /><Stat label="Machine Units" value={machines.length} /><Stat label="Ready Dispatch" value={readyForDispatch} /><Stat label="Review Required" value={orders.filter((o) => o.reviewRequired).length} /></section>
      <section id="orders" className="card"><h2>Orders</h2><div className="desktop-table table-wrap"><table className="table"><thead><tr><th>SO</th><th>Customer</th><th>Delivery</th><th>Units</th><th>Status</th><th>Warning</th><th>Action</th></tr></thead><tbody>{orders.map((o) => <tr key={o.id}><td><strong>{o.salesOrderNumber}</strong></td><td>{o.customerName}</td><td>{o.deliveryDate}</td><td>{o.machines.length}</td><td><Badge tone={o.reviewRequired ? 'red' : o.dashboardStatus === 'Dispatched' ? 'green' : 'blue'}>{o.dashboardStatus}</Badge></td><td>{o.reviewRequired ? <Badge tone="red">Zoho changed</Badge> : <span className="muted">Clear</span>}</td><td><a className="btn light" href={`/orders/${o.id}`}>Open</a></td></tr>)}</tbody></table></div><div className="mobile-cards">{orders.map((o) => <article className="card mobile-order-card" key={o.id}><div><strong>{o.salesOrderNumber}</strong><p className="muted">{o.customerName}</p></div><div className="meta-grid"><div><span>Delivery</span><strong>{o.deliveryDate}</strong></div><div><span>Units</span><strong>{o.machines.length}</strong></div></div><div className="tabs"><Badge tone={o.reviewRequired ? 'red' : o.dashboardStatus === 'Dispatched' ? 'green' : 'blue'}>{o.dashboardStatus}</Badge>{o.reviewRequired ? <Badge tone="red">Zoho changed</Badge> : <Badge tone="green">Clear</Badge>}</div><a className="btn light full" href={`/orders/${o.id}`}>Open</a></article>)}</div></section>
      <section className="grid three" style={{ marginTop: 16 }}><Module href="/qr-serial" title="QR & Serial" action="Open" /><Module href="/wooden-packing" title="Wooden Packing" action="Open" /><Module href="/media-proof" title="Media Proof" action="Open" /><Module href="/vehicle-dispatch" title="Vehicle Dispatch" action="Open" /><Module href="/machine-lookup" title="Machine Lookup" action="Open" /><Module href="/sync-monitor" title="Sync Monitor" action="Open" /></section>
    </DashboardShell>
  )
}
function Stat({ label, value }: { label: string; value: number }) { return <div className="card stat shine-card"><span className="muted">{label}</span><b>{value}</b></div> }
function Module({ href, title, action }: { href: string; title: string; action: string }) { return <div className="card module-card"><h2>{title}</h2><a className="btn light full" style={{ marginTop: 16 }} href={href}>{action}</a></div> }
