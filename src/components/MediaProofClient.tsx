'use client'

import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/DashboardShell'
import type { Order } from '@/types/domain'
import type { MediaProofRecord, MediaUpload } from '@/lib/media-proof'
import { mediaStatusForOrder, mediaTone } from '@/lib/status-projection'

const LOADING_ORDER_UNIT_ID = 'loading-order'
const MAX_LOADING_VIDEOS = 5

type MediaRecords = Record<string, MediaProofRecord>
type MediaMode = 'packing' | 'loading'

export function MediaProofClient({ initialOrders = [], initialRecords = {}, title = 'Packing Video', apiPath = '/api/media-proof', mode = 'packing' }: { initialOrders?: Order[]; initialRecords?: MediaRecords; title?: string; apiPath?: string; mode?: MediaMode }) {
  const [orders, setOrders] = useState<Order[]>(initialOrders)
  const [records, setRecords] = useState<MediaRecords>(initialRecords)
  const [active, setActive] = useState<Order | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { void loadQueue() }, [])

  async function loadQueue() {
    setSyncing(true); setError('')
    try {
      const response = await fetch(apiPath, { cache: 'no-store' })
      const json = await response.json()
      if (!response.ok || !json.ok) throw new Error(json.error || 'Could not load video queue')
      setOrders(json.data.orders || [])
      setRecords(json.data.records || {})
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load video queue') }
    finally { setSyncing(false) }
  }

  function status(order: Order) {
    return mediaStatusForOrder(order, records[order.id])
  }

  return <>
    <header className="top compact-top media-top"><div><h1 className="h1">{title}</h1><p className="muted mobile-media-hint">Open order → Upload video → Submit</p></div><button className="btn red" onClick={loadQueue} disabled={syncing}>{syncing ? 'Syncing…' : 'Refresh'}</button></header>
    {error && <div className="form-error">{error}</div>}
    <section className="card media-queue-card">
      <div className="media-queue-head"><h2>{title} Queue</h2><Badge tone="blue">{orders.length} orders</Badge></div>
      {syncing && <div className="machine-row compact"><span>Loading queue</span><Badge>Live</Badge></div>}
      <div className="desktop-table table-wrap"><table className="table"><thead><tr><th>SO</th><th>Delivery</th><th>Status</th><th>Action</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><strong>{order.salesOrderNumber}</strong></td><td>{order.deliveryDate}</td><td><Badge tone={mediaTone(status(order))}>{status(order)}</Badge></td><td><button className="btn light" onClick={() => setActive(order)}>Open</button></td></tr>)}</tbody></table></div>
      <div className="mobile-cards media-order-list">{orders.map((order) => <OrderCard key={order.id} order={order} record={records[order.id]} mode={mode} status={status(order)} onOpen={() => setActive(order)} />)}</div>
      {!orders.length && !syncing && <div className="empty-state"><strong>No orders pending</strong><span className="muted">Everything is clear here.</span></div>}
    </section>
    {active && <MediaModal order={active} record={records[active.id]} apiPath={apiPath} title={title} mode={mode} onClose={() => setActive(null)} onChanged={(record) => setRecords((prev) => ({ ...prev, [active.id]: record }))} onSubmitted={(orderId) => { setOrders((prev) => prev.filter((order) => order.id !== orderId)); setActive(null) }} />}
  </>
}

function OrderCard({ order, record, mode, status, onOpen }: { order: Order; record?: MediaProofRecord; mode: MediaMode; status: string; onOpen: () => void }) {
  const uploaded = mode === 'loading' ? (record?.units?.[LOADING_ORDER_UNIT_ID]?.videos?.length || 0) : order.machines.reduce((sum, machine) => sum + Math.min(1, record?.units?.[machine.id]?.videos?.length || 0), 0)
  const total = mode === 'loading' ? MAX_LOADING_VIDEOS : order.machines.length
  return <article className="card mobile-order-card media-mobile-order-card" onClick={onOpen}>
    <div><strong>{order.salesOrderNumber}</strong><span>{mode === 'loading' ? 'Order loading videos' : `${order.machines.length} item videos`}</span></div>
    <div className="media-card-meta"><Badge tone={mediaTone(status as any)}>{status}</Badge><small>{uploaded}/{total} uploaded</small></div>
    <button className="btn red full">Open</button>
  </article>
}

