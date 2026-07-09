import { Badge } from '@/components/DashboardShell'
import { machines } from '@/lib/mock-data'

export default function PackagingTv() {
  const queue = machines.filter((m) => m.status !== 'Dispatched')

  return (
    <main className="tv">
      <header className="top">
        <div>
          <div className="eyebrow">Packaging TV View</div>
          <h1 className="h1">Today’s Packing Queue</h1>
          <p className="muted">Auto-refresh operational screen. No pricing, GST, payment, invoice value or profit data.</p>
        </div>
        <Badge tone="green">Live · {queue.length} active</Badge>
      </header>
      <section className="tv-grid">
        {queue.map((m, index) => {
          const completedBasics = m.qrPasted && m.qcDone
          return (
            <article className="card" key={m.id}>
              <div className="top" style={{ marginBottom: 10 }}>
                <div>
                  <h2>{m.salesOrderNumber}</h2>
                  <p className="muted">Unit {index + 1} · {m.customerName}</p>
                </div>
                <Badge tone={completedBasics ? 'green' : 'amber'}>{completedBasics ? 'Ready' : 'Pending'}</Badge>
              </div>
              <h3>{m.itemName}</h3>
              <p><strong style={{ fontSize: 24 }}>{m.serialNumber}</strong></p>
              <div className="tabs">
                <Badge>{m.deliveryDate}</Badge>
                <Badge tone={m.woodenPacking === 'Completed' || m.woodenPacking === 'Not Required' ? 'green' : 'amber'}>{m.woodenPacking}</Badge>
                <Badge tone={m.qrPasted ? 'green' : 'amber'}>QR {m.qrPasted ? 'Pasted' : 'Pending'}</Badge>
                <Badge tone={m.qcDone ? 'green' : 'amber'}>QC {m.qcDone ? 'Done' : 'Pending'}</Badge>
              </div>
              <div className="grid" style={{ marginTop: 16 }}>
                <button className="btn">{m.status === 'Packing Done' ? 'Packing Done' : 'Start Packing'}</button>
                <button className="btn light">{m.qrPasted ? 'QR Already Pasted' : 'QR Pasted'}</button>
                <button className="btn light">{m.qcDone ? 'QC Complete' : 'QC Done'}</button>
                <button className="btn red">Issue Found</button>
              </div>
            </article>
          )
        })}
      </section>
    </main>
  )
}
