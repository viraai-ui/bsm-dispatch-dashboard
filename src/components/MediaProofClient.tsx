'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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
  const [error, setError] = useState('')

  useEffect(() => { void loadQueue() }, [])

  async function loadQueue() {
    setError('')
    try {
      const response = await fetch(apiPath, { cache: 'no-store' })
      const json = await response.json()
      if (!response.ok || !json.ok) throw new Error(json.error || 'Could not load video queue')
      setOrders(json.data.orders || [])
      setRecords(json.data.records || {})
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not load video queue') }
  }

  function status(order: Order) {
    return mediaStatusForOrder(order, records[order.id])
  }

  return <>
    {error && <div className="form-error">{error}</div>}
    <section className="card media-queue-card">
      <div className="media-queue-head"><h2>{title} Queue</h2><Badge tone="blue">{orders.length} orders</Badge></div>
      <div className="desktop-table table-wrap"><table className="table"><thead><tr><th>SO</th><th>Delivery</th><th>Status</th><th>Action</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><strong>{order.salesOrderNumber}</strong></td><td>{order.deliveryDate}</td><td><Badge tone={mediaTone(status(order))}>{status(order)}</Badge></td><td><button className="btn light" onClick={() => setActive(order)}>Open</button></td></tr>)}</tbody></table></div>
      <div className="mobile-cards media-order-list">{orders.map((order) => <OrderCard key={order.id} order={order} record={records[order.id]} mode={mode} status={status(order)} onOpen={() => setActive(order)} />)}</div>
      {!orders.length && <div className="empty-state"><strong>No orders pending</strong><span className="muted">Everything is clear here.</span></div>}
    </section>
    {active && <MediaModal order={active} record={records[active.id]} apiPath={apiPath} title={title} mode={mode} onClose={() => setActive(null)} onChanged={(record) => setRecords((prev) => ({ ...prev, [active.id]: record }))} onSubmitted={(orderId) => { setOrders((prev) => prev.filter((order) => order.id !== orderId)); setActive(null) }} />}
  </>
}

function OrderCard({ order, record, mode, status, onOpen }: { order: Order; record?: MediaProofRecord; mode: MediaMode; status: string; onOpen: () => void }) {
  const uploaded = mode === 'loading' ? (record?.units?.[LOADING_ORDER_UNIT_ID]?.videos?.length || 0) : order.machines.reduce((sum, machine) => sum + Math.min(1, record?.units?.[machine.id]?.videos?.length || 0), 0)
  const total = mode === 'loading' ? MAX_LOADING_VIDEOS : order.machines.length
  return <article className="card mobile-order-card media-mobile-order-card" onClick={onOpen}>
    <div><strong>{order.salesOrderNumber}</strong><span>{mode === 'loading' ? 'Order loading' : 'Item upload'}</span></div><small className="media-count-pill">{mode === 'loading' ? `${uploaded}/${total} videos` : `${total} Item Videos`}</small>
    <div className="media-card-meta"><Badge tone={mediaTone(status as any)}>{status}</Badge></div>
    <button className="btn light tiny-view" onClick={(event) => { event.stopPropagation(); onOpen() }}>View</button>
  </article>
}

