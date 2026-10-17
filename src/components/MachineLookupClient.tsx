'use client'

import { useMemo, useState } from 'react'
import type { MachineUnit, Order } from '@/types/domain'

type Row = { order: Order; machine: MachineUnit }

export function MachineLookupClient({ rows }: { rows: Row[] }) {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter(({ order, machine }) => [machine.serialNumber, machine.qrToken, order.salesOrderNumber, order.customerName, machine.itemName, machine.sku].some((value) => String(value || '').toLowerCase().includes(needle)))
  }, [query, rows])
  return <>
    <section className="card search-panel"><label className="sr-only" htmlFor="machine-lookup-search">Search machines</label><input id="machine-lookup-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by serial, QR token, sales order, customer, or machine" /><span className="muted" aria-live="polite">{filtered.length} result{filtered.length === 1 ? '' : 's'}</span></section>
    <section className="card">{filtered.length === 0 ? <div className="empty-state"><strong>No machines found</strong><p className="muted">Try a serial number, sales order, customer, SKU, or machine name.</p></div> : <><div className="desktop-table table-wrap"><table className="table"><thead><tr><th>Serial</th><th>Sales Order</th><th>Customer</th><th>Machine</th><th>Action</th></tr></thead><tbody>{filtered.map(({ order, machine }) => <tr key={`${order.id}:${machine.id}`}><td><strong>{machine.serialNumber || 'Pending'}</strong></td><td>{order.salesOrderNumber}</td><td>{order.customerName}</td><td>{machine.itemName}</td><td><a className="btn light" href={`/m/${encodeURIComponent(machine.qrToken || machine.serialNumber || '')}`}>Open</a></td></tr>)}</tbody></table></div><div className="mobile-cards">{filtered.map(({ order, machine }) => <article className="card mobile-order-card" key={`${order.id}:${machine.id}`}><strong>{machine.serialNumber || 'Pending'}</strong><p className="muted">{machine.itemName}</p><div className="meta-grid"><div><span>SO</span><strong>{order.salesOrderNumber}</strong></div><div><span>Customer</span><strong>{order.customerName}</strong></div></div><a className="btn light full" href={`/m/${encodeURIComponent(machine.qrToken || machine.serialNumber || '')}`}>Open Passport</a></article>)}</div></>}</section>
  </>
}