'use client'

import QRCode from 'qrcode'
import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/DashboardShell'
import type { MachineUnit, Order } from '@/types/domain'
import type { MachineWorkflow, OrderWorkflow } from '@/lib/workflow-store'

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

const ORDERS_CACHE_KEY = 'bsm.orders.cache.v2'
const MACHINE_DB_KEY = 'bsm.machine.database.v1'
const PROCESSED_ORDERS_KEY = 'bsm.processed.orders.v1'

export function OrdersClient({ orders, live = false }: { orders: Order[]; live?: boolean }) {
  const [rows, setRows] = useState<Order[]>(orders)
  const [active, setActive] = useState<Order | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  const [workflowByOrder, setWorkflowByOrder] = useState<Record<string, OrderWorkflow>>({})

  useEffect(() => {
    const cached = readCachedOrders()
    if (cached.length) setRows(cached)
    void fetch('/api/workflow/processed').then((r) => r.json()).then((json) => {
      const map: Record<string, OrderWorkflow> = {}
      for (const item of json.data?.orders || []) map[item.salesOrderId] = item
      setWorkflowByOrder(map)
    }).catch(() => {})
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
      const nextRows = sanitizeOrders(json.data?.orders || [])
      setRows(nextRows)
      cacheOrders(nextRows)
    } catch (err) {
      setRows([])
      if (showErrors) setError('Failed to fetch data from Zoho')
    } finally {
      setSyncing(false)
    }
  }

  const openOrders = useMemo(() => sanitizeOrders(rows), [rows])
  const pending = (o: Order) => o.lineItems.length ? o.lineItems.reduce((a, i) => a + i.pendingQuantity, 0) : '—'
  const openOrder = async (order: Order) => {
    setError('')
    setLoadingId(order.id)
    try {
      const response = await fetch(`/api/orders/${order.zohoSalesOrderId || order.id}`, { cache: 'no-store' })
      const json = await response.json()
      if (!response.ok || !json.ok) throw new Error(json.error || 'Could not open order')
      const orderData = json.data.order as Order
      const workflowResponse = await fetch(`/api/workflow/orders/${orderData.id}`, { cache: 'no-store' })
      const workflowJson = await workflowResponse.json()
      setActive(applyWorkflow(orderData, workflowJson.data?.workflow || null))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open order')
    } finally {
      setLoadingId(null)
    }
  }
  return <>
    <section className="card"><div className="modal-section-title"><h2>Zoho Orders</h2><button className="btn red" onClick={() => syncOrders(true)} disabled={syncing}>{syncing ? 'Syncing…' : 'Sync Zoho'}</button></div>{syncing && <div className="machine-row compact"><span>Syncing in background</span><Badge>Live</Badge></div>}{error && <div className="form-error">{error}</div>}<div className="desktop-table table-wrap"><table className="table"><thead><tr><th>SO</th><th>Customer</th><th>Salesperson</th><th>Delivery</th><th>Pending</th><th>Status</th><th>Action</th></tr></thead><tbody>{openOrders.map((o) => <tr key={o.id}><td><strong>{o.salesOrderNumber}</strong></td><td>{o.customerName}</td><td>{o.salesperson || '—'}</td><td>{o.deliveryDate}</td><td>{pending(o)}</td><td><Badge tone={workflowByOrder[o.id]?.status === 'processed' ? 'green' : o.status === 'partially_shipped' ? 'amber' : 'blue'}>{statusLabel(workflowByOrder[o.id]?.status || o.status)}</Badge></td><td><button className="btn light" disabled={loadingId === o.id} onClick={() => openOrder(o)}>{loadingId === o.id ? 'Opening…' : 'View'}</button></td></tr>)}</tbody></table></div><div className="mobile-cards">{openOrders.map((o) => <article className="card mobile-order-card" key={o.id}><strong>{o.salesOrderNumber}</strong><p className="muted">{o.customerName}</p><div className="meta-grid"><div><span>Delivery</span><strong>{o.deliveryDate}</strong></div><div><span>Pending</span><strong>{pending(o)}</strong></div></div><button className="btn light full" disabled={loadingId === o.id} onClick={() => openOrder(o)}>{loadingId === o.id ? 'Opening…' : 'View'}</button></article>)}</div></section>
    {active && <OrderModal order={active} onClose={() => setActive(null)} />}
  </>
}