function MediaModal({ order, record, apiPath, title, mode, onClose, onChanged, onSubmitted }: { order: Order; record?: MediaProofRecord; apiPath: string; title: string; mode: MediaMode; onClose: () => void; onChanged: (record: MediaProofRecord) => void; onSubmitted: (orderId: string) => void }) {
  const [busy, setBusy] = useState('')
  const [message, setMessage] = useState('')
  const [progressByUnit, setProgressByUnit] = useState<Record<string, number>>({})
  const loadingVideos = record?.units?.[LOADING_ORDER_UNIT_ID]?.videos || []
  const ready = useMemo(() => mode === 'loading' ? loadingVideos.length > 0 && loadingVideos.length <= MAX_LOADING_VIDEOS : order.machines.length > 0 && order.machines.every((machine) => (record?.units?.[machine.id]?.videos?.length || 0) > 0), [mode, loadingVideos.length, order, record])

  async function upload(unitId: string, files: FileList | File[] | null) {
    if (!files?.length) return
    const selected = Array.from(files).map((file, index) => normalizeCameraVideoFile(file, order.salesOrderNumber, unitId, index))
    if (mode === 'loading' && loadingVideos.length + selected.length > MAX_LOADING_VIDEOS) { setMessage(`Maximum ${MAX_LOADING_VIDEOS} loading videos allowed`); return }
    setBusy(unitId); setMessage(''); setProgressByUnit((prev) => ({ ...prev, [unitId]: 1 }))
    try {
      for (const file of selected) {
        if (!file.size) throw new Error('The recorded video file is empty. Please record again or choose it from Gallery.')
        if (!file.type.startsWith('video/')) throw new Error('This file is not detected as a video. Please try Gallery if camera upload fails.')
        const json = await uploadVideoFile(order, unitId, file, apiPath, mode, (percent) => setProgressByUnit((prev) => ({ ...prev, [unitId]: percent })))
        onChanged(json.data.record)
      }
      setProgressByUnit((prev) => ({ ...prev, [unitId]: 100 }))
      setMessage('Video uploaded successfully.')
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Upload failed') }
    finally { setBusy('') }
  }

  async function deleteVideo(unitId: string, videoId: string) {
    if (!window.confirm('Delete this uploaded video?')) return
    setBusy(`delete-${videoId}`); setMessage('')
    try {
      const response = await fetch(apiPath, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'delete_video', orderId: order.id, machineId: unitId, videoId }) })
      const json = await response.json()
      if (!response.ok || !json.ok) throw new Error(json.error || 'Delete failed')
      onChanged(json.data.record)
    } catch (err) { setMessage(err instanceof Error ? err.message : 'Delete failed') }
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

  return <div className="modal-backdrop media-modal-backdrop" role="dialog" aria-modal="true"><section className="order-modal card media-mobile-modal"><div className="modal-head media-modal-head"><div><h1>{order.salesOrderNumber}</h1><p className="muted">{title}</p></div><button className="drawer-close" onClick={onClose}>×</button></div><div className="media-modal-body">{message && <div className={message.includes('success') ? 'form-success' : 'form-error'}>{message}</div>}{mode === 'loading' ? <LoadingVideoPanel videos={loadingVideos} busy={busy} progress={progressByUnit[LOADING_ORDER_UNIT_ID] || 0} onUpload={(files) => upload(LOADING_ORDER_UNIT_ID, files)} onDelete={(videoId) => deleteVideo(LOADING_ORDER_UNIT_ID, videoId)} /> : <PackingVideoPanel order={order} record={record} busy={busy} progressByUnit={progressByUnit} onUpload={upload} onDelete={deleteVideo} />}</div><section className="modal-actions media-submit-bar"><button className="btn light" disabled={Boolean(busy) || Boolean(record?.submittedAt)} onClick={proceedWithoutVideo}>Skip</button><button className="btn red" disabled={!ready || Boolean(busy) || Boolean(record?.submittedAt)} onClick={submit}>{record?.submittedAt ? 'Submitted' : busy === 'submit' ? 'Submitting…' : 'Submit'}</button></section></section></div>
}

function LoadingVideoPanel({ videos, busy, progress, onUpload, onDelete }: { videos: MediaUpload[]; busy: string; progress: number; onUpload: (files: FileList | File[] | null) => void; onDelete: (videoId: string) => void }) {
  const remaining = MAX_LOADING_VIDEOS - videos.length
  return <section className="loading-video-panel"><div className="loading-video-drop"><div><strong>Loading Videos</strong><span>{videos.length}/{MAX_LOADING_VIDEOS} uploaded</span></div><VideoUploadChoices disabled={remaining <= 0 || Boolean(busy)} onUpload={onUpload} galleryMultiple />{busy === LOADING_ORDER_UNIT_ID && <div className="mobile-upload-progress"><span>Uploading {progress || 0}%</span><progress value={progress || 0} max={100} /></div>}</div><Previews files={videos} onDelete={onDelete} busy={busy} /></section>
}

