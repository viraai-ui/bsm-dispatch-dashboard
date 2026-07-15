'use client'

import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/DashboardShell'
import type { Order } from '@/types/domain'

const MEDIA_QUEUE_KEY = 'bsm.media.queue.v1'
const MEDIA_STATE_KEY = 'bsm.media.state.v1'
const DISPATCH_QUEUE_KEY = 'bsm.dispatch.queue.v1'

type Upload = { name: string; url: string; type: string }
type MediaState = Record<string, { photos: Upload[]; videos: Upload[] }>

export function MediaProofClient() {
  const [orders, setOrders] = useState<Order[]>([])
  const [state, setState] = useState<MediaState>({})
  const [active, setActive] = useState<Order | null>(null)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => { syncLocal() }, [])
  function syncLocal() { setSyncing(true); setOrders(readOrders()); setState(readState()); setTimeout(() => setSyncing(false), 150) }
  function complete(order: Order) { const dispatch = readDispatch().filter((item) => item.id !== order.id); dispatch.unshift({ ...order, dashboardStatus: 'Media Done' }); localStorage.setItem(DISPATCH_QUEUE_KEY, JSON.stringify(dispatch)); const nextOrders = orders.filter((item) => item.id !== order.id); setOrders(nextOrders); localStorage.setItem(MEDIA_QUEUE_KEY, JSON.stringify(nextOrders)); setActive(null) }
  function status(order: Order) { const done = order.machines.every((machine) => (state[machine.id]?.photos?.length || 0) > 0 && (state[machine.id]?.videos?.length || 0) > 0); return done ? 'Complete' : 'Pending' }

  return <>
    <header className="top compact-top"><div><h1 className="h1">Media Proof</h1></div><button className="btn red" onClick={syncLocal} disabled={syncing}>{syncing ? 'Syncing…' : 'Sync Zoho'}</button></header>
    <section className="card"><h2>Media Queue</h2>{syncing && <div className="machine-row compact"><span>Syncing in background</span><Badge>Live</Badge></div>}<div className="desktop-table table-wrap"><table className="table"><thead><tr><th>SO</th><th>Customer</th><th>Delivery</th><th>Media Upload Status</th><th>Action</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><strong>{order.salesOrderNumber}</strong></td><td>{order.customerName}</td><td>{order.deliveryDate}</td><td><Badge tone={status(order) === 'Complete' ? 'green' : 'amber'}>{status(order)}</Badge></td><td><button className="btn light" onClick={() => setActive(order)}>View</button></td></tr>)}</tbody></table></div><div className="mobile-cards">{orders.map((order) => <article className="card mobile-order-card" key={order.id}><strong>{order.salesOrderNumber}</strong><p className="muted">{order.customerName}</p><Badge tone={status(order) === 'Complete' ? 'green' : 'amber'}>{status(order)}</Badge><button className="btn light full" onClick={() => setActive(order)}>View</button></article>)}</div></section>
    {active && <MediaModal order={active} state={state} setState={setState} onClose={() => setActive(null)} onComplete={() => complete(active)} />}
  </>
}

function MediaModal({ order, state, setState, onClose, onComplete }: { order: Order; state: MediaState; setState: (state: MediaState) => void; onClose: () => void; onComplete: () => void }) {
  const ready = useMemo(() => order.machines.every((machine) => (state[machine.id]?.photos?.length || 0) > 0 && (state[machine.id]?.videos?.length || 0) > 0), [order, state])
  function addFiles(machineId: string, type: 'photos' | 'videos', files: FileList | null) {
    if (!files) return
    const existing = state[machineId] || { photos: [], videos: [] }
    const uploads = Array.from(files).map((file) => ({ name: file.name, type: file.type, url: URL.createObjectURL(file) }))
    const nextList = type === 'videos' ? [...existing.videos, ...uploads].slice(0, 3) : [...existing.photos, ...uploads]
    const next = { ...state, [machineId]: { ...existing, [type]: nextList } }
    setState(next)
    localStorage.setItem(MEDIA_STATE_KEY, JSON.stringify(next))
  }
  function remove(machineId: string, type: 'photos' | 'videos', index: number) { const existing = state[machineId] || { photos: [], videos: [] }; const nextList = existing[type].filter((_, i) => i !== index); const next = { ...state, [machineId]: { ...existing, [type]: nextList } }; setState(next); localStorage.setItem(MEDIA_STATE_KEY, JSON.stringify(next)) }

  return <div className="modal-backdrop" role="dialog" aria-modal="true"><section className="order-modal card"><div className="modal-head"><div><h1>{order.salesOrderNumber}</h1><p className="muted">{order.customerName} · {order.deliveryDate}</p></div><button className="drawer-close" onClick={onClose}>×</button></div><div className="desktop-table table-wrap"><table className="table"><thead><tr><th>Machine</th><th>Serial</th><th>Photos</th><th>Videos</th><th>Upload</th></tr></thead><tbody>{order.machines.map((machine) => <tr key={machine.id}><td>{machine.itemName}</td><td>{machine.serialNumber}</td><td><Previews files={state[machine.id]?.photos || []} onRemove={(index) => remove(machine.id, 'photos', index)} /></td><td><Previews files={state[machine.id]?.videos || []} onRemove={(index) => remove(machine.id, 'videos', index)} /></td><td><label className="btn light">+ Upload Pictures<input hidden type="file" accept="image/*" capture="environment" multiple onChange={(event) => addFiles(machine.id, 'photos', event.target.files)} /></label><label className="btn light" style={{ marginLeft: 8 }}>+ Upload Videos<input hidden type="file" accept="video/*" capture="environment" multiple onChange={(event) => addFiles(machine.id, 'videos', event.target.files)} /></label></td></tr>)}</tbody></table></div><section className="modal-actions"><button className="btn red" disabled={!ready} onClick={onComplete}>Process to Next Stage</button></section></section></div>
}

function Previews({ files, onRemove }: { files: Upload[]; onRemove: (index: number) => void }) { return <div className="preview-strip">{files.map((file, index) => <span key={`${file.name}-${index}`}><a href={file.url} target="_blank">View</a><button className="btn light" onClick={() => onRemove(index)}>Remove</button></span>)}</div> }
function readOrders(): Order[] { try { return JSON.parse(localStorage.getItem(MEDIA_QUEUE_KEY) || '[]') as Order[] } catch { return [] } }
function readState(): MediaState { try { return JSON.parse(localStorage.getItem(MEDIA_STATE_KEY) || '{}') as MediaState } catch { return {} } }
function readDispatch(): Order[] { try { return JSON.parse(localStorage.getItem(DISPATCH_QUEUE_KEY) || '[]') as Order[] } catch { return [] } }
