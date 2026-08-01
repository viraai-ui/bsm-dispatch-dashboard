'use client'

import { useMemo, useState } from 'react'
import { Badge } from './DashboardShell'
import type { ReadyToShipItem, Transporter } from '@/lib/ready-to-ship'

function formatDate(value?: string) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function messageTone(status?: string) {
  if (status === 'sent') return 'green'
  if (status === 'failed') return 'red'
  if (status === 'not_configured') return 'amber'
  return 'gray'
}

export function ReadyToShipClient({ initialItems, initialTransporters }: { initialItems: ReadyToShipItem[]; initialTransporters: Transporter[] }) {
  const [items, setItems] = useState(initialItems)
  const [transporters, setTransporters] = useState(initialTransporters)
  const [activeItem, setActiveItem] = useState<ReadyToShipItem | null>(null)
  const [query, setQuery] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) => [item.salesOrderNumber, item.customerName, item.shippingAddress, item.machines.map((machine) => `${machine.itemName} ${machine.serialNumber}`).join(' '), item.shipment?.vehicleNumber].join(' ').toLowerCase().includes(q))
  }, [items, query])

  async function refresh() {
    setBusy('refresh'); setMessage('')
    try {
      const response = await fetch('/api/ready-to-ship', { cache: 'no-store' })
      const json = await response.json()
      if (!response.ok || !json.ok) throw new Error(json.error || 'Could not refresh Ready to Ship')
      setItems(json.data.items || [])
      setTransporters(json.data.transporters || [])
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not refresh Ready to Ship') }
    finally { setBusy('') }
  }

  async function addNewTransporter(event: React.FormEvent) {
    event.preventDefault()
    setBusy('add'); setMessage('')
    try {
      const response = await fetch('/api/ready-to-ship', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'add_transporter', name, phone, notes }) })
      const json = await response.json()
      if (!response.ok || !json.ok) throw new Error(json.error || 'Could not add transporter')
      setTransporters((prev) => [json.data.transporter, ...prev])
      setName(''); setPhone(''); setNotes('')
      setMessage('Transporter added.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not add transporter') }
    finally { setBusy('') }
  }

  async function removeTransporter(id: string) {
    if (!window.confirm('Delete this transporter?')) return
    setBusy(id); setMessage('')
    try {
      const response = await fetch('/api/ready-to-ship', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'delete_transporter', id }) })
      const json = await response.json()
      if (!response.ok || !json.ok) throw new Error(json.error || 'Could not delete transporter')
      setTransporters((prev) => prev.filter((item) => item.id !== id))
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not delete transporter') }
    finally { setBusy('') }
  }

  return <section className="ready-ship-page">
    <div className="ready-ship-hero card">
      <div>
        <span className="eyebrow">Dispatch control</span>
        <h1>Ready to Ship</h1>
        <p>Dispatch-completed orders ready for transport booking.</p>
      </div>
      <div className="ready-ship-stats">
        <strong>{items.filter((item) => !item.shipment).length}</strong>
        <span>pending shipment</span>
      </div>
    </div>

    {message && <div className={message.includes('added') ? 'form-success' : 'form-error'}>{message}</div>}

    <div className="ready-ship-layout">
      <section className="card ready-machine-panel">
        <div className="ready-panel-head">
          <div><h2>Dispatch Completed Orders</h2><span>{filtered.length} orders ready / shipped</span></div>
          <button className="btn light" type="button" disabled={busy === 'refresh'} onClick={refresh}>{busy === 'refresh' ? 'Syncing…' : 'Refresh'}</button>
        </div>
        <input className="ready-search" placeholder="Search SO, customer, address, machine, serial, vehicle" value={query} onChange={(event) => setQuery(event.target.value)} />
        <div className="ready-machine-list">
          {filtered.map((item) => <article className={`ready-machine-card ${item.shipment ? 'shipped' : ''}`} key={item.id}>
            <div className="ready-machine-main">
              <div><strong>{item.salesOrderNumber}</strong><span>{item.customerName}</span></div>
              <Badge tone={item.shipment ? 'blue' : 'green'}>{item.shipment ? 'Shipped' : 'Dispatch Complete'}</Badge>
            </div>
            <div className="ready-customer-address">{item.shippingAddress || 'Address not available'}</div>
            <div className="ready-machine-list-inline">{item.machines.map((machine) => <div className="ready-machine-line" key={machine.id}><strong>{machine.itemName}</strong><span>Qty 1</span>{machine.serialNumber && <em>Serial {machine.serialNumber}</em>}</div>)}</div>
            <div className="ready-machine-meta">
              <span>Machines: {item.machines.length}</span>
              <span>{item.shipment ? `Vehicle: ${item.shipment.vehicleNumber}` : `Ready: ${formatDate(item.readyAt || item.completedAt)}`}</span>
              <span className={item.packingVideoUploaded ? 'packing-video-yes' : 'packing-video-no'}>☑ Packaging Video: {item.packingVideoUploaded ? 'Yes' : 'No'}</span>
            </div>
            {item.shipment && <div className="shipment-status-row">
              <Badge tone={messageTone(item.shipment.messages.customer.status) as any}>Customer: {item.shipment.messages.customer.status}</Badge>
              <Badge tone={messageTone(item.shipment.messages.salesperson.status) as any}>Sales: {item.shipment.messages.salesperson.status}</Badge>
            </div>}
            <div className="ready-machine-actions">
              <a className="btn light" href={`/orders/${item.orderId}`}>Open Order</a>
              {item.videos[0] && <a className="btn light" href={item.videos[0].workdriveUrl || item.videos[0].url} target="_blank">View Video</a>}
              <button className="btn red" type="button" onClick={() => setActiveItem(item)}>{item.shipment ? 'View Shipment' : 'Ship / WhatsApp'}</button>
            </div>
          </article>)}
          {!filtered.length && <div className="empty-state"><strong>No dispatch-completed orders yet</strong><span className="muted">Orders will appear here once completed from Dispatch View.</span></div>}
        </div>
      </section>

      <aside className="card transporter-panel">
        <div className="ready-panel-head"><div><h2>Transporters</h2><span>Phonebook for booking vehicles</span></div></div>
        <form className="transporter-form" onSubmit={addNewTransporter}>
          <input placeholder="Transporter / partner name" value={name} onChange={(event) => setName(event.target.value)} />
          <input placeholder="Phone number" value={phone} onChange={(event) => setPhone(event.target.value)} />
          <input placeholder="Notes / route / vehicle type" value={notes} onChange={(event) => setNotes(event.target.value)} />
          <button className="btn red" disabled={busy === 'add'}>{busy === 'add' ? 'Adding…' : 'Add Transporter'}</button>
        </form>
        <div className="transporter-list">
          {transporters.map((item) => <article className="transporter-card" key={item.id}>
            <div><strong>{item.name}</strong><a href={`tel:${item.phone}`}>{item.phone}</a>{item.notes && <span>{item.notes}</span>}</div>
            <button type="button" className="media-delete-video" disabled={busy === item.id} onClick={() => removeTransporter(item.id)}>×</button>
          </article>)}
          {!transporters.length && <div className="empty-state small"><strong>No transporters yet</strong><span className="muted">Add partner names and numbers here.</span></div>}
        </div>
      </aside>
    </div>
    {activeItem && <ShipmentModal item={activeItem} transporters={transporters} busy={busy} setBusy={setBusy} onClose={() => setActiveItem(null)} onSaved={(updated) => { setItems((prev) => prev.map((item) => item.id === updated.id ? updated : item)); setActiveItem(null); setMessage('Shipment saved. WhatsApp status updated.') }} />}
  </section>
}

