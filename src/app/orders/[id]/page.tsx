import { DashboardShell, Badge } from '@/components/DashboardShell'
import { orders } from '@/lib/mock-data'
import { notFound } from 'next/navigation'

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const order = orders.find((item) => item.id === id)
  if (!order) notFound()
  const alreadyGenerated = order.machines.length > 0

  return (
    <DashboardShell active="Orders">
      <header className="top compact-top">
        <div>
          <h1 className="h1">{order.salesOrderNumber}</h1>
          <p className="muted">{order.customerName} · Delivery {order.deliveryDate}</p>
        </div>
        <button className="btn red">{alreadyGenerated ? 'Generate Extra Units' : 'Generate Serial + QR'}</button>
      </header>

      {order.reviewRequired && (
        <div className="card alert">
          <Badge tone="red">Review Required</Badge>
          <h2>Zoho order changed.</h2>
          <div className="conflict-actions">
            <button className="btn light">Accept Zoho Changes</button>
            <button className="btn light">Ignore Changes</button>
            <button className="btn light">Generate Extra Units</button>
            <button className="btn red">Resolve with Remarks</button>
          </div>
        </div>
      )}

      <section className="grid two">
        <div className="card">
          <h2>Line Items</h2>
          <div className="desktop-table table-wrap">
            <table className="table">
              <thead><tr><th>Item</th><th>SKU</th><th>Qty</th><th>Wooden</th></tr></thead>
              <tbody>{order.lineItems.map((item) => <tr key={item.sku}><td>{item.itemName}</td><td>{item.sku}</td><td>{item.quantity}</td><td>{item.woodenPackingRequired ? 'Yes' : 'No'}</td></tr>)}</tbody>
            </table>
          </div>
          <div className="mobile-cards">
            {order.lineItems.map((item) => (
              <article className="mobile-order-card" key={item.sku}>
                <div><strong>{item.itemName}</strong><p className="muted">{item.sku}</p></div>
                <div className="meta-grid"><div><span>Quantity</span><strong>{item.quantity}</strong></div><div><span>Wooden</span><strong>{item.woodenPackingRequired ? 'Yes' : 'No'}</strong></div></div>
              </article>
            ))}
          </div>
        </div>
        <div className="card">
          <h2>Actions</h2>
          <div className="machine">
            <button className="btn">QR Labels</button>
            <button className="btn light">Print QR Labels</button>
            <button className="btn light">Send to Packaging</button>
            <button className="btn light">Resolve Conflict</button>
          </div>
        </div>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Machine Units</h2>
        <div className="machine">
          {order.machines.map((m) => (
            <div className="machine-row" key={m.id}>
              <div><strong>{m.serialNumber}</strong><div className="muted">{m.itemName} · {m.sku}</div></div>
              <Badge tone={m.status === 'Dispatched' ? 'green' : m.status === 'Review Required' ? 'red' : 'blue'}>{m.status}</Badge>
              <a className="btn light" href={`/m/${m.serialNumber}`}>Open</a>
            </div>
          ))}
        </div>
      </section>
    </DashboardShell>
  )
}
