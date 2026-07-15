'use client'

import QRCode from 'qrcode'
import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/DashboardShell'
import type { MachineUnit, Order } from '@/types/domain'

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
  order: Order
  machine: MachineUnit
}

const ORDERS_CACHE_KEY = 'bsm.orders.cache.v1'
const MACHINE_DB_KEY = 'bsm.machine.database.v1'

export function OrdersClient({ orders, live = false }: { orders: Order[]; live?: boolean }) {
  const [rows, setRows] = useState<Order[]>(orders)
  const [active, setActive] = useState<Order | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const cached = readCachedOrders()
    if (cached.length) setRows(cached)
    if (live) void syncOrders(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live])

  const syncOrders = async (showErrors = true) => {
    setError('')
    setSyncing(true)
    try {
      const response = await fetch('/api/orders', { cache: 'no-store' })
      const json = await response.json()
      if (!response.ok || !json.ok) throw new Error(json.error || 'Could not sync Zoho orders')
      const nextRows = json.data?.orders || []
      setRows(nextRows)
      cacheOrders(nextRows)
    } catch (err) {
      if (showErrors) setError(err instanceof Error ? err.message : 'Could not sync Zoho orders')
    } finally {
      setSyncing(false)
    }
  }

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
    <section className="card"><div className="modal-section-title"><h2>Zoho Orders</h2><button className="btn red" onClick={() => syncOrders(true)} disabled={syncing}>{syncing ? 'Syncing…' : 'Sync Zoho'}</button></div>{syncing && <div className="machine-row compact"><span>Syncing in background</span><Badge>Live</Badge></div>}{error && <div className="form-error">{error}</div>}<div className="desktop-table table-wrap"><table className="table"><thead><tr><th>SO</th><th>Customer</th><th>Salesperson</th><th>Delivery</th><th>Pending</th><th>Status</th><th>Action</th></tr></thead><tbody>{openOrders.map((o) => <tr key={o.id}><td><strong>{o.salesOrderNumber}</strong></td><td>{o.customerName}</td><td>{o.salesperson || '—'}</td><td>{o.deliveryDate}</td><td>{pending(o)}</td><td><Badge tone={o.status === 'partially_shipped' ? 'amber' : 'blue'}>{o.status === 'partially_shipped' ? 'Partially Shipped' : 'Open'}</Badge></td><td><button className="btn light" disabled={loadingId === o.id} onClick={() => openOrder(o)}>{loadingId === o.id ? 'Opening…' : 'View'}</button></td></tr>)}</tbody></table></div><div className="mobile-cards">{openOrders.map((o) => <article className="card mobile-order-card" key={o.id}><strong>{o.salesOrderNumber}</strong><p className="muted">{o.customerName}</p><div className="meta-grid"><div><span>Delivery</span><strong>{o.deliveryDate}</strong></div><div><span>Pending</span><strong>{pending(o)}</strong></div></div><button className="btn light full" disabled={loadingId === o.id} onClick={() => openOrder(o)}>{loadingId === o.id ? 'Opening…' : 'View'}</button></article>)}</div></section>
    {active && <OrderModal order={active} onClose={() => setActive(null)} />}
  </>
}

function OrderModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const [selected, setSelected] = useState(() => new Set(order.machines.filter((m) => m.selectedForBatch).map((m) => m.id)))
  const [machines, setMachines] = useState(order.machines)
  const [generating, setGenerating] = useState(false)
  const toggle = (id: string) => setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  const selectedCount = selected.size

  const generateSelected = async () => {
    if (!selectedCount) return
    setGenerating(true)
    const date = new Date().toISOString().slice(0, 10)
    const updated: MachineUnit[] = []
    for (const machine of machines) {
      if (!selected.has(machine.id)) { updated.push(machine); continue }
      const serialNumber = machine.serialNumber || nextSerialNumber()
      const qrToken = machine.qrToken || serialNumber
      const qrPayload = `${window.location.origin}/m/${encodeURIComponent(qrToken)}`
      const qrCode = await QRCode.toDataURL(qrPayload, { margin: 1, width: 480 })
      const nextMachine = { ...machine, serialNumber, qrToken, status: 'QR Generated' as const, warrantyStart: date }
      updated.push(nextMachine)
      saveMachineRecord({ order, machine: nextMachine, qrCode, date })
      downloadPdf(`${safeFileName(machine.itemName)} - ${serialNumber}.pdf`, buildQrPdf({ order, machine: nextMachine, qrCode, date }))
    }
    setMachines(updated)
    setGenerating(false)
  }

  return <div className="modal-backdrop" role="dialog" aria-modal="true"><section className="order-modal card"><div className="modal-head"><div><h1>{order.salesOrderNumber}</h1><Badge tone={order.status === 'partially_shipped' ? 'amber' : 'blue'}>{order.status === 'partially_shipped' ? 'Partially Shipped' : 'Open'}</Badge></div><button className="drawer-close" onClick={onClose}>×</button></div>
    <div className="grid two details-grid"><Info k="Customer Name" v={order.customerName} /><Info k="Customer Address" v={order.shippingAddress ?? '—'} /><Info k="Salesperson" v={order.salesperson ?? '—'} /><Info k="Expected Delivery Date" v={order.deliveryDate} /></div>
    <section className="modal-section"><h2>Line Items</h2><div className="desktop-table table-wrap"><table className="table"><thead><tr><th>Item</th><th>SKU</th><th>Order Qty</th><th>Pending</th><th>Wooden</th></tr></thead><tbody>{order.lineItems.map((item) => <tr key={item.id}><td>{item.itemName}</td><td>{item.sku}</td><td>{item.quantity}</td><td>{item.pendingQuantity}</td><td>{item.woodenPackingRequired ? 'Yes' : 'No'}</td></tr>)}</tbody></table></div></section>
    <section className="modal-section"><div className="modal-section-title"><h2>Machine Units</h2><Badge tone="blue">{selectedCount} selected</Badge></div><div className="unit-grid">{machines.map((m) => <label className="unit-card" key={m.id}><input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} /><span><strong>Unit {m.unitNumber}</strong><em>{m.itemName}</em><small>{m.serialNumber || 'Serial pending'}</small></span><Badge tone={m.serialNumber ? 'green' : 'amber'}>{m.serialNumber ? 'View QR' : 'Not Generated'}</Badge></label>)}</div></section>
    <section className="modal-actions"><button className="btn red" disabled={!selectedCount || generating} onClick={generateSelected}>{generating ? 'Generating…' : `Generate QR & Serial for ${selectedCount}`}</button><button className="btn">Process Order</button></section>
  </section></div>
}