function ShipmentModal({ item, transporters, busy, setBusy, onClose, onSaved }: { item: ReadyToShipItem; transporters: Transporter[]; busy: string; setBusy: (value: string) => void; onClose: () => void; onSaved: (item: ReadyToShipItem) => void }) {
  const existing = item.shipment
  const [transporterName, setTransporterName] = useState(existing?.transporterName || transporters[0]?.name || '')
  const selectedTransporter = transporters.find((entry) => entry.name === transporterName)
  const [transporterPhone, setTransporterPhone] = useState(existing?.transporterPhone || selectedTransporter?.phone || '')
  const [vehicleNumber, setVehicleNumber] = useState(existing?.vehicleNumber || '')
  const [driverName, setDriverName] = useState(existing?.driverName || '')
  const [driverPhone, setDriverPhone] = useState(existing?.driverPhone || '')
  const [expectedDelivery, setExpectedDelivery] = useState(existing?.expectedDelivery || '')
  const [customerPhone, setCustomerPhone] = useState(existing?.customerPhone || item.customerPhone || '')
  const [salespersonName, setSalespersonName] = useState(existing?.salespersonName || item.salesperson || '')
  const [salespersonPhone, setSalespersonPhone] = useState(existing?.salespersonPhone || '')
  const [notes, setNotes] = useState(existing?.notes || '')
  const [sendWhatsapp, setSendWhatsapp] = useState(!existing)
  const [error, setError] = useState('')

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy('shipment'); setError('')
    try {
      const response = await fetch('/api/ready-to-ship', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'process_shipment', itemId: item.id, transporterName, transporterPhone, vehicleNumber, driverName, driverPhone, expectedDelivery, customerPhone, salespersonName, salespersonPhone, notes, sendWhatsapp }) })
      const json = await response.json()
      if (!response.ok || !json.ok) throw new Error(json.error || 'Could not save shipment')
      onSaved({ ...item, shipment: json.data.shipment })
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save shipment') }
    finally { setBusy('') }
  }

  return <div className="modal-backdrop media-modal-backdrop" role="dialog" aria-modal="true"><section className="order-modal card shipment-modal">
    <div className="modal-head"><div><h1>{item.salesOrderNumber}</h1><p className="muted">{item.customerName}</p></div><button className="drawer-close" onClick={onClose}>×</button></div>
    <div className="shipment-order-context"><strong>{item.shippingAddress || 'Address not available'}</strong><div>{item.machines.map((machine) => <span key={machine.id}>{machine.itemName} · Qty 1{machine.serialNumber ? ` · Serial ${machine.serialNumber}` : ''}</span>)}</div><em>Packaging Video: {item.packingVideoUploaded ? 'Yes' : 'No'}</em></div>
    {error && <div className="form-error">{error}</div>}
    {existing && <div className="shipment-status-box"><strong>Shipment already saved</strong><span>Customer WhatsApp: {existing.messages.customer.status}</span><span>Salesperson WhatsApp: {existing.messages.salesperson.status}</span></div>}
    <form className="shipment-form" onSubmit={submit}>
      <label>Transporter<select value={transporterName} onChange={(event) => { setTransporterName(event.target.value); const next = transporters.find((entry) => entry.name === event.target.value); if (next) setTransporterPhone(next.phone) }}><option value="">Select / type below</option>{transporters.map((entry) => <option key={entry.id} value={entry.name}>{entry.name}</option>)}</select></label>
      <label>Transporter Name<input value={transporterName} onChange={(event) => setTransporterName(event.target.value)} /></label>
      <label>Transporter Phone<input value={transporterPhone} onChange={(event) => setTransporterPhone(event.target.value)} /></label>
      <label>Vehicle Number<input value={vehicleNumber} onChange={(event) => setVehicleNumber(event.target.value.toUpperCase())} placeholder="DL 01 AB 1234" /></label>
      <label>Driver Name<input value={driverName} onChange={(event) => setDriverName(event.target.value)} /></label>
      <label>Driver Mobile<input value={driverPhone} onChange={(event) => setDriverPhone(event.target.value)} /></label>
      <label>Expected Delivery<input value={expectedDelivery} onChange={(event) => setExpectedDelivery(event.target.value)} placeholder="01/08/2026 evening" /></label>
      <label>Customer WhatsApp<input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} /></label>
      <label>Salesperson Name<input value={salespersonName} onChange={(event) => setSalespersonName(event.target.value)} /></label>
      <label>Salesperson WhatsApp<input value={salespersonPhone} onChange={(event) => setSalespersonPhone(event.target.value)} /></label>
      <label className="shipment-notes">Notes<input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional dispatch note" /></label>
      <label className="shipment-checkbox"><input type="checkbox" checked={sendWhatsapp} onChange={(event) => setSendWhatsapp(event.target.checked)} /> Send WhatsApp to customer and salesperson</label>
      <div className="shipment-actions"><button className="btn light" type="button" onClick={onClose}>Cancel</button><button className="btn red" disabled={busy === 'shipment'}>{busy === 'shipment' ? 'Saving…' : existing ? 'Resend / Update' : 'Confirm Shipment'}</button></div>
    </form>
  </section></div>
}