function PackingVideoPanel({ order, record, busy, progressByUnit, onUpload, onDelete }: { order: Order; record?: MediaProofRecord; busy: string; progressByUnit: Record<string, number>; onUpload: (unitId: string, files: FileList | File[] | null) => void; onDelete: (unitId: string, videoId: string) => void }) {
  return <><div className="desktop-table table-wrap"><table className="table"><thead><tr><th>Unit</th><th>Serial</th><th>Video</th><th>Upload</th></tr></thead><tbody>{order.machines.map((machine) => <tr key={machine.id}><td>{machine.itemName}</td><td>{machine.serialNumber || '—'}</td><td><Previews files={record?.units?.[machine.id]?.videos || []} onDelete={(videoId) => onDelete(machine.id, videoId)} busy={busy} /></td><td><VideoUploadChoices disabled={Boolean(busy)} onUpload={(files) => onUpload(machine.id, files)} galleryMultiple />{busy === machine.id && <span className="muted"> Uploading {progressByUnit[machine.id] || 0}%</span>}</td></tr>)}</tbody></table></div><div className="media-unit-cards">{order.machines.map((machine, index) => <article className="media-unit-card" key={machine.id}><div className="media-unit-top"><i>{index + 1}</i><div><strong>{machine.itemName}</strong><span>Serial: {machine.serialNumber || '—'}</span></div></div>{(record?.units?.[machine.id]?.videos?.length || 0) > 0 && <span className="upload-check">✓</span>}<Previews files={record?.units?.[machine.id]?.videos || []} onDelete={(videoId) => onDelete(machine.id, videoId)} busy={busy} /><VideoUploadChoices disabled={Boolean(busy)} onUpload={(files) => onUpload(machine.id, files)} galleryMultiple />{busy === machine.id && <div className="mobile-upload-progress"><span>Uploading {progressByUnit[machine.id] || 0}%</span><progress value={progressByUnit[machine.id] || 0} max={100} /></div>}</article>)}</div></>
}

function VideoUploadChoices({ disabled, onUpload, galleryMultiple = false }: { disabled?: boolean; onUpload: (files: FileList | File[] | null) => void; galleryMultiple?: boolean }) {
  const [cameraOpen, setCameraOpen] = useState(false)
  const [recording, setRecording] = useState(false)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState('')
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const cancelledRef = useRef(false)

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream
    return () => {}
  }, [stream])

  async function openCamera() {
    if (disabled || cameraOpen || recording) return
    setError('')
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('In-app camera is not supported on this browser. Please use Gallery.')
      return
    }
    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60, max: 60 } }, audio: true })
      setStream(nextStream)
      setCameraOpen(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Camera permission failed')
    }
  }

  function startRecording() {
    if (!stream || recording) return
    setError('')
    try {
      const mimeType = bestRecorderMimeType()
      chunksRef.current = []
      cancelledRef.current = false
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data) }
      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || 'video/webm'
        const blob = new Blob(chunksRef.current, { type })
        const file = new File([blob], `recorded-video-${Date.now()}.${extensionForVideoType(type)}`, { type, lastModified: Date.now() })
        if (stream) stopStream(stream)
        setStream(null)
        setCameraOpen(false)
        setRecording(false)
        if (cancelledRef.current) return
        if (file.size > 0) onUpload([file])
        else setError('Recording was empty. Please record again.')
      }
      recorderRef.current = recorder
      setRecording(true)
      recorder.start(1000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recording failed')
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }

  function cancelRecording() {
    const current = recorderRef.current
    recorderRef.current = null
    cancelledRef.current = true
    if (current?.state === 'recording') current.stop()
    if (stream) stopStream(stream)
    chunksRef.current = []
    setStream(null)
    setCameraOpen(false)
    setRecording(false)
  }

  return <div className="video-upload-choices"><button type="button" className={`video-choice-btn record ${disabled ? 'disabled' : ''}`} disabled={disabled} onClick={openCamera}><span aria-hidden="true">📹</span><strong>Record Video</strong></button><label className={`video-choice-btn gallery ${disabled ? 'disabled' : ''}`}><span aria-hidden="true">▣</span><strong>Gallery</strong><input hidden disabled={disabled} type="file" accept="video/*" multiple={galleryMultiple} onChange={(event) => { onUpload(event.target.files); event.target.value = '' }} /></label>{error && <small className="form-error video-record-error">{error}</small>}{cameraOpen && <div className="recorder-overlay"><div className="recorder-box"><video ref={videoRef} autoPlay playsInline muted /><div className="recorder-actions">{recording ? <><button type="button" className="btn light" onClick={cancelRecording}>Cancel</button><button type="button" className="btn red" onClick={stopRecording}>Stop & Upload</button></> : <><button type="button" className="btn light" onClick={cancelRecording}>Close</button><button type="button" className="btn red" onClick={startRecording}>Start Recording</button></>}</div></div></div>}</div>
}

