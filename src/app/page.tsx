import { DashboardShell, Badge } from '@/components/DashboardShell'
import { machines, orders } from '@/lib/mock-data'

const tabs = ['QR Pending', 'QR Generated', 'QR Printed', 'Wooden Packing', 'Ready for Packaging', 'Packing Done', 'Media Pending', 'Vehicle Pending', 'Dispatched', 'Review Required']

export default function Home() {
  const readyForDispatch = machines.filter((m) => m.mediaPhotos >= 2 && m.mediaVideos >= 1 && m.status !== 'Dispatched').length

  return (
    <DashboardShell>
      <header className="top">
        <div>
          <div className="eyebrow">BSM India internal dashboard</div>
          <h1 className="h1">Dispatch, Serial Number, QR Label & Machine Passport</h1>
          <p className="muted">Zoho Sales Order → Serial + QR → Packing → Media Proof → Vehicle → Warranty → Passport.</p>
        </div>
        <button className="btn red">Sync Zoho Now</button>
      </header>

      <section className="grid stats">
        <Stat label="Zoho Orders" value={orders.length} />
        <Stat label="Machine Units" value={machines.length} />
        <Stat label="Ready Dispatch" value={readyForDispatch} />
        <Stat label="Review Required" value={orders.filter((o) => o.reviewRequired).length} />
      </section>

      <section id="orders" className="card">
        <h2>Orders</h2>
        <div className="tabs">{tabs.map((t) => <span className="pill" key={t}>{t}</span>)}</div>

        <div className="desktop-table table-wrap">
          <table className="table">
            <thead><tr><th>SO</th><th>Customer</th><th>Delivery</th><th>Units</th><th>Status</th><th>Warning</th><th>Action</th></tr></thead>
            <tbody>{orders.map((o) => <tr key={o.id}><td><strong>{o.salesOrderNumber}</strong></td><td>{o.customerName}</td><td>{o.deliveryDate}</td><td>{o.machines.length}</td><td><Badge tone={o.reviewRequired ? 'red' : o.dashboardStatus === 'Dispatched' ? 'green' : 'blue'}>{o.dashboardStatus}</Badge></td><td>{o.reviewRequired ? <Badge tone="red">Zoho changed after QR</Badge> : <span className="muted">Clear</span>}</td><td><a className="btn light" href={`/orders/${o.id}`}>Open</a></td></tr>)}</tbody>
          </table>
        </div>

        <div className="mobile-cards">
          {orders.map((o) => (
            <article className="card mobile-order-card" key={o.id}>
              <div>
                <strong>{o.salesOrderNumber}</strong>
                <p className="muted">{o.customerName}</p>
              </div>
              <div className="meta-grid">
                <div><span>Delivery</span><strong>{o.deliveryDate}</strong></div>
                <div><span>Units</span><strong>{o.machines.length}</strong></div>
              </div>
              <div className="tabs">
                <Badge tone={o.reviewRequired ? 'red' : o.dashboardStatus === 'Dispatched' ? 'green' : 'blue'}>{o.dashboardStatus}</Badge>
                {o.reviewRequired ? <Badge tone="red">Zoho changed after QR</Badge> : <Badge tone="green">Clear</Badge>}
              </div>
              <a className="btn light full" href={`/orders/${o.id}`}>Open Order</a>
            </article>
          ))}
        </div>
      </section>

      <section className="grid two" id="qr-serial" style={{ marginTop: 16 }}>
        <div className="card">
          <h2>QR & Serial Generation</h2>
          <p className="muted">Backend-only serials with FY prefix, transaction locking, idempotency, QR token URL, print history and reprint audit.</p>
          <div className="label-preview" style={{ marginTop: 16 }}><strong>BSM</strong><div className="qrbox" /><b>Serial: 262700001</b><span>SO-1001 · Belt Conveyor</span><span>Arihant Foods Pvt Ltd</span></div>
        </div>
        <div className="card" id="sync-monitor">
          <h2>Sync Monitor</h2>
          <div className="machine">
            <div className="machine-row"><span>Zoho webhook</span><Badge tone="green">Ready</Badge></div>
            <div className="machine-row"><span>Backup sync every 10–15 min</span><Badge>Planned</Badge></div>
            <div className="machine-row"><span>WorkDrive folder upload</span><Badge tone="amber">Fallback supported</Badge></div>
          </div>
        </div>
      </section>

      <section className="grid three" style={{ marginTop: 16 }}>
        <Module id="wooden-packing" title="Wooden Packing" text="Auto-created from Zoho item custom field. Pending, Ordered, In Progress, Completed, Issue/Rework." action="View packing queue" />
        <Module id="media-proof" title="Media Proof" text="Minimum 2 photos and 1 video before dispatch. Stores WorkDrive metadata, not video blobs." action="Review pending media" />
        <Module id="vehicle-dispatch" title="Vehicle / Dispatch" text="Manual transporter entry, LR/docket, loading photo, dispatch lock, warranty start date." action="Open dispatch queue" />
      </section>
    </DashboardShell>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return <div className="card stat"><span className="muted">{label}</span><b>{value}</b></div>
}

function Module({ id, title, text, action }: { id: string; title: string; text: string; action: string }) {
  return <div className="card" id={id}><h2>{title}</h2><p className="muted">{text}</p><a className="btn light full" style={{ marginTop: 16 }} href={`#${id}`}>{action}</a></div>
}