function MediaModal({ order, record, apiPath, title, mode, onClose, onChanged, onSubmitted }: { order: Order; record?: MediaProofRecord; apiPath: string; title: string; mode: MediaMode; onClose: () => void; onChanged: (record: MediaProofRecord) => void; onSubmitted: (orderId: string) => void }) {
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [progressByUnit, setProgressByUnit] = useState<Record<string, number>>({})
  const loadingVideos = record?.units?.[LOADING_ORDER_UNIT_ID]?.videos || []
  const ready = useMemo(() => mode === 'loading' ? loadingVideos.length > 0 && loadingVideos.length <= MAX_LOADING_VIDEOS : order.machines.length > 0 && order.machines.every((machine) => (record?.units?.[machine.id]?.videos?.length || 0) > 0), [mode, loadingVideos.length, order, record])

  async function upload(unitId: string, files: FileList | null) {
    if (!files?.length) return
    const selected = Array.from(files)
    if (mode === 'loading' && loadingVideos.length + selected.length > MAX_LOADING_VIDEOS) { setMessage(`Maximum ${MAX_LOADING_VIDEOS} loading videos allowed`); return }
    setBusy(unitId); setMessage(''); setProgressByUnit((prev) => ({ ...prev, [unitId]: 0 }))
    try {
      for (const file of selected) {
        const json = await uploadVideoFile(order, unitId, file, apiPath, mode, (percent) => setProgressByUnit((prev) => ({ ...prev, [unitId]: percent })))
        onChanged(json.data.record)
      }
      setProgressByUnit((prev) => ({ ...prev, [unitId]: 100 }))
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Upload failed') }
    finally { setBusy('') }
  }

  async function submit() {
    if (!window.confirm(`Submit ${title.toLowerCase()} for ${order.salesOrderNumber}?`)) return
    setBusy('submit'); setMessage('')
    try {
      const response = await fetch(apiPath, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'submit', orderId: order.id }) })
      const json = await response.json()
      if (!response.ok || !json.ok) throw new Error(json.error || 'Submit failed')
      onChanged(json.data.record)
      onSubmitted(order.id)
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Submit failed') }
    finally { setBusy('') }
  }

  async function proceedWithoutVideo() {
    if (!window.confirm(`Proceed ${order.salesOrderNumber} without video?`)) return
    setBusy('skip'); setMessage('')
    try {
      const response = await fetch(apiPath, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'proceed_without_video', orderId: order.id }) })
      const json = await response.json()
      if (!response.ok || !json.ok) throw new Error(json.error || 'Proceed without video failed')
      onChanged(json.data.record)
      onSubmitted(order.id)
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Proceed without video failed') }
    finally { setBusy('') }
  }

  return <div className="modal-backdrop media-modal-backdrop" role="dialog" aria-modal="true"><section className="order-modal card media-mobile-modal"><div className="modal-head media-modal-head"><div><h1>{order.salesOrderNumber}</h1><p className="muted">{title}</p></div><button className="drawer-close" onClick={onClose}>×</button></div>{message && <div className={message.includes('success') ? 'form-success' : 'form-error'}>{message}</div>}{mode === 'loading' ? <LoadingVideoPanel videos={loadingVideos} busy={busy} progress={progressByUnit[LOADING_ORDER_UNIT_ID] || 0} onUpload={(files) => upload(LOADING_ORDER_UNIT_ID, files)} /> : <PackingVideoPanel order={order} record={record} busy={busy} progressByUnit={progressByUnit} onUpload={upload} />}<section className="modal-actions media-submit-bar"><button className="btn light" disabled={Boolean(busy) || Boolean(record?.submittedAt)} onClick={proceedWithoutVideo}>Skip</button><button className="btn red" disabled={!ready || Boolean(busy) || Boolean(record?.submittedAt)} onClick={submit}>{record?.submittedAt ? 'Submitted' : busy === 'submit' ? 'Submitting…' : 'Submit'}</button></section></section></div>
}