function bestRecorderMimeType() {
  const types = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || ''
}

function stopStream(stream: MediaStream) { stream.getTracks().forEach((track) => track.stop()) }

function Previews({ files, onDelete, busy }: { files: MediaUpload[]; onDelete?: (videoId: string) => void; busy?: string }) { return <div className="preview-strip media-preview-strip">{files.length ? files.map((file, index) => <span key={file.id} className="media-preview-chip"><a href={file.workdriveUrl || file.url} target="_blank">Video {index + 1}</a>{file.expiresAt && <small className="muted">expires {new Date(file.expiresAt).toLocaleDateString('en-IN')}</small>}{onDelete && <button type="button" className="media-delete-video" disabled={busy === `delete-${file.id}`} onClick={() => onDelete(file.id)} aria-label={`Delete Video ${index + 1}`}>×</button>}</span>) : <em>No videos yet</em>}</div> }

async function uploadVideoFile(order: Order, unitId: string, file: File, apiPath: string, mode: MediaMode, onProgress: (percent: number) => void): Promise<any> {
  return uploadDirectToR2(order, unitId, file, apiPath, mode, onProgress)
}

function normalizeCameraVideoFile(file: File, salesOrderNumber: string, unitId: string, index: number) {
  const type = file.type && file.type.startsWith('video/') ? file.type : 'video/mp4'
  const extension = extensionForVideoType(type)
  const originalName = file.name && file.name.trim() ? file.name.trim() : ''
  const safeName = originalName && /\.[a-z0-9]{2,5}$/i.test(originalName) ? originalName : `${salesOrderNumber}-${unitId}-${Date.now()}-${index + 1}.${extension}`
  if (file.name === safeName && file.type === type) return file
  return new File([file], safeName, { type, lastModified: file.lastModified || Date.now() })
}

function extensionForVideoType(type: string) {
  if (type.includes('quicktime')) return 'mov'
  if (type.includes('webm')) return 'webm'
  if (type.includes('3gpp')) return '3gp'
  return 'mp4'
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
    const timeout = window.setTimeout(() => { xhr.abort(); reject(new Error('Upload is taking too long or got stuck. Please check internet and try again, or upload a shorter video.')) }, 180000)
    xhr.open('PUT', uploadUrl)
    xhr.setRequestHeader('content-type', contentType)
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.max(1, Math.min(95, Math.round((event.loaded / event.total) * 100)))) }
    xhr.onload = () => { window.clearTimeout(timeout); if (xhr.status >= 200 && xhr.status < 300) { onProgress(100); resolve() } else reject(new Error(`Cloudflare R2 upload failed: HTTP ${xhr.status}. Please try again.`)) }
    xhr.onerror = () => { window.clearTimeout(timeout); reject(new Error('Upload failed due to network connection. Please try again on stronger internet.')) }
    xhr.onabort = () => window.clearTimeout(timeout)
    xhr.send(file)
  })
}
