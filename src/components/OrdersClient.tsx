'use client'

import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/DashboardShell'
import type { Order } from '@/types/domain'

export function OrdersClient({ orders, live = false }: { orders: Order[]; live?: boolean }) {
  const [rows, setRows] = useState<Order[]>(orders)
  const [active, setActive] = useState<Order | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [loadingOrders, setLoadingOrders] = useState(live)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!live) return
    let cancelled = false
    setLoadingOrders(true)
    fetch('/api/orders', { cache: 'no-store' }).then((response) => response.json()).then((json) => {
      if (!cancelled) setRows(json.data?.orders || [])
    }).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load orders')
    }).finally(() => {
      if (!cancelled) setLoadingOrders(false)
    })
    return () => { cancelled = true }
  }, [live])
  const openOrders = useMemo(() => rows.filter((o) => o.status === 'open' || o.status === 'partially_shipped'), [rows])
  const pending = (o: Order) => o.lineItems.length ? o.lineItems.reduce((a, i) => a + i.pendingQuantity, 0) : '—'
  const openOrder = async (order: Order) => {
    setError('')
    setLoadingId(order.id)
    try {
      const response = await fetch(`/api/orders/${order.zohoSalesOrderId || order.id}`, { cache: 'no-store' })
      const json = await response.json()
      if (!response.ok || !json.ok) throw new Error(json.error || 'Could not open order')
      setActive(json.data.order)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open order')
    } finally {
      setLoadingId(null)
    }
  }
  return <>
    <section className="card"><h2>Zoho Orders</h2>{loadingOrders && <div className="machine-row compact"><span>Loading Zoho orders…</span><Badge>Live</Badge></div>}{error && <div className="form-error">{error}</div>}<div className="desktop-table table-wrap"><table className="table"><thead><tr><th>SO</th><th>Customer</th><th>Salesperson</th><th>Delivery</th><th>Pending</th><th>Status</th><th>Action</th></tr></thead><tbody>{openOrders.map((o) => <tr key={o.id}><td><strong>{o.salesOrderNumber}</strong></td><td>{o.customerName}</td><td>{o.salesperson || '—'}</td><td>{o.deliveryDate}</td><td>{pending(o)}</td><td><Badge tone={o.status === 'partially_shipped' ? 'amber' : 'blue'}>{o.status === 'partially_shipped' ? 'Partially Shipped' : 'Open'}</Badge></td><td><button className="btn light" disabled={loadingId === o.id} onClick={() => openOrder(o)}>{loadingId === o.id ? 'Opening…' : 'Open'}</button></td></tr>)}</tbody></table></div><div className="mobile-cards">{openOrders.map((o) => <article className="card mobile-order-card" key={o.id}><strong>{o.salesOrderNumber}</strong><p className="muted">{o.customerName}</p><div className="meta-grid"><div><span>Delivery</span><strong>{o.deliveryDate}</strong></div><div><span>Pending</span><strong>{pending(o)}</strong></div></div><button className="btn light full" disabled={loadingId === o.id} onClick={() => openOrder(o)}>{loadingId === o.id ? 'Opening…' : 'Open'}</button></article>)}</div></section>
    {active && <OrderModal order={active} onClose={() => setActive(null)} />}
  </>
}

function OrderModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const [selected, setSelected] = useState(() => new Set(order.machines.filter((m) => m.selectedForBatch).map((m) => m.id)))
  const toggle = (id: string) => setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  const selectedCount = selected.size
  return <div className="modal-backdrop" role="dialog" aria-modal="true"><section className="order-modal card"><div className="modal-head"><div><h1>{order.salesOrderNumber}</h1><Badge tone={order.status === 'partially_shipped' ? 'amber' : 'blue'}>{order.status === 'partially_shipped' ? 'Partially Shipped' : 'Open'}</Badge></div><button className="drawer-close" onClick={onClose}>×</button></div>
    <div className="grid three details-grid"><Info k="Customer" v={order.customerName} /><Info k="Phone" v={order.customerPhone ?? '—'} /><Info k="Email" v={order.customerEmail ?? '—'} /><Info k="Salesperson" v={order.salesperson ?? '—'} /><Info k="Delivery" v={order.deliveryDate} /><Info k="Address" v={order.shippingAddress ?? '—'} /></div>
    <section className="modal-section"><h2>Line Items</h2><div className="desktop-table table-wrap"><table className="table"><thead><tr><th>Item</th><th>SKU</th><th>Order Qty</th><th>Pending</th><th>Wooden</th></tr></thead><tbody>{order.lineItems.map((item) => <tr key={item.id}><td>{item.itemName}</td><td>{item.sku}</td><td>{item.quantity}</td><td>{item.pendingQuantity}</td><td>{item.woodenPackingRequired ? 'Yes' : 'No'}</td></tr>)}</tbody></table></div></section>
    <section className="modal-section"><div className="modal-section-title"><h2>Machine Units</h2><Badge tone="blue">{selectedCount} selected</Badge></div><div className="unit-grid">{order.machines.map((m) => <label className="unit-card" key={m.id}><input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} /><span><strong>Unit {m.unitNumber}</strong><em>{m.itemName}</em><small>{m.serialNumber || 'Serial pending'}</small></span><Badge tone={m.status === 'Not Generated' ? 'amber' : m.status === 'Dispatched' ? 'green' : 'blue'}>{m.status}</Badge></label>)}</div></section>
    <section className="modal-actions"><button className="btn red">Generate QR for {selectedCount}</button><button className="btn light">Print QR</button><button className="btn">Process Order</button></section>
  </section></div>
}

function Info({ k, v }: { k: string; v: string }) { return <div className="info-tile"><span>{k}</span><strong>{v}</strong></div> }