function LoadingVideoPanel({ videos, busy, progress, onUpload }: { videos: MediaUpload[]; busy: string; progress: number; onUpload: (files: FileList | null) => void }) {
  const remaining = MAX_LOADING_VIDEOS - videos.length
  return <section className="loading-video-panel"><div className="loading-video-drop"><div><strong>Loading Videos</strong><span>{videos.length}/{MAX_LOADING_VIDEOS} uploaded</span></div><label className={`btn red full ${remaining <= 0 ? 'disabled' : ''}`}>Upload Loading Video<input hidden disabled={remaining <= 0 || Boolean(busy)} type="file" accept="video/*" capture="environment" multiple onChange={(event) => onUpload(event.target.files)} /></label>{busy === LOADING_ORDER_UNIT_ID && <div className="mobile-upload-progress"><span>Uploading {progress || 0}%</span><progress value={progress || 0} max={100} /></div>}</div><Previews files={videos} /></section>
}

function PackingVideoPanel({ order, record, busy, progressByUnit, onUpload }: { order: Order; record?: MediaProofRecord; busy: string; progressByUnit: Record<string, number>; onUpload: (unitId: string, files: FileList | null) => void }) {
  return <><div className="desktop-table table-wrap"><table className="table"><thead><tr><th>Unit</th><th>Serial</th><th>Video</th><th>Upload</th></tr></thead><tbody>{order.machines.map((machine) => <tr key={machine.id}><td>{machine.itemName}</td><td>{machine.serialNumber || '—'}</td><td><Previews files={record?.units?.[machine.id]?.videos || []} /></td><td><label className="btn light">Upload Video<input hidden type="file" accept="video/*" capture="environment" multiple onChange={(event) => onUpload(machine.id, event.target.files)} /></label>{busy === machine.id && <span className="muted"> Uploading {progressByUnit[machine.id] || 0}%</span>}</td></tr>)}</tbody></table></div><div className="media-unit-cards">{order.machines.map((machine, index) => <article className="media-unit-card" key={machine.id}><div className="media-unit-top"><i>{index + 1}</i><div><strong>{machine.itemName}</strong><span>Serial: {machine.serialNumber || '—'}</span></div></div><Previews files={record?.units?.[machine.id]?.videos || []} /><label className="btn red full">Upload Video<input hidden type="file" accept="video/*" capture="environment" multiple onChange={(event) => onUpload(machine.id, event.target.files)} /></label>{busy === machine.id && <div className="mobile-upload-progress"><span>Uploading {progressByUnit[machine.id] || 0}%</span><progress value={progressByUnit[machine.id] || 0} max={100} /></div>}</article>)}</div></>
}

function Previews({ files }: { files: MediaUpload[] }) { return <div className="preview-strip media-preview-strip">{files.length ? files.map((file, index) => <span key={file.id}><a href={file.workdriveUrl || file.url} target="_blank">Video {index + 1}</a>{file.expiresAt && <small className="muted">expires {new Date(file.expiresAt).toLocaleDateString('en-IN')}</small>}</span>) : <em>No videos yet</em>}</div> }

async function uploadVideoFile(order: Order, unitId: string, file: File, apiPath: string, mode: MediaMode, onProgress: (percent: number) => void): Promise<any> {
  return uploadDirectToR2(order, unitId, file, apiPath, mode, onProgress)
}

async function uploadDirectToR2(order: Order, unitId: string, file: File, apiPath: string, mode: MediaMode, onProgress: (percent: number) => void): Promise<any> {
  const contentType = file.type || 'video/mp4'
  const targetResponse = await fetch('/api/r2/upload-target', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orderId: order.id, machineId: unitId, name: file.name, type: contentType, stage: mode }) })
  const targetJson = await parseJsonResponse(targetResponse, 'R2 upload target unavailable')
  if (!targetResponse.ok || !targetJson.ok) throw new Error(targetJson.error || 'R2 upload target unavailable')
  const target = targetJson.data
  if (target.corsReady === false) throw new Error(target.corsError || 'Cloudflare R2 bucket CORS is not configured for dispatch.bsmindia.com. Please add the R2 CORS policy and try again.')
  await uploadBlobToR2(target.uploadUrl, file, contentType, onProgress)
  const registered = await fetch(apiPath, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'register_r2_video', orderId: order.id, machineId: unitId, name: file.name, type: contentType, r2Key: target.key, url: target.publicUrl, expiresAt: target.expiresAt }) })
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
