import type { Order } from '@/types/domain'
import { uploadBufferToGithubMedia } from './github-media'
import { githubReadJson, githubWriteJson, listProcessedOrders } from './workflow-store'
import { uploadBufferToWorkDrive, uploadVideoToWorkDrive } from './workdrive'
import { cleanupExpiredMediaProofStore, mediaExpiresAt } from './media-retention'

export type MediaUpload = {
  id: string
  name: string
  type: string
  kind: 'photo' | 'video'
  url: string
  workdriveFileId?: string | null
  workdriveUrl?: string | null
  storageProvider?: 'r2' | 'workdrive' | 'github' | 'inline'
  r2Key?: string | null
  uploadedAt: string
  expiresAt?: string
}

export type MediaProofRecord = {
  orderId: string
  salesOrderNumber: string
  submittedAt?: string | null
  videoNotRequired?: boolean
  units: Record<string, { photos: MediaUpload[]; videos: MediaUpload[] }>
}

export type MediaProofStore = { records: Record<string, MediaProofRecord> }
const MEDIA_PROOF_PATH = 'data/media-proof-store.json'

export async function readMediaProofStore() {
  const { data } = await githubReadJson<MediaProofStore>(MEDIA_PROOF_PATH, { records: {} })
  const cleaned = await cleanupExpiredMediaProofStore({ records: data.records || {} })
  if (cleaned.changed) await githubWriteJson(MEDIA_PROOF_PATH, cleaned.store, 'Cleanup expired media proof files')
  return { records: cleaned.store.records || {} }
}

export async function cleanupExpiredMediaProofs() {
  const { data } = await githubReadJson<MediaProofStore>(MEDIA_PROOF_PATH, { records: {} })
  const cleaned = await cleanupExpiredMediaProofStore({ records: data.records || {} })
  if (cleaned.changed) await githubWriteJson(MEDIA_PROOF_PATH, cleaned.store, 'Cleanup expired media proof files')
  return cleaned.result
}

export async function listMediaProofOrders() {
  const processed = await listProcessedOrders()
  const store = await readMediaProofStore()
  const orders = processed.map((item) => item.processedOrder).filter((order): order is Order => Boolean(order))
  return { orders, records: store.records }
}

export async function saveMediaUpload(order: Order, machineId: string, kind: 'photo' | 'video', upload: { name: string; type: string; dataUrl: string }) {
  const store = await readMediaProofStore()
  const current = store.records[order.id] || { orderId: order.id, salesOrderNumber: order.salesOrderNumber, submittedAt: null, units: {} }
  const unit = current.units[machineId] || { photos: [], videos: [] }
  const machine = order.machines.find((item) => item.id === machineId)
  const extension = upload.name.includes('.') ? upload.name.split('.').pop() : mimeExtension(upload.type)
  const generatedName = `${safeName(order.salesOrderNumber)} - ${safeName(machine?.itemName || 'Machine')}${extension ? `.${extension}` : ''}`
  const workDrive = kind === 'video' ? await uploadVideoToWorkDrive(generatedName, upload.dataUrl, upload.type) : { fileId: null, url: null, storedInWorkDrive: false }
  const uploadedAt = new Date().toISOString()
  const file: MediaUpload = {
    id: `${machineId}-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: kind === 'video' ? generatedName : upload.name,
    type: upload.type,
    kind,
    url: workDrive.url || upload.dataUrl,
    workdriveFileId: workDrive.fileId,
    workdriveUrl: workDrive.url,
    storageProvider: workDrive.storedInWorkDrive ? 'workdrive' : 'inline',
    uploadedAt,
    expiresAt: mediaExpiresAt(uploadedAt),
  }
  const key = kind === 'photo' ? 'photos' : 'videos'
  current.units[machineId] = { ...unit, [key]: [...unit[key], file] }
  store.records[order.id] = current
  await githubWriteJson(MEDIA_PROOF_PATH, store, `Save media proof for ${order.salesOrderNumber}`)
  return current
}


export async function saveMediaUploadBuffer(order: Order, machineId: string, upload: { name: string; type: string; buffer: Buffer }) {
  const store = await readMediaProofStore()
  const current = store.records[order.id] || { orderId: order.id, salesOrderNumber: order.salesOrderNumber, submittedAt: null, units: {} }
  const unit = current.units[machineId] || { photos: [], videos: [] }
  const machine = order.machines.find((item) => item.id === machineId)
  const extension = upload.name.includes('.') ? upload.name.split('.').pop() : mimeExtension(upload.type)
  const generatedName = `${safeName(order.salesOrderNumber)} - ${safeName(machine?.itemName || 'Machine')}${extension ? `.${extension}` : ''}`
  let storage
  try {
    storage = await uploadBufferToWorkDrive(generatedName, upload.buffer, upload.type)
  } catch {
    storage = await uploadBufferToGithubMedia(generatedName, upload.buffer, upload.type)
  }
  if (!storage.url) storage = await uploadBufferToGithubMedia(generatedName, upload.buffer, upload.type)
  const uploadedAt = new Date().toISOString()
  const file: MediaUpload = {
    id: `${machineId}-video-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: generatedName,
    type: upload.type,
    kind: 'video',
    url: storage.url || '',
    workdriveFileId: storage.storedInWorkDrive ? storage.fileId : null,
    workdriveUrl: storage.storedInWorkDrive ? storage.url : null,
    storageProvider: storage.storedInWorkDrive ? 'workdrive' : 'github',
    uploadedAt,
    expiresAt: mediaExpiresAt(uploadedAt),
  }
  current.units[machineId] = { ...unit, videos: [...unit.videos, file] }
  store.records[order.id] = current
  await githubWriteJson(MEDIA_PROOF_PATH, store, `Save media proof for ${order.salesOrderNumber}`)
  return current
}


