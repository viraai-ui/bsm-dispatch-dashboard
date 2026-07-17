'use client'

import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/DashboardShell'
import type { Order } from '@/types/domain'
import type { MediaProofRecord, MediaUpload } from '@/lib/media-proof'
import { mediaStatusForOrder, mediaTone } from '@/lib/status-projection'

type MediaRecords = Record<string, MediaProofRecord>

export function MediaProofClient({ initialOrders = [], initialRecords = {} }: { initialOrders?: Order[]; initialRecords?: MediaRecords }) {
  const [orders, setOrders] = useState<Order[]>(initialOrders)
  const [records, setRecords] = useState<MediaRecords>(initialRecords)
  const [active, setActive] = useState<Order | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { void loadQueue() }, [])

  async function loadQueue() {
    setSyncing(true); setError('')
    try {
      const response = await fetch('/api/media-proof', { cache: 'no-store' })
      const json = await response.json()
      if (!response.ok || !json.ok) throw new Error(json.error || 'Could not load media proof queue')
      setOrders(json.data.orders || [])
      setRecords(json.data.records || {})
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load media proof queue') }
    finally { setSyncing(false) }
  }

  function status(order: Order) {
    return mediaStatusForOrder(order, records[order.id])
  }

  return <>
    <header className="top compact-top"><div><h1 className="h1">Video Upload</h1></div><button className="btn red" onClick={loadQueue} disabled={syncing}>{syncing ? 'Syncing…' : 'Refresh'}</button></header>
    {error && <div className="form-error">{error}</div>}
    <section className="card"><h2>Media Queue</h2>{syncing && <div className="machine-row compact"><span>Loading media queue</span><Badge>Live</Badge></div>}<div className="desktop-table table-wrap"><table className="table"><thead><tr><th>SO</th><th>Customer</th><th>Delivery</th><th>Media Status</th><th>Action</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><strong>{order.salesOrderNumber}</strong></td><td>{order.customerName}</td><td>{order.deliveryDate}</td><td><Badge tone={mediaTone(status(order))}>{status(order)}</Badge></td><td><button className="btn light" onClick={() => setActive(order)}>View</button></td></tr>)}</tbody></table></div><div className="mobile-cards">{orders.map((order) => <article className="card mobile-order-card" key={order.id}><strong>{order.salesOrderNumber}</strong><p className="muted">{order.customerName}</p><Badge tone={mediaTone(status(order))}>{status(order)}</Badge><button className="btn light full" onClick={() => setActive(order)}>View</button></article>)}</div></section>
    {active && <MediaModal order={active} record={records[active.id]} onClose={() => setActive(null)} onChanged={(record) => setRecords((prev) => ({ ...prev, [active.id]: record }))} />}
  </>
}

function MediaModal({ order, record, onClose, onChanged }: { order: Order; record?: MediaProofRecord; onClose: () => void; onChanged: (record: MediaProofRecord) => void }) {
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [progressByMachine, setProgressByMachine] = useState<Record<string, number>>({})
  const ready = useMemo(() => order.machines.length > 0 && order.machines.every((machine) => (record?.units?.[machine.id]?.videos?.length || 0) > 0), [order, record])

  async function upload(machineId: string, _kind: 'photo' | 'video', files: FileList | null) {
    if (!files?.length) return
    setBusy(machineId); setMessage(''); setProgressByMachine((prev) => ({ ...prev, [machineId]: 0 }))
    try {
      for (const file of Array.from(files)) {
        const json = await uploadVideoFile(order, machineId, file, (percent) => setProgressByMachine((prev) => ({ ...prev, [machineId]: percent })))
        onChanged(json.data.record)
      }
      setProgressByMachine((prev) => ({ ...prev, [machineId]: 100 }))
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Upload failed') }
    finally { setBusy('') }
  }

  async function submit() {
    if (!window.confirm(`Submit video proof for ${order.salesOrderNumber}?`)) return
    setBusy('submit'); setMessage('')
    try {
      const response = await fetch('/api/media-proof', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'submit', orderId: order.id }) })
      const json = await response.json()
      if (!response.ok || !json.ok) throw new Error(json.error || 'Submit failed')
      onChanged(json.data.record)
      setMessage('Submitted successfully')
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Submit failed') }
    finally { setBusy('') }
  }

  async function proceedWithoutVideo() {
    if (!window.confirm(`Proceed ${order.salesOrderNumber} without video and move it to delivery stage?`)) return
    setBusy('skip'); setMessage('')
    try {
      const response = await fetch('/api/media-proof', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'proceed_without_video', orderId: order.id }) })
      const json = await response.json()
      if (!response.ok || !json.ok) throw new Error(json.error || 'Proceed without video failed')
      onChanged(json.data.record)
      setMessage('Moved to delivery stage')
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Proceed without video failed') }
    finally { setBusy('') }
  }

  return <div className="modal-backdrop" role="dialog" aria-modal="true"><section className="order-modal card"><div className="modal-head"><div><h1>{order.salesOrderNumber}</h1><p className="muted">{order.customerName} · {order.deliveryDate}</p></div><button className="drawer-close" onClick={onClose}>×</button></div>{message && <div className={message.includes('success') || message.includes('delivery') ? 'form-success' : 'form-error'}>{message}</div>}<div className="desktop-table table-wrap"><table className="table"><thead><tr><th>Unit</th><th>Serial</th><th>Video</th><th>Upload</th></tr></thead><tbody>{order.machines.map((machine) => <tr key={machine.id}><td>{machine.itemName}</td><td>{machine.serialNumber || '—'}</td><td><Previews files={record?.units?.[machine.id]?.videos || []} /></td><td><label className="btn light">Upload Video<input hidden type="file" accept="video/*" capture="environment" multiple onChange={(event) => upload(machine.id, 'video', event.target.files)} /></label>{busy === machine.id && <span className="muted"> Uploading {progressByMachine[machine.id] || 0}%</span>}{busy === machine.id && <progress value={progressByMachine[machine.id] || 0} max={100} style={{ width: 120, marginLeft: 8 }} />}</td></tr>)}</tbody></table></div><section className="modal-actions"><button className="btn light" disabled={Boolean(busy) || Boolean(record?.submittedAt)} onClick={proceedWithoutVideo}>{busy === 'skip' ? 'Processing…' : 'Proceed Without Video'}</button><button className="btn red" disabled={!ready || Boolean(busy) || Boolean(record?.submittedAt)} onClick={submit}>{record?.submittedAt ? 'Submitted' : busy === 'submit' ? 'Submitting…' : 'Submit Media Proof'}</button></section></section></div>
}

