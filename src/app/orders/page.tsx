import { Badge, DashboardShell } from '@/components/DashboardShell'
import { orders } from '@/lib/mock-data'

export default function OrdersPage() {
  return (
    <DashboardShell active="Orders">
      <header className="top compact-top"><div><h1 className="h1">Orders</h1></div><button className="btn red">Sync Zoho</button></header>
      <section className="card"><h2>Sales Orders</h2><div className="desktop-table table-wrap"><table className="table"><thead><tr><th>SO</th><th>Customer</th><th>Delivery</th><th>Units</th><th>Status</th><th>Warning</th><th>Action</th></tr></thead><tbody>{orders.map((o) => <tr key={o.id}><td><strong>{o.salesOrderNumber}</strong></td><td>{o.customerName}</td><td>{o.deliveryDate}</td><td>{o.machines.length}</td><td><Badge tone={o.reviewRequired ? 'red' : o.dashboardStatus === 'Dispatched' ? 'green' : 'blue'}>{o.dashboardStatus}</Badge></td><td>{o.reviewRequired ? <Badge tone="red">Zoho changed</Badge> : <span className="muted">Clear</span>}</td><td><a className="btn light" href={`/orders/${o.id}`}>Open</a></td></tr>)}</tbody></table></div><div className="mobile-cards">{orders.map((o) => <article className="card mobile-order-card" key={o.id}><div><strong>{o.salesOrderNumber}</strong><p className="muted">{o.customerName}</p></div><div className="meta-grid"><div><span>Delivery</span><strong>{o.deliveryDate}</strong></div><div><span>Units</span><strong>{o.machines.length}</strong></div></div><div className="tabs"><Badge tone={o.reviewRequired ? 'red' : o.dashboardStatus === 'Dispatched' ? 'green' : 'blue'}>{o.dashboardStatus}</Badge>{o.reviewRequired ? <Badge tone="red">Zoho changed</Badge> : <Badge tone="green">Clear</Badge>}</div><a className="btn light full" href={`/orders/${o.id}`}>Open</a></article>)}</div></section>
    </DashboardShell>
  )
}
