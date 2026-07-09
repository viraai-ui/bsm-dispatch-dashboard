import { Badge } from '@/components/DashboardShell'
import { machines } from '@/lib/mock-data'

export default async function MachinePassport({ params }: { params: Promise<{ qrToken: string }> }) {
  const { qrToken } = await params
  const machine = machines.find((m) => m.serialNumber === qrToken) ?? machines[0]
  const completeMedia = machine.mediaPhotos >= 2 && machine.mediaVideos >= 1

  return (
    <main className="main passport">
      <a className="btn light back-link" href={`/orders/${machine.salesOrderNumber === 'SO-1001' ? 'so-1001' : 'so-1002'}`}>← Back to Order</a>
      <header className="passport-header">
        <div>
          <div className="eyebrow">Machine Passport</div>
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
        <p className="muted">WorkDrive metadata only. Photos/videos stay in Zoho WorkDrive.</p>
        <div className="tabs">
          <Badge tone={machine.mediaPhotos >= 2 ? 'green' : 'amber'}>{machine.mediaPhotos}/2 photos</Badge>
          <Badge tone={machine.mediaVideos >= 1 ? 'green' : 'amber'}>{machine.mediaVideos}/1 video</Badge>
          <Badge tone={completeMedia ? 'green' : 'red'}>{completeMedia ? 'Dispatch allowed' : 'Dispatch blocked'}</Badge>
        </div>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Audit Timeline</h2>
        <div className="machine">
          <div className="machine-row"><span>Serial generated from backend FY counter</span><span className="muted">System · pending live DB timestamp</span></div>
          <div className="machine-row"><span>QR label print/reprint history</span><span className="muted">Tracked per print job</span></div>
          <div className="machine-row"><span>Zoho sync status</span><Badge tone="amber">Pending sandbox test</Badge></div>
        </div>
      </section>
    </main>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="machine-row"><span className="muted">{k}</span><strong>{v}</strong></div>
}
