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
  try {
    return await uploadDirectToWorkDrive(order, machineId, file, onProgress)
  } catch {
    const form = new FormData()
    form.append('orderId', order.id)
    form.append('machineId', machineId)
    form.append('file', file)
    return uploadWithProgress(form, onProgress)
  }
}

async function uploadDirectToWorkDrive(order: Order, machineId: string, file: File, onProgress: (percent: number) => void): Promise<any> {
  const targetResponse = await fetch('/api/workdrive/upload-target', { cache: 'no-store' })
  const targetJson = await targetResponse.json()
  if (!targetResponse.ok || !targetJson.ok) throw new Error(targetJson.error || 'WorkDrive upload target unavailable')
  const target = targetJson.data
  const machine = order.machines.find((item) => item.id === machineId)
  const fileName = mediaVideoFileName(order.salesOrderNumber, machine?.itemName || 'Machine', file.name, file.type)
  const uploaded = await uploadBlobToWorkDrive(target.uploadUrl, target.token, target.parentId, fileName, file, onProgress)
  const registered = await fetch('/api/media-proof', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'register_workdrive_video', orderId: order.id, machineId, name: fileName, type: file.type, workdriveFileId: uploaded.fileId, workdriveUrl: uploaded.url }),
  })
  const json = await registered.json()
  if (!registered.ok || !json.ok) throw new Error(json.error || 'Could not register WorkDrive video')
  return json
}

function uploadBlobToWorkDrive(uploadUrl: string, token: string, parentId: string, fileName: string, file: File, onProgress: (percent: number) => void): Promise<{ fileId: string | null; url: string | null }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', uploadUrl)
    xhr.setRequestHeader('Authorization', `Zoho-oauthtoken ${token}`)
    xhr.setRequestHeader('x-filename', encodeURIComponent(fileName))
    xhr.setRequestHeader('x-parent_id', parentId)
    xhr.setRequestHeader('x-streammode', '1')
    xhr.setRequestHeader('content-type', file.type || 'application/octet-stream')
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100)) }
    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText || '{}')
        if (xhr.status < 200 || xhr.status >= 300) throw new Error(json.message || json.errors?.[0]?.message || 'WorkDrive upload failed')
        const first = Array.isArray(json.data) ? json.data[0] : json.data
        const attrs = first?.attributes || first || {}
        const fileId = String(first?.id || attrs.resource_id || attrs.id || '') || null
        const url = attrs.permalink || attrs.download_url || attrs.preview_url || (fileId ? `https://workdrive.zoho.${attrs.dc || 'in'}/file/${fileId}` : null)
        resolve({ fileId, url })
      } catch (error) { reject(error instanceof Error ? error : new Error('WorkDrive upload failed')) }
    }
    xhr.onerror = () => reject(new Error('WorkDrive direct upload blocked'))
    xhr.send(file)
  })
}

function mediaVideoFileName(salesOrderNumber: string, machineName: string, originalName: string, mimeType: string) {
  const extension = originalName.includes('.') ? originalName.split('.').pop() : mimeExtension(mimeType)
  return `${safeMediaName(salesOrderNumber)} - ${safeMediaName(machineName)}${extension ? `.${extension}` : ''}`
}

function safeMediaName(value: string) { return value.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim() }
function mimeExtension(type: string) { if (type.includes('mp4')) return 'mp4'; if (type.includes('quicktime')) return 'mov'; if (type.includes('webm')) return 'webm'; return '' }

function uploadWithProgress(form: FormData, onProgress: (percent: number) => void): Promise<any> { return new Promise((resolve, reject) => { const xhr = new XMLHttpRequest(); xhr.open('POST', '/api/media-proof/upload'); xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100)) }; xhr.onload = () => { try { const json = JSON.parse(xhr.responseText || '{}'); if (xhr.status < 200 || xhr.status >= 300 || !json.ok) reject(new Error(json.error || 'Upload failed')); else resolve(json) } catch { reject(new Error('Upload failed: server returned an invalid response')) } }; xhr.onerror = () => reject(new Error('Upload failed: network error')); xhr.send(form) }) }
