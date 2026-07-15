'use client'

import { useMemo, useState } from 'react'
import { Badge } from '@/components/DashboardShell'
import type { Order } from '@/types/domain'
import type { MediaProofRecord } from '@/lib/media-proof'

export function DatabaseClient({ orders = [], mediaRecords = {} }: { orders?: Order[]; mediaRecords?: Record<string, MediaProofRecord> }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState<Order | null>(null)
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return orders
    return orders.filter((order) => [order.salesOrderNumber, order.customerName, order.salesperson, ...order.machines.map((m) => `${m.serialNumber} ${m.itemName}`)].some((value) => String(value || '').toLowerCase().includes(needle)))
  }, [query, orders])

  return <>
    <section className="card search-panel"><input placeholder="Search by Sales Order, serial, customer, machine" value={query} onChange={(event) => setQuery(event.target.value)} /><Badge tone="blue">{filtered.length} orders</Badge></section>
    <div style={{ height: 16 }} />
    <section className="card"><h2>Machine Database</h2><div className="desktop-table table-wrap"><table className="table"><thead><tr><th>SO</th><th>Customer</th><th>Units</th><th>Media</th><th>Action</th></tr></thead><tbody>{filtered.map((order) => <tr key={order.id}><td><strong>{order.salesOrderNumber}</strong></td><td>{order.customerName}</td><td>{order.machines.length}</td><td><Badge tone={mediaRecords[order.id]?.submittedAt ? 'green' : mediaRecords[order.id] ? 'amber' : 'blue'}>{mediaRecords[order.id]?.submittedAt ? 'Submitted' : mediaRecords[order.id] ? 'In Progress' : 'No Media'}</Badge></td><td><button className="btn light" onClick={() => setActive(order)}>View</button></td></tr>)}</tbody></table></div></section>
    {active && <RecordModal order={active} media={mediaRecords[active.id]} onClose={() => setActive(null)} />}
  </>
}

function RecordModal({ order, media, onClose }: { order: Order; media?: MediaProofRecord; onClose: () => void }) {
  return <div className="modal-backdrop" role="dialog" aria-modal="true"><section className="order-modal card"><div className="modal-head"><div><h1>{order.salesOrderNumber}</h1><p className="muted">{order.customerName}</p></div><button className="drawer-close" onClick={onClose}>×</button></div>
    <div className="grid two details-grid"><Info k="Customer" v={order.customerName} /><Info k="Salesperson" v={order.salesperson || '—'} /><Info k="Address" v={order.shippingAddress || '—'} /><Info k="Delivery" v={order.deliveryDate || '—'} /></div>
    <section className="modal-section"><h2>Units & Media</h2><div className="desktop-table table-wrap"><table className="table"><thead><tr><th>Unit</th><th>Serial</th><th>Videos</th></tr></thead><tbody>{order.machines.map((machine) => <tr key={machine.id}><td>{machine.itemName}</td><td>{machine.serialNumber || '—'}</td><td>{(media?.units?.[machine.id]?.videos || []).map((file) => <a key={file.id} href={file.workdriveUrl || file.url} target="_blank">{file.name} </a>)}</td></tr>)}</tbody></table></div></section>
  </section></div>
}

function Info({ k, v }: { k: string; v: string }) { return <div className="info-tile"><span>{k}</span><strong>{v}</strong></div> }