export async function registerWorkDriveVideo(order: Order, machineId: string, upload: { name: string; type: string; fileId: string | null; url: string | null }) {
  return registerStoredVideo(order, machineId, { ...upload, provider: 'workdrive' })
}

export async function registerR2Video(order: Order, machineId: string, upload: { name: string; type: string; key: string; url: string; expiresAt?: string | null }) {
  return registerStoredVideo(order, machineId, { name: upload.name, type: upload.type, fileId: null, url: upload.url, key: upload.key, expiresAt: upload.expiresAt, provider: 'r2' })
}

async function registerStoredVideo(order: Order, machineId: string, upload: { name: string; type: string; fileId: string | null; url: string | null; key?: string | null; expiresAt?: string | null; provider: 'r2' | 'workdrive' }) {
  const store = await readMediaProofStore()
  const current = store.records[order.id] || { orderId: order.id, salesOrderNumber: order.salesOrderNumber, submittedAt: null, units: {} }
  const unit = current.units[machineId] || { photos: [], videos: [] }
  const uploadedAt = new Date().toISOString()
  const file: MediaUpload = {
    id: `${machineId}-video-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: upload.name,
    type: upload.type,
    kind: 'video',
    url: upload.url || '',
    workdriveFileId: upload.provider === 'workdrive' ? upload.fileId : null,
    workdriveUrl: upload.provider === 'workdrive' ? upload.url : null,
    r2Key: upload.provider === 'r2' ? upload.key || null : null,
    storageProvider: upload.provider,
    uploadedAt,
    expiresAt: upload.expiresAt || mediaExpiresAt(uploadedAt),
  }
  current.units[machineId] = { ...unit, videos: [...unit.videos, file] }
  store.records[order.id] = current
  await githubWriteJson(MEDIA_PROOF_PATH, store, `Save media proof for ${order.salesOrderNumber}`)
  return current
}

export function mediaVideoFileName(order: Order, machineId: string, originalName: string, mimeType: string) {
  const machine = order.machines.find((item) => item.id === machineId)
  const extension = originalName.includes('.') ? originalName.split('.').pop() : mimeExtension(mimeType)
  return `${safeName(order.salesOrderNumber)} - ${safeName(machine?.itemName || 'Machine')}${extension ? `.${extension}` : ''}`
}

export async function submitMediaProof(orderId: string) {
  const store = await readMediaProofStore()
  const record = store.records[orderId]
  if (!record) throw new Error('No media proof found for this order')
  record.submittedAt = new Date().toISOString()
  store.records[orderId] = record
  await githubWriteJson(MEDIA_PROOF_PATH, store, `Submit media proof for ${record.salesOrderNumber}`)
  return record
}

export async function proceedWithoutVideo(order: Order) {
  const store = await readMediaProofStore()
  const current = store.records[order.id] || { orderId: order.id, salesOrderNumber: order.salesOrderNumber, submittedAt: null, units: {} }
  current.submittedAt = new Date().toISOString()
  current.videoNotRequired = true
  store.records[order.id] = current
  await githubWriteJson(MEDIA_PROOF_PATH, store, `Proceed without video for ${order.salesOrderNumber}`)
  return current
}

function safeName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim()
}

function mimeExtension(type: string) {
  if (type.includes('mp4')) return 'mp4'
  if (type.includes('quicktime')) return 'mov'
  if (type.includes('webm')) return 'webm'
  return ''
}