function Info({ k, v }: { k: string; v: string }) { return <div className="info-tile"><span>{k}</span><strong>{v}</strong></div> }
function readCachedOrders() { if (typeof window === 'undefined') return []; try { return JSON.parse(localStorage.getItem(ORDERS_CACHE_KEY) || '[]') as Order[] } catch { return [] } }
function cacheOrders(orders: Order[]) { try { localStorage.setItem(ORDERS_CACHE_KEY, JSON.stringify(orders)) } catch {} }
function nextSerialNumber() { const key = 'bsm.serial.counter.v1'; const current = Number(localStorage.getItem(key) || '262700000') + 1; localStorage.setItem(key, String(current)); return String(current) }
function safeFileName(value: string) { return value.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim() || 'Machine' }
function saveMachineRecord({ order, machine, qrCode, date }: { order: Order; machine: MachineUnit; qrCode: string; date: string }) { const records = readMachineRecords().filter((r) => r.serialNumber !== machine.serialNumber); const start = new Date(date); const end = new Date(start); end.setFullYear(end.getFullYear() + 1); const warrantyStatus = new Date() <= end ? `Active till ${end.toISOString().slice(0, 10)}` : 'Expired'; records.unshift({ id: machine.serialNumber, serialNumber: machine.serialNumber, qrCode, qrToken: machine.qrToken, salesOrderNumber: order.salesOrderNumber, customerName: order.customerName, customerAddress: order.shippingAddress || '', machineName: machine.itemName, salesperson: order.salesperson || '', dispatchDate: date, qrGenerationDate: date, expectedDeliveryDate: order.deliveryDate, warrantyStatus, order, machine }); localStorage.setItem(MACHINE_DB_KEY, JSON.stringify(records)) }
function readMachineRecords(): MachineRecord[] { try { return JSON.parse(localStorage.getItem(MACHINE_DB_KEY) || '[]') as MachineRecord[] } catch { return [] } }
function downloadPdf(fileName: string, content: string) { const blob = new Blob([content], { type: 'application/pdf' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = fileName; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url) }
function buildQrPdf({ order, machine, qrCode, date }: { order: Order; machine: MachineUnit; qrCode: string; date: string }) { const text = [`BSM Machine QR`, `Serial: ${machine.serialNumber}`, `Machine: ${machine.itemName}`, `SO: ${order.salesOrderNumber}`, `Customer: ${order.customerName}`, `Generated: ${date}`].join('\\n'); return `%PDF-1.3\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 420 595] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj\n4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n5 0 obj << /Length 260 >> stream\nBT /F1 18 Tf 40 540 Td (BSM Machine QR) Tj /F1 12 Tf 0 -38 Td (Serial: ${machine.serialNumber}) Tj 0 -22 Td (Machine: ${machine.itemName.replace(/[()]/g, '')}) Tj 0 -22 Td (SO: ${order.salesOrderNumber}) Tj 0 -22 Td (Customer: ${order.customerName.replace(/[()]/g, '')}) Tj 0 -22 Td (Generated: ${date}) Tj 0 -42 Td (QR: ${machine.qrToken}) Tj ET\nendstream endobj\nxref\n0 6\n0000000000 65535 f \n0000000010 00000 n \n0000000059 00000 n \n0000000116 00000 n \n0000000266 00000 n \n0000000336 00000 n \ntrailer << /Root 1 0 R /Size 6 >>\nstartxref\n646\n%%EOF\n` }
