import { Badge } from '@/components/DashboardShell'
import { machines, orders } from '@/lib/mock-data'
import { notFound } from 'next/navigation'

export default async function MachinePassport({ params }: { params: Promise<{ qrToken: string }> }) {
  const { qrToken } = await params
  const machine = machines.find((m) => m.qrToken === qrToken || m.serialNumber === qrToken)
  if (!machine) notFound()
  const order = orders.find((item) => item.id === machine.orderId)
  if (!order) notFound()
  const completeMedia = machine.mediaPhotos >= 2 && machine.mediaVideos >= 1

  return (
    <main className="main passport">
      <a className="btn light back-link" href={`/orders/${order.id}`}>← Back to Order</a>
      <header className="passport-header">
        <div>
          <h1 className="h1">{machine.serialNumber}</h1>
          <p className="muted">{machine.itemName} · {machine.salesOrderNumber}</p>
        </div>
        <Badge tone={machine.status === 'Dispatched' ? 'green' : 'blue'}>{machine.status}</Badge>
      </header>

      <section className="grid two">
        <div className="card">
          <h2>Machine Details</h2>
          <div className="machine">
            <Row k="Customer" v={machine.customerName} />
            <Row k="SKU" v={machine.sku} />
            <Row k="Delivery Date" v={machine.deliveryDate} />
            <Row k="QR Pasted" v={machine.qrPasted ? 'Yes' : 'No'} />
            <Row k="QC Done" v={machine.qcDone ? 'Yes' : 'No'} />
            <Row k="Wooden Packing" v={machine.woodenPacking} />
          </div>
        </div>
        <div className="card">
          <h2>Warranty & Dispatch</h2>
          <div className="machine">
            <Row k="Dispatch" v={machine.status === 'Dispatched' ? 'Completed' : 'Pending'} />
            <Row k="Vehicle" v={machine.vehicleNumber ?? 'Pending'} />
            <Row k="Warranty Start" v={machine.warrantyStart ?? '—'} />
            <Row k="Warranty End" v={machine.warrantyEnd ?? '—'} />
            <Row k="Warranty Status" v={machine.warrantyStart ? 'Active' : 'Not Started'} />
          </div>
        </div>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Media Proof</h2>

        <div className="tabs">
          <Badge tone={machine.mediaPhotos >= 2 ? 'green' : 'amber'}>{machine.mediaPhotos}/2 photos</Badge>
          <Badge tone={machine.mediaVideos >= 1 ? 'green' : 'amber'}>{machine.mediaVideos}/1 video</Badge>
          <Badge tone={completeMedia ? 'green' : 'red'}>{completeMedia ? 'Dispatch allowed' : 'Dispatch blocked'}</Badge>
        </div>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Audit</h2>
        <div className="machine">
          <div className="machine-row"><span>Serial generated</span><span className="muted">System</span></div>
          <div className="machine-row"><span>QR label printed</span><span className="muted">Tracked</span></div>
          <div className="machine-row"><span>Zoho sync</span><Badge tone="amber">Pending</Badge></div>
        </div>
      </section>
    </main>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="machine-row"><span className="muted">{k}</span><strong>{v}</strong></div>
}