function OrderModal({ order, onClose }: { order: Order; onClose: () => void }) {
  const [selected, setSelected] = useState(() => new Set(order.machines.filter((m) => m.selectedForBatch).map((m) => m.id)))
  const [machines, setMachines] = useState(order.machines)
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({})
  const [generating, setGenerating] = useState(false)
  const [processed, setProcessed] = useState(false)
  const [message, setMessage] = useState('')
  const toggle = (id: string) => setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  const selectedCount = selected.size

  const generateSelected = async () => {
    if (!selectedCount) return
    setGenerating(true)
    const date = new Date().toISOString().slice(0, 10)
    const updated: MachineUnit[] = []
    const nextQrCodes: Record<string, string> = { ...qrCodes }
    for (const machine of machines) {
      if (!selected.has(machine.id)) { updated.push(machine); continue }
      const serialNumber = machine.serialNumber || nextSerialNumber()
      const qrToken = machine.qrToken || serialNumber
      const qrPayload = buildQrPayload({ order, machine: { ...machine, serialNumber, qrToken }, date })
      const qrCode = qrCodes[machine.id] || await QRCode.toDataURL(qrPayload, { margin: 1, width: 480 })
      const nextMachine = { ...machine, serialNumber, qrToken, status: 'QR Generated' as const, warrantyStart: date }
      updated.push(nextMachine)
      nextQrCodes[machine.id] = qrCode
      saveMachineRecord({ order, machine: nextMachine, qrCode, date })
      downloadDataUrl(`${safeFileName(machine.itemName)} - ${serialNumber}.png`, qrCode)
    }
    const workflowMachines: MachineWorkflow[] = updated.filter((machine) => selected.has(machine.id)).map((machine) => ({ machineUnitId: machine.id, lineItemId: machine.lineItemId, serialNumber: machine.serialNumber, qrCode: nextQrCodes[machine.id], qrToken: machine.qrToken, qrStatus: 'generated', qrGeneratedAt: new Date().toISOString() }))
    await saveWorkflow(order.id, { action: 'generate', order: { ...order, machines: updated }, machines: workflowMachines })
    setMachines(updated)
    setQrCodes(nextQrCodes)
    setGenerating(false)
  }

  const processOrder = async () => {
    setMessage('')
    const incomplete = machines.filter((machine) => !machine.serialNumber && machine.status !== 'QR Printed')
    if (incomplete.length) { setMessage(`Cannot process. Incomplete: ${incomplete.map((m) => `Unit ${m.unitNumber}`).join(', ')}`); return }
    const workflow = await saveWorkflow(order.id, { action: 'process', order: { ...order, machines } })
    setProcessed(true)
    setMessage(`Processed successfully at ${new Date(workflow.data.workflow.processedAt).toLocaleString()}`)
  }

  const proceedWithoutQr = async () => {
    if (!window.confirm('Proceed without QR & Serial for this sales order?')) return
    await saveWorkflow(order.id, { action: 'not_required', order: { ...order, machines } })
    setMachines(machines.map((machine) => ({ ...machine, status: 'QR Printed' as const })))
    setMessage('QR Not Required saved. You can now process this order.')
  }

  return <div className="modal-backdrop" role="dialog" aria-modal="true"><section className="order-modal card"><div className="modal-head"><div><h1>{order.salesOrderNumber}</h1><Badge tone={processed ? 'green' : machines.every((m) => m.serialNumber) ? 'green' : machines.some((m) => m.serialNumber) ? 'amber' : 'blue'}>{processed ? 'Processed' : machines.every((m) => m.serialNumber) ? 'QR Generated' : machines.some((m) => m.serialNumber) ? 'Partially Generated' : 'Open'}</Badge></div><button className="drawer-close" onClick={onClose}>×</button></div>
    {message && <div className="form-error">{message}</div>}
    <div className="grid two details-grid"><Info k="Customer Name" v={order.customerName} /><Info k="Customer Address" v={order.shippingAddress ?? '—'} /><Info k="Salesperson" v={order.salesperson ?? '—'} /><Info k="Expected Delivery Date" v={order.deliveryDate} /></div>
    <section className="modal-section"><h2>Line Items</h2><div className="desktop-table table-wrap"><table className="table"><thead><tr><th>Item</th><th>SKU</th><th>Order Qty</th><th>Pending</th><th>Wooden</th></tr></thead><tbody>{order.lineItems.map((item) => <tr key={item.id}><td>{item.itemName}</td><td>{item.sku}</td><td>{item.quantity}</td><td>{item.pendingQuantity}</td><td>{item.woodenPackingRequired ? 'Yes' : 'No'}</td></tr>)}</tbody></table></div></section>
    <section className="modal-section"><div className="modal-section-title"><h2>Machine Units</h2><Badge tone="blue">{selectedCount} selected</Badge></div><div className="unit-grid">{machines.map((m) => <label className="unit-card" key={m.id}><input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} /><span><strong>Unit {m.unitNumber}</strong><em>{m.itemName}</em><small>{m.serialNumber ? `Serial Number: ${m.serialNumber}` : 'Serial pending'}</small>{qrCodes[m.id] && <img className="unit-qr" src={qrCodes[m.id]} alt={`QR for ${m.serialNumber}`} />}</span><Badge tone={m.serialNumber ? 'green' : 'amber'}>{m.serialNumber ? 'View QR' : 'Not Generated'}</Badge></label>)}</div></section>
    <section className="modal-actions"><button className="btn light" onClick={proceedWithoutQr}>Proceed Without QR & Serial</button><button className="btn red" disabled={!selectedCount || generating || processed} onClick={generateSelected}>{generating ? 'Generating…' : `Generate QR & Serial for ${selectedCount}`}</button><button className="btn" disabled={processed} onClick={processOrder}>{processed ? 'Processed' : 'Process Order'}</button></section>
  </section></div>
}

