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

export function ReadyToShipClient({ initialItems, initialTransporters }: { initialItems: ReadyToShipItem[]; initialTransporters: Transporter[] }) {
  const [items, setItems] = useState(initialItems)
  const [transporters, setTransporters] = useState(initialTransporters)
  const [query, setQuery] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) => [item.salesOrderNumber, item.customerName, item.machine.itemName, item.machine.serialNumber].join(' ').toLowerCase().includes(q))
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
        <p>Machines that are packed, video-verified, and ready for transport booking.</p>
      </div>
      <div className="ready-ship-stats">
        <strong>{items.length}</strong>
        <span>ready machines</span>
      </div>
    </div>

    {message && <div className={message.includes('added') ? 'form-success' : 'form-error'}>{message}</div>}

    <div className="ready-ship-layout">
      <section className="card ready-machine-panel">
        <div className="ready-panel-head">
          <div><h2>Packed Machines</h2><span>{filtered.length} machines ready now</span></div>
          <button className="btn light" type="button" disabled={busy === 'refresh'} onClick={refresh}>{busy === 'refresh' ? 'Syncing…' : 'Refresh'}</button>
        </div>
        <input className="ready-search" placeholder="Search SO, customer, machine, serial" value={query} onChange={(event) => setQuery(event.target.value)} />
        <div className="ready-machine-list">
          {filtered.map((item) => <article className="ready-machine-card" key={item.id}>
            <div className="ready-machine-main">
              <div><strong>{item.salesOrderNumber}</strong><span>{item.customerName}</span></div>
              <Badge tone="green">Ready</Badge>
            </div>
            <div className="ready-machine-name">{item.machine.itemName}</div>
            <div className="ready-machine-meta">
              <span>Serial: {item.machine.serialNumber || '—'}</span>
              <span>Ready: {formatDate(item.readyAt || item.completedAt)}</span>
              <span>{item.videos.length} packing video{item.videos.length === 1 ? '' : 's'}</span>
            </div>
            <div className="ready-machine-actions">
              <a className="btn light" href={`/orders/${item.orderId}`}>Open Order</a>
              {item.videos[0] && <a className="btn red" href={item.videos[0].workdriveUrl || item.videos[0].url} target="_blank">View Video</a>}
            </div>
          </article>)}
          {!filtered.length && <div className="empty-state"><strong>No machines ready yet</strong><span className="muted">Once packing video is uploaded, packed machines will appear here.</span></div>}
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
  </section>
}