function Previews({ files }: { files: MediaUpload[] }) { return <div className="preview-strip">{files.map((file) => <span key={file.id}><a href={file.workdriveUrl || file.url} target="_blank">View</a>{file.expiresAt && <small className="muted"> expires {new Date(file.expiresAt).toLocaleDateString('en-IN')}</small>}</span>)}</div> }

async function uploadVideoFile(order: Order, machineId: string, file: File, onProgress: (percent: number) => void): Promise<any> {
  // Videos must go directly to Cloudflare R2. The old server proxy fallback posts the
  // entire video through a Vercel function, which returns a non-JSON 413/timeout page
  // for real phone videos and surfaces as "server returned an invalid response".
  return uploadDirectToR2(order, machineId, file, onProgress)
}

async function uploadDirectToR2(order: Order, machineId: string, file: File, onProgress: (percent: number) => void): Promise<any> {
  const contentType = file.type || 'video/mp4'
  const targetResponse = await fetch('/api/r2/upload-target', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orderId: order.id, machineId, name: file.name, type: contentType }) })
  const targetJson = await parseJsonResponse(targetResponse, 'R2 upload target unavailable')
  if (!targetResponse.ok || !targetJson.ok) throw new Error(targetJson.error || 'R2 upload target unavailable')
  const target = targetJson.data
  if (target.corsReady === false) throw new Error(target.corsError || 'Cloudflare R2 bucket CORS is not configured for dispatch.bsmindia.com. Please add the R2 CORS policy and try again.')
  await uploadBlobToR2(target.uploadUrl, file, contentType, onProgress)
  const registered = await fetch('/api/media-proof', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'register_r2_video', orderId: order.id, machineId, name: file.name, type: contentType, r2Key: target.key, url: target.publicUrl, expiresAt: target.expiresAt }),
  })
  const json = await parseJsonResponse(registered, 'Could not register R2 video')
  if (!registered.ok || !json.ok) throw new Error(json.error || 'Could not register R2 video')
  return json
}

async function parseJsonResponse(response: Response, fallback: string): Promise<any> {
  try { return await response.json() }
  catch { return { ok: false, error: `${fallback}: server returned an invalid response (HTTP ${response.status})` } }
}

function uploadBlobToR2(uploadUrl: string, file: File, contentType: string, onProgress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', uploadUrl)
    xhr.setRequestHeader('content-type', contentType)
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100)) }
    xhr.onload = () => { if (xhr.status >= 200 && xhr.status < 300) resolve(); else reject(new Error(`Cloudflare R2 upload failed: HTTP ${xhr.status}. Check the R2 bucket CORS policy and presigned URL configuration.`)) }
    xhr.onerror = () => reject(new Error('Cloudflare R2 upload failed before the request completed. This is usually caused by missing/incorrect R2 CORS for https://dispatch.bsmindia.com.'))
    xhr.send(file)
  })
}
