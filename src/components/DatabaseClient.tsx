'use client'

import { useMemo, useState } from 'react'
import { Badge } from '@/components/DashboardShell'

type MachineRecord = {
  id: string
  serialNumber: string
  qrCode: string
  qrToken: string
  salesOrderNumber: string
  customerName: string
  customerAddress: string
  machineName: string
  salesperson: string
  dispatchDate: string
  qrGenerationDate: string
  expectedDeliveryDate: string
  warrantyStatus: string
  order?: { lineItems?: { id: string; itemName: string; sku: string; quantity: number; pendingQuantity: number; woodenPackingRequired: boolean }[] }
}

const MACHINE_DB_KEY = 'bsm.machine.database.v1'

export function DatabaseClient() {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState<MachineRecord | null>(null)
  const [records] = useState<MachineRecord[]>(() => readRecords())
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return records
    return records.filter((record) => [record.serialNumber, record.salesOrderNumber, record.customerName, record.machineName].some((value) => String(value || '').toLowerCase().includes(needle)))
  }, [query, records])

  return <>
    <section className="card search-panel"><input placeholder="Search by serial number" value={query} onChange={(event) => setQuery(event.target.value)} /><Badge tone="blue">{filtered.length} records</Badge></section>
    <div style={{ height: 16 }} />
    <section className="card"><h2>Machine Database</h2><div className="desktop-table table-wrap"><table className="table"><thead><tr><th>Serial</th><th>Machine</th><th>SO</th><th>Customer</th><th>Dispatch</th><th>Warranty</th><th>QR</th><th>Action</th></tr></thead><tbody>{filtered.map((record) => <tr key={record.serialNumber}><td><strong>{record.serialNumber}</strong></td><td>{record.machineName}</td><td>{record.salesOrderNumber}</td><td>{record.customerName}</td><td>{record.dispatchDate}</td><td><Badge tone={record.warrantyStatus.includes('Active') ? 'green' : 'amber'}>{record.warrantyStatus}</Badge></td><td>{record.qrCode ? <img src={record.qrCode} alt="QR" width={48} height={48} /> : '—'}</td><td><button className="btn light" onClick={() => setActive(record)}>View</button></td></tr>)}</tbody></table></div><div className="mobile-cards">{filtered.map((record) => <article className="card mobile-order-card" key={record.serialNumber}><strong>{record.serialNumber}</strong><p className="muted">{record.machineName}</p><div className="meta-grid"><div><span>SO</span><strong>{record.salesOrderNumber}</strong></div><div><span>Warranty</span><strong>{record.warrantyStatus}</strong></div></div><button className="btn light full" onClick={() => setActive(record)}>View</button></article>)}</div></section>
    {active && <RecordModal record={active} onClose={() => setActive(null)} />}
  </>
}

function RecordModal({ record, onClose }: { record: MachineRecord; onClose: () => void }) {
  return <div className="modal-backdrop" role="dialog" aria-modal="true"><section className="order-modal card"><div className="modal-head"><div><h1>{record.serialNumber}</h1><Badge tone={record.warrantyStatus.includes('Active') ? 'green' : 'amber'}>{record.warrantyStatus}</Badge></div><button className="drawer-close" onClick={onClose}>×</button></div>
    <div className="grid two details-grid"><Info k="Machine" v={record.machineName} /><Info k="Sales Order" v={record.salesOrderNumber} /><Info k="Customer" v={record.customerName} /><Info k="Customer Address" v={record.customerAddress || '—'} /><Info k="Salesperson" v={record.salesperson || '—'} /><Info k="Dispatch Date" v={record.dispatchDate} /><Info k="Expected Delivery" v={record.expectedDeliveryDate || '—'} /><Info k="QR Token" v={record.qrToken || '—'} /></div>
    {record.qrCode && <section className="modal-section"><h2>QR Code</h2><img src={record.qrCode} alt={`QR for ${record.serialNumber}`} width={180} height={180} /></section>}
    <section className="modal-section"><h2>Order Details</h2><div className="desktop-table table-wrap"><table className="table"><thead><tr><th>Item</th><th>SKU</th><th>Order Qty</th><th>Pending</th><th>Wooden</th></tr></thead><tbody>{(record.order?.lineItems || []).map((item) => <tr key={item.id}><td>{item.itemName}</td><td>{item.sku}</td><td>{item.quantity}</td><td>{item.pendingQuantity}</td><td>{item.woodenPackingRequired ? 'Yes' : 'No'}</td></tr>)}</tbody></table></div></section>
  </section></div>
}

function Info({ k, v }: { k: string; v: string }) { return <div className="info-tile"><span>{k}</span><strong>{v}</strong></div> }
function readRecords(): MachineRecord[] { try { return JSON.parse(localStorage.getItem(MACHINE_DB_KEY) || '[]') as MachineRecord[] } catch { return [] } }
