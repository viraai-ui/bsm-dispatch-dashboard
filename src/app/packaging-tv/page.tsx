import { Badge } from '@/components/DashboardShell'
import { packagingQueue } from '@/lib/mock-data'

export default function PackagingTv() {
  const queue = packagingQueue
  return (
    <main className="tv">
      <header className="top"><div><h1 className="h1">Packaging TV</h1></div><Badge tone="green">{queue.length} active</Badge></header>
      <section className="tv-grid">
        {queue.map((m) => <article className="card" key={m.id}><div className="top" style={{ marginBottom: 10 }}><div><h2>{m.salesOrderNumber}</h2><p className="muted">Unit {m.unitNumber} · {m.customerName}</p></div><Badge tone={m.status === 'Packing Done' ? 'green' : 'amber'}>{m.status === 'Packing Done' ? 'Done' : 'Pending'}</Badge></div><h3>{m.itemName}</h3><p><strong style={{ fontSize: 24 }}>{m.serialNumber}</strong></p><div className="tabs"><Badge>{m.deliveryDate}</Badge><Badge tone={m.woodenPacking === 'Completed' || m.woodenPacking === 'Not Required' ? 'green' : 'amber'}>{m.woodenPacking}</Badge><Badge tone={m.qrPasted ? 'green' : 'amber'}>QR</Badge><Badge tone={m.qcDone ? 'green' : 'amber'}>QC</Badge></div><div className="grid" style={{ marginTop: 16 }}><button className="btn">Mark Packing Complete</button><button className="btn light">QR Pasted</button><button className="btn light">QC Done</button><button className="btn red">Issue</button></div></article>)}
      </section>
    </main>
  )
}
