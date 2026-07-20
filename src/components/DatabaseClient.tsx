'use client'

import { useMemo, useState } from 'react'
import { Badge } from '@/components/DashboardShell'
import type { Order } from '@/types/domain'
import type { MediaProofRecord } from '@/lib/media-proof'
import type { OrderStatusProjection } from '@/lib/status-projection'

export function DatabaseClient({ orders = [], mediaRecords = {}, statuses = {} }: { orders?: Order[]; mediaRecords?: Record<string, MediaProofRecord>; statuses?: Record<string, OrderStatusProjection> }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState<Order | null>(null)
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return orders
    return orders.filter((order) => [order.salesOrderNumber, order.customerName, order.salesperson, statuses[order.id]?.lifecycleLabel, statuses[order.id]?.mediaLabel, ...order.machines.map((m) => `${m.serialNumber} ${m.itemName}`)].some((value) => String(value || '').toLowerCase().includes(needle)))
  }, [query, orders, statuses])

  return <>
    <section className="card search-panel database-search-panel"><input placeholder="Search SO, serial, customer…" value={query} onChange={(event) => setQuery(event.target.value)} /><Badge tone="blue">{filtered.length}</Badge></section>
    <section className="card database-list-card"><h2>Database</h2><div className="desktop-table table-wrap"><table className="table"><thead><tr><th>SO</th><th>Customer</th><th>Units</th><th>Order Stage</th><th>Media</th><th>Action</th></tr></thead><tbody>{filtered.map((order) => { const status = statuses[order.id]; return <tr key={order.id}><td><strong>{order.salesOrderNumber}</strong></td><td>{order.customerName}</td><td>{order.machines.length}</td><td><Badge tone={status?.lifecycleTone || 'gray'}>{status?.lifecycleLabel || 'Open'}</Badge></td><td><Badge tone={status?.mediaTone || 'gray'}>{status?.mediaLabel || 'No Media'}</Badge></td><td><button className="btn light" onClick={() => setActive(order)}>View</button></td></tr> })}</tbody></table></div><div className="mobile-cards">{filtered.map((order) => { const status = statuses[order.id]; return <article className="card mobile-order-card database-mobile-card mobile-order-tap-card compact-operational-card" key={order.id} onClick={() => setActive(order)}><div className="compact-card-main"><strong>{order.salesOrderNumber}</strong><p className="muted">{order.customerName}</p><Badge tone={status?.lifecycleTone || 'gray'}>{status?.lifecycleLabel || 'Open'}</Badge></div><div className="compact-card-side"><div><span>Units</span><strong>{order.machines.length}</strong></div><div><span>Media</span><strong>{status?.mediaLabel || 'No Media'}</strong></div><button className="btn light compact-view-btn" onClick={(event) => { event.stopPropagation(); setActive(order) }}>View</button></div></article> })}</div></section>
    {active && <RecordModal order={active} media={mediaRecords[active.id]} status={statuses[active.id]} onClose={() => setActive(null)} />}
  </>
}

function RecordModal({ order, media, status, onClose }: { order: Order; media?: MediaProofRecord; status?: OrderStatusProjection; onClose: () => void }) {
  return <div className="modal-backdrop" role="dialog" aria-modal="true"><section className="order-modal card"><div className="modal-head"><div><h1>{order.salesOrderNumber}</h1><p className="muted">{order.customerName}</p></div><button className="drawer-close" onClick={onClose}>×</button></div>
    <div className="grid two details-grid"><Info k="Order Stage" v={status?.lifecycleLabel || 'Open'} /><Info k="Media" v={status?.mediaLabel || 'No Media'} /><Info k="Customer" v={order.customerName} /><Info k="Salesperson" v={order.salesperson || '—'} /><Info k="Address" v={order.shippingAddress || '—'} /><Info k="Delivery" v={order.deliveryDate || '—'} /></div>
    <section className="modal-section"><h2>Units & Media</h2><div className="desktop-table table-wrap"><table className="table"><thead><tr><th>Unit</th><th>Serial</th><th>Videos</th></tr></thead><tbody>{order.machines.map((machine) => <tr key={machine.id}><td>{machine.itemName}</td><td>{machine.serialNumber || '—'}</td><td>{(media?.units?.[machine.id]?.videos || []).map((file) => <a key={file.id} href={file.workdriveUrl || file.url} target="_blank">{file.name} </a>)}</td></tr>)}</tbody></table></div></section>
  </section></div>
}

function Info({ k, v }: { k: string; v: string }) { return <div className="info-tile"><span>{k}</span><strong>{v}</strong></div> }
