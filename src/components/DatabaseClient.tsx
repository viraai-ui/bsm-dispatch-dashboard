'use client'

import { useMemo, useState } from 'react'
import { Badge } from '@/components/DashboardShell'
import type { Order } from '@/types/domain'
import type { MediaProofRecord } from '@/lib/media-proof'
import type { OrderStatusProjection } from '@/lib/status-projection'

type WarrantyInfo = { label: 'Warranty Valid' | 'Warranty Ended' | 'Warranty Not Started'; tone: 'green' | 'red' | 'gray'; startLabel: string; endLabel: string }

export function DatabaseClient({ orders = [], mediaRecords = {}, statuses = {}, warrantyDates = {} }: { orders?: Order[]; mediaRecords?: Record<string, MediaProofRecord>; statuses?: Record<string, OrderStatusProjection>; warrantyDates?: Record<string, string> }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState<Order | null>(null)
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return orders
    return orders.filter((order) => { const warranty = warrantyInfo(warrantyDates[order.id]); return [order.salesOrderNumber, order.customerName, order.salesperson, statuses[order.id]?.lifecycleLabel, statuses[order.id]?.mediaLabel, warranty.label, warranty.startLabel, warranty.endLabel, ...order.machines.map((m) => `${m.serialNumber} ${m.itemName}`)].some((value) => String(value || '').toLowerCase().includes(needle)) })
  }, [query, orders, statuses, warrantyDates])

  return <>
    <section className="card search-panel database-search-panel"><input placeholder="Search SO, serial, customer…" value={query} onChange={(event) => setQuery(event.target.value)} /><Badge tone="blue">{filtered.length}</Badge></section>
    <section className="card database-list-card"><h2>Database</h2><div className="desktop-table table-wrap"><table className="table"><thead><tr><th>SO</th><th>Customer</th><th>Units</th><th>Order Stage</th><th>Media</th><th>Action</th></tr></thead><tbody>{filtered.map((order) => { const status = statuses[order.id]; return <tr key={order.id}><td><strong>{order.salesOrderNumber}</strong></td><td>{order.customerName}</td><td>{order.machines.length}</td><td><Badge tone={status?.lifecycleTone || 'gray'}>{status?.lifecycleLabel || 'Open'}</Badge></td><td><Badge tone={status?.mediaTone || 'gray'}>{status?.mediaLabel || 'No Media'}</Badge></td><td><button className="btn light" onClick={() => setActive(order)}>View</button></td></tr> })}</tbody></table></div><div className="mobile-cards">{filtered.map((order) => { const status = statuses[order.id]; return <article className="card mobile-order-card database-mobile-card mobile-order-tap-card compact-operational-card" key={order.id} onClick={() => setActive(order)}><div className="compact-card-main"><strong>{order.salesOrderNumber}</strong><p className="muted">{order.customerName}</p><Badge tone={status?.lifecycleTone || 'gray'}>{status?.lifecycleLabel || 'Open'}</Badge></div><div className="compact-card-side"><div><span>Units</span><strong>{order.machines.length}</strong></div><div><span>Media</span><strong>{status?.mediaLabel || 'No Media'}</strong></div><button className="btn light compact-view-btn" onClick={(event) => { event.stopPropagation(); setActive(order) }}>View</button></div></article> })}</div></section>
    {active && <RecordModal order={active} media={mediaRecords[active.id]} status={statuses[active.id]} warrantyDate={warrantyDates[active.id]} onClose={() => setActive(null)} />}
  </>
}

function RecordModal({ order, media, status, warrantyDate, onClose }: { order: Order; media?: MediaProofRecord; status?: OrderStatusProjection; warrantyDate?: string; onClose: () => void }) {
  const warranty = warrantyInfo(warrantyDate)
  return <div className="modal-backdrop" role="dialog" aria-modal="true"><section className="order-modal card"><div className="modal-head"><div><h1>{order.salesOrderNumber}</h1><p className="muted">{order.customerName}</p></div><button className="drawer-close" onClick={onClose}>×</button></div>
    <div className="grid two details-grid"><Info k="Order Stage" v={status?.lifecycleLabel || 'Open'} /><Info k="Media" v={status?.mediaLabel || 'No Media'} /><Info k="Warranty Until" v={warranty.endLabel} /><Info k="Warranty Status" v={warranty.label} /><Info k="Customer" v={order.customerName} /><Info k="Salesperson" v={order.salesperson || '—'} /><Info k="Address" v={order.shippingAddress || '—'} /><Info k="Delivery" v={order.deliveryDate || '—'} /></div>
    <section className="modal-section"><h2>Units & Media</h2><div className="desktop-table table-wrap"><table className="table"><thead><tr><th>Unit</th><th>Serial</th><th>Warranty</th><th>Valid Until</th><th>Videos</th></tr></thead><tbody>{order.machines.map((machine) => <tr key={machine.id}><td>{machine.itemName}</td><td>{machine.serialNumber || '—'}</td><td><Badge tone={warranty.tone}>{warranty.label === 'Warranty Valid' ? '✓ Warranty Valid' : warranty.label}</Badge></td><td>{warranty.endLabel}</td><td>{(media?.units?.[machine.id]?.videos || []).map((file) => <a key={file.id} href={file.workdriveUrl || file.url} target="_blank">{file.name} </a>)}</td></tr>)}</tbody></table></div><div className="mobile-cards database-unit-cards">{order.machines.map((machine) => <article className="card mobile-order-card" key={machine.id}><strong>{machine.itemName}</strong><p className="muted">Serial: {machine.serialNumber || '—'}</p><div className="meta-grid"><div><span>Warranty</span><strong><Badge tone={warranty.tone}>{warranty.label === 'Warranty Valid' ? '✓ Valid' : warranty.label}</Badge></strong></div><div><span>Valid Until</span><strong>{warranty.endLabel}</strong></div></div></article>)}</div></section>
  </section></div>
}

function warrantyInfo(value?: string): WarrantyInfo {
  const start = parseDate(value)
  if (!start) return { label: 'Warranty Not Started', tone: 'gray', startLabel: '—', endLabel: '—' }
  const end = new Date(start)
  end.setMonth(end.getMonth() + 13)
  end.setHours(23, 59, 59, 999)
  const valid = Date.now() <= end.getTime()
  return { label: valid ? 'Warranty Valid' : 'Warranty Ended', tone: valid ? 'green' : 'red', startLabel: formatDate(start), endLabel: formatDate(end) }
}

function parseDate(value?: string) {
  if (!value) return null
  const text = String(value).trim()
  if (!text) return null
  const iso = Date.parse(text)
  if (Number.isFinite(iso)) return new Date(iso)
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (!match) return null
  const [, dd, mm, yy] = match
  const year = Number(yy.length === 2 ? `20${yy}` : yy)
  const parsed = new Date(year, Number(mm) - 1, Number(dd))
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function formatDate(date: Date) { return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}` }

function Info({ k, v }: { k: string; v: string }) { return <div className="info-tile"><span>{k}</span><strong>{v}</strong></div> }