function Info({ k, v }: { k: string; v: string }) { return <div className="info-tile"><span>{k}</span><strong>{v}</strong></div> }
function sanitizeOrders(orders: Order[]) { return orders.filter((o) => o.status === 'open' || o.status === 'partially_shipped').slice(0, 200) }
function statusLabel(status: string) { return ({ open: 'Open', partially_shipped: 'Partially Shipped', partially_generated: 'Partially Generated', qr_generated: 'QR Generated', qr_not_required: 'QR Not Required', processed: 'Processed' } as Record<string, string>)[status] || status }
function applyWorkflow(order: Order, workflow: OrderWorkflow | null) { if (!workflow) return order; return { ...order, machines: order.machines.map((machine) => { const saved = workflow.machines[machine.id]; if (!saved) return machine; return { ...machine, serialNumber: saved.serialNumber || '', qrToken: saved.qrToken || '', status: saved.qrStatus === 'generated' ? 'QR Generated' : saved.qrStatus === 'not_required' ? 'QR Printed' : machine.status } }) } }
async function saveWorkflow(orderId: string, payload: unknown) { const response = await fetch(`/api/workflow/orders/${orderId}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }); const json = await response.json(); if (!response.ok || !json.ok) throw new Error(json.error || 'Could not save workflow'); return json }
function readCachedOrders() { if (typeof window === 'undefined') return []; try { return sanitizeOrders(JSON.parse(localStorage.getItem(ORDERS_CACHE_KEY) || '[]') as Order[]) } catch { return [] } }
function cacheOrders(orders: Order[]) { try { localStorage.setItem(ORDERS_CACHE_KEY, JSON.stringify(sanitizeOrders(orders))) } catch {} }
function nextSerialNumber() { const key = 'bsm.serial.counter.v1'; const current = Number(localStorage.getItem(key) || '262700000') + 1; localStorage.setItem(key, String(current)); return String(current) }
function safeFileName(value: string) { return value.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim() || 'Machine' }
function saveMachineRecord({ order, machine, qrCode, date }: { order: Order; machine: MachineUnit; qrCode: string; date: string }) { const records = readMachineRecords().filter((r) => r.serialNumber !== machine.serialNumber); const start = new Date(date); const end = new Date(start); end.setFullYear(end.getFullYear() + 1); const warrantyStatus = new Date() <= end ? `Active till ${end.toISOString().slice(0, 10)}` : 'Expired'; records.unshift({ id: machine.serialNumber, serialNumber: machine.serialNumber, qrCode, qrToken: machine.qrToken, salesOrderNumber: order.salesOrderNumber, customerName: order.customerName, customerAddress: order.shippingAddress || '', machineName: machine.itemName, salesperson: order.salesperson || '', dispatchDate: date, qrGenerationDate: date, expectedDeliveryDate: order.deliveryDate, warrantyStatus, order, machine }); localStorage.setItem(MACHINE_DB_KEY, JSON.stringify(records)) }
function readMachineRecords(): MachineRecord[] { try { return JSON.parse(localStorage.getItem(MACHINE_DB_KEY) || '[]') as MachineRecord[] } catch { return [] } }
function readProcessedOrders(): Order[] { try { return JSON.parse(localStorage.getItem(PROCESSED_ORDERS_KEY) || '[]') as Order[] } catch { return [] } }
function downloadDataUrl(fileName: string, dataUrl: string) { const a = document.createElement('a'); a.href = dataUrl; a.download = fileName; document.body.appendChild(a); a.click(); a.remove() }
function buildQrPayload({ order, machine, date }: { order: Order; machine: MachineUnit; date: string }) { return [`Sales Order Number: ${order.salesOrderNumber}`, `Customer Name: ${order.customerName}`, `Customer Address: ${order.shippingAddress || '—'}`, `Machine Name: ${machine.itemName}`, `Machine Serial Number: ${machine.serialNumber}`, `Date: ${date}`].join('\n') }
