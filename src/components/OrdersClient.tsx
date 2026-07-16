'use client'

import QRCode from 'qrcode'
import { jsPDF } from 'jspdf'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge } from '@/components/DashboardShell'
import type { MachineUnit, Order } from '@/types/domain'
import type { MachineWorkflow, OrderWorkflow } from '@/lib/workflow-store'

type OrderStage = 'open' | 'processed' | 'packed' | 'media_uploaded' | 'dispatched' | 'closed'

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
const ORDERS_AUTO_SYNC_MS = 15 * 60 * 1000

export function OrdersClient({ orders, live = false }: { orders: Order[]; live?: boolean }) {
  const [rows, setRows] = useState<Order[]>(orders)
  const [active, setActive] = useState<Order | null>(null)
  const [activeStage, setActiveStage] = useState<OrderStage>('open')
  const [activeWorkflow, setActiveWorkflow] = useState<OrderWorkflow | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const syncingRef = useRef(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null)
  const [workflowByOrder, setWorkflowByOrder] = useState<Record<string, OrderWorkflow>>({})
  const [stageByOrder, setStageByOrder] = useState<Record<string, OrderStage>>({})

  useEffect(() => {
    const cached = readCachedOrders()
    if (cached.length) setRows(cached)
    void fetch('/api/workflow/processed').then((r) => r.json()).then((json) => {
      const map: Record<string, OrderWorkflow> = {}
      for (const item of json.data?.orders || []) map[item.salesOrderId] = item
      setWorkflowByOrder(map)
    }).catch(() => {})
    if (live) void loadOrders(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live])

  useEffect(() => {
    const timer = window.setInterval(() => { void syncOrders(false) }, ORDERS_AUTO_SYNC_MS)
    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadOrders = async (showErrors = true) => {
    setError(''); setNotice('')
    try {
      const response = await fetch('/api/orders', { cache: 'no-store' })
      const json = await response.json()
      if (!response.ok || !json.ok) throw new Error(json.error || 'Could not load saved orders')
      const nextRows = sanitizeOrders(json.data?.orders || [])
      setStageByOrder(json.data?.stages || {})
      setRows(nextRows); cacheOrders(nextRows); setLastSyncAt(json.data?.lastSuccessfulSyncAt || null)
    } catch (err) { if (showErrors) setError(err instanceof Error ? err.message : 'Could not load saved orders') }
  }

  const syncOrders = async (showErrors = true) => {
    if (syncingRef.current) return
    setError(''); setNotice('')
    syncingRef.current = true
    setSyncing(true)
    try {
      const response = await fetch('/api/orders', { method: 'POST', cache: 'no-store' })
      const json = await response.json()
      if (!response.ok || !json.ok) throw new Error(json.error || 'Could not sync Zoho orders')
      const nextRows = sanitizeOrders(json.data?.orders || [])
      setStageByOrder(json.data?.stages || {})
      setRows(nextRows)
      cacheOrders(nextRows)
      setLastSyncAt(json.data?.lastSuccessfulSyncAt || null)
      if (showErrors) setNotice('Sync completed successfully.')
    } catch (err) {
      if (showErrors) setError(err instanceof Error ? err.message : 'Failed to sync Zoho. Showing last saved data.')
    } finally {
      syncingRef.current = false
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
      const workflow = workflowJson.data?.workflow || null
      setActiveWorkflow(workflow)
      setActiveStage(json.data?.stage || json.data?.status?.lifecycleStage || stageByOrder[order.id] || stageByOrder[orderData.id] || (workflow?.status === 'processed' ? 'processed' : 'open'))
      setActive(applyWorkflow(orderData, workflow))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open order')
    } finally {
      setLoadingId(null)
    }
  }
  return <>
    <section className="card"><div className="modal-section-title"><div><h2>Confirmed Sales Orders</h2>{lastSyncAt && <p className="muted">Last sync: {new Date(lastSyncAt).toLocaleString()}</p>}</div><button className="btn red" onClick={() => syncOrders(true)} disabled={syncing}>{syncing ? 'SYNCING…' : 'SYNC'}</button></div>{syncing && <div className="machine-row compact"><span>Syncing in background</span><Badge>Live</Badge></div>}{notice && <div className="form-success">{notice}</div>}{error && <div className="form-error">{error}</div>}<div className="desktop-table table-wrap"><table className="table"><thead><tr><th>Sales Order</th><th>Customer</th><th>Salesperson</th><th>Delivery</th><th>Status</th><th>Action</th></tr></thead><tbody>{openOrders.map((o) => <tr key={o.id}><td><strong>{o.salesOrderNumber}</strong></td><td>{o.customerName}</td><td>{o.salesperson || '—'}</td><td>{formatDate(o.deliveryDate)}</td><td><Badge tone={stageTone(stageByOrder[o.id] || (workflowByOrder[o.id]?.status === 'processed' ? 'processed' : 'open'))}>{stageLabel(stageByOrder[o.id] || (workflowByOrder[o.id]?.status === 'processed' ? 'processed' : 'open'))}</Badge></td><td><button className="btn light" disabled={loadingId === o.id} onClick={() => openOrder(o)}>{loadingId === o.id ? 'Opening…' : 'View'}</button></td></tr>)}</tbody></table></div><div className="mobile-cards">{openOrders.map((o) => <article className="card mobile-order-card" key={o.id}><strong>{o.salesOrderNumber}</strong><p className="muted">{o.customerName}</p><div className="meta-grid"><div><span>Delivery</span><strong>{formatDate(o.deliveryDate)}</strong></div><div><span>Status</span><strong>{stageLabel(stageByOrder[o.id] || (workflowByOrder[o.id]?.status === 'processed' ? 'processed' : 'open'))}</strong></div></div><button className="btn light full" disabled={loadingId === o.id} onClick={() => openOrder(o)}>{loadingId === o.id ? 'Opening…' : 'View'}</button></article>)}</div></section>
    {active && <OrderModal order={active} stage={activeStage} workflow={activeWorkflow} onClose={() => setActive(null)} />}
  </>
}

function OrderModal({ order, stage, workflow, onClose }: { order: Order; stage: OrderStage; workflow: OrderWorkflow | null; onClose: () => void }) {
  const [selected, setSelected] = useState(() => new Set(order.machines.filter((m) => m.selectedForBatch).map((m) => m.id)))
  const [machines, setMachines] = useState(order.machines)
  const [qrCodes, setQrCodes] = useState<Record<string, string>>(() => initialQrCodes(order, workflow))
  const [generating, setGenerating] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [processed, setProcessed] = useState(false)
  const [message, setMessage] = useState('')
  const toggle = (id: string) => setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  const selectedCount = selected.size
  const modalStage = processed ? 'processed' : stage
  const canDownloadQr = modalStage !== 'closed'

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

  const printBarcodes = async () => {
    if (!machines.length) return
    setPrinting(true)
    setMessage('')
    try {
      const date = new Date().toISOString().slice(0, 10)
      const updated: MachineUnit[] = []
      const nextQrCodes: Record<string, string> = { ...qrCodes }
      const workflowMachines: MachineWorkflow[] = []

      for (const machine of machines) {
        const serialNumber = machine.serialNumber || nextSerialNumber()
        const qrToken = machine.qrToken || serialNumber
        const nextMachine = { ...machine, serialNumber, qrToken, status: 'QR Generated' as const, warrantyStart: machine.warrantyStart || date }
        const qrPayload = buildQrPayload({ order, machine: nextMachine, date })
        const qrCode = nextQrCodes[machine.id] || await QRCode.toDataURL(qrPayload, { margin: 1, width: 480 })
        nextQrCodes[machine.id] = qrCode
        updated.push(nextMachine)
        workflowMachines.push({ machineUnitId: nextMachine.id, lineItemId: nextMachine.lineItemId, serialNumber, qrCode, qrToken, qrStatus: 'generated', qrGeneratedAt: new Date().toISOString() })
        saveMachineRecord({ order, machine: nextMachine, qrCode, date })
      }

      await saveWorkflow(order.id, { action: 'generate', order: { ...order, machines: updated }, machines: workflowMachines })
      setMachines(updated)
      setQrCodes(nextQrCodes)
      generateBarcodePdf({ order, machines: updated, qrCodes: nextQrCodes })
      setMessage(`Barcode PDF generated with ${updated.length} page${updated.length === 1 ? '' : 's'}.`)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not generate barcode PDF')
    } finally {
      setPrinting(false)
    }
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

  return <div className="modal-backdrop" role="dialog" aria-modal="true"><section className="order-modal card"><div className="modal-head"><div><h1>{order.salesOrderNumber}</h1><Badge tone={stageTone(modalStage)}>{stageLabel(modalStage)}</Badge></div><button className="drawer-close" onClick={onClose}>×</button></div>
    {message && <div className="form-error">{message}</div>}
    <StageTracker stage={modalStage} />
    <div className="grid two details-grid"><Info k="Customer Name" v={order.customerName} /><Info k="Customer Address" v={order.shippingAddress ?? '—'} /><Info k="Salesperson" v={order.salesperson ?? '—'} /><Info k="Expected Delivery Date" v={formatDate(order.deliveryDate)} /></div>
    <section className="modal-section"><h2>Line Items</h2><div className="desktop-table table-wrap"><table className="table"><thead><tr><th>Item</th><th>SKU</th><th>Order Qty</th><th>Pending</th><th>Wooden</th></tr></thead><tbody>{order.lineItems.map((item) => <tr key={item.id}><td>{item.itemName}</td><td>{item.sku}</td><td>{item.quantity}</td><td>{item.pendingQuantity}</td><td>{item.woodenPackingRequired ? 'Yes' : 'No'}</td></tr>)}</tbody></table></div></section>
    <section className="modal-section"><div className="modal-section-title"><h2>Machine Units</h2><Badge tone="blue">{selectedCount} selected</Badge></div><div className="unit-grid">{machines.map((m) => <label className="unit-card" key={m.id}><input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} /><span><strong>Unit {m.unitNumber}</strong><em>{m.itemName}</em><small>{m.serialNumber ? `Serial Number: ${m.serialNumber}` : 'Serial pending'}</small></span>{m.serialNumber && qrCodes[m.id] && canDownloadQr ? <button type="button" className="btn light unit-action" onClick={(event) => { event.preventDefault(); downloadDataUrl(`${safeFileName(m.itemName)} - ${m.serialNumber}.png`, qrCodes[m.id]) }}>Download QR</button> : <Badge tone={m.serialNumber ? 'green' : 'amber'}>{m.serialNumber ? 'QR Saved' : 'Not Generated'}</Badge>}</label>)}</div></section>
    <section className="modal-actions"><button className="btn light" onClick={proceedWithoutQr}>Proceed Without QR & Serial</button><button className="btn light" disabled={!machines.length || generating || printing} onClick={printBarcodes}>{printing ? 'Generating PDF…' : 'Print Barcodes'}</button><button className="btn red" disabled={!selectedCount || generating || processed || printing} onClick={generateSelected}>{generating ? 'Generating…' : `Generate QR & Serial for ${selectedCount}`}</button><button className="btn" disabled={processed || printing} onClick={processOrder}>{processed ? 'Processed' : 'Process Order'}</button></section>
  </section></div>
}


const STAGE_FLOW: OrderStage[] = ['open', 'processed', 'packed', 'media_uploaded', 'dispatched', 'closed']

function StageTracker({ stage }: { stage: OrderStage }) {
  const current = Math.max(0, STAGE_FLOW.indexOf(stage))
  return <section className="stage-tracker" aria-label="Order stage timeline">
    <div className="stage-bar"><span style={{ width: `${(current / (STAGE_FLOW.length - 1)) * 100}%` }} /></div>
    <div className="stage-steps">{STAGE_FLOW.map((item, index) => <div key={item} className={`stage-step ${index <= current ? 'done' : ''} ${item === stage ? 'active' : ''}`}><i>{index + 1}</i><strong>{stageLabel(item)}</strong></div>)}</div>
  </section>
}

function initialQrCodes(order: Order, workflow: OrderWorkflow | null) {
  const codes: Record<string, string> = {}
  for (const machine of order.machines) {
    const saved = workflow?.machines?.[machine.id]?.qrCode || readMachineRecords().find((record) => record.serialNumber === machine.serialNumber)?.qrCode
    if (saved) codes[machine.id] = saved
  }
  return codes
}

function generateBarcodePdf({ order, machines, qrCodes }: { order: Order; machines: MachineUnit[]; qrCodes: Record<string, string> }) {
  const widthMm = 75
  const heightMm = 50
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [widthMm, heightMm], compress: true })
  doc.setProperties({ title: `${order.salesOrderNumber} barcode labels`, subject: 'BSM machine QR barcode labels' })

  machines.forEach((machine, index) => {
    if (index > 0) doc.addPage([widthMm, heightMm], 'landscape')
    const qrCode = qrCodes[machine.id]
    const serial = machine.serialNumber || '—'
    const name = machine.itemName || 'Machine'

    doc.setFillColor(255, 255, 255)
    doc.rect(0, 0, widthMm, heightMm, 'F')
    doc.setDrawColor(17, 24, 39)
    doc.setLineWidth(0.6)
    doc.roundedRect(2.5, 2.5, 70, 45, 2, 2)

    doc.setFillColor(200, 16, 46)
    doc.roundedRect(4.5, 4.5, 66, 7, 1.4, 1.4, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.text('BSM INDIA', 7, 9.3)
    doc.setFontSize(5.5)
    doc.text('MACHINE QR LABEL', 69, 9.3, { align: 'right' })

    if (qrCode) doc.addImage(qrCode, 'PNG', 5.5, 14, 27, 27)
    doc.setDrawColor(226, 232, 240)
    doc.rect(5.5, 14, 27, 27)

    doc.setTextColor(15, 23, 42)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(5.2)
    doc.text('SERIAL NUMBER', 35, 17)
    doc.setFontSize(9.5)
    doc.text(serial, 35, 22)

    doc.setDrawColor(226, 232, 240)
    doc.line(35, 25, 69, 25)
    doc.setFontSize(5.2)
    doc.text('MACHINE NAME', 35, 29)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    const lines = doc.splitTextToSize(name, 33).slice(0, 3)
    doc.text(lines, 35, 34)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(5.2)
    doc.setTextColor(71, 85, 105)
    doc.text(`SO: ${order.salesOrderNumber}`, 5.5, 45)
    doc.text(`Unit ${machine.unitNumber}`, 69, 45, { align: 'right' })
  })

  doc.save(`${safeFileName(order.salesOrderNumber)}-barcodes.pdf`)
}

function Info({ k, v }: { k: string; v: string }) { return <div className="info-tile"><span>{k}</span><strong>{v}</strong></div> }
function sanitizeOrders(orders: Order[]) { return orders }
function statusLabel(status: string) { return ({ open: 'Open', partially_shipped: 'Partially Shipped', partially_generated: 'Partially Generated', qr_generated: 'QR Generated', qr_not_required: 'QR Not Required', processed: 'Processed' } as Record<string, string>)[status] || status }
function stageLabel(stage: string) { return ({ open: 'Open', processed: 'Processed', packed: 'Packed', media_uploaded: 'Media Uploaded', dispatched: 'Dispatched', closed: 'Closed' } as Record<string, string>)[stage] || stage }
function stageTone(stage: string): 'red' | 'green' | 'amber' | 'blue' | 'gray' | 'purple' {
  return ({
    open: 'gray',
    processed: 'amber',
    packed: 'blue',
    media_uploaded: 'purple',
    dispatched: 'green',
    closed: 'red',
  } as Record<string, 'red' | 'green' | 'amber' | 'blue' | 'gray' | 'purple'>)[stage] || 'gray'
}
function formatDate(value: string) { const d = new Date(value); if (Number.isNaN(d.getTime())) return value; return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getFullYear()).slice(-2)}` }
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
