import type { Order } from '@/types/domain'
import { githubReadJson, githubWriteJson, listProcessedOrders } from './workflow-store'

export type MediaUpload = {
  id: string
  name: string
  type: string
  kind: 'photo' | 'video'
  url: string
  workdriveFileId?: string | null
  workdriveUrl?: string | null
  uploadedAt: string
}

export type MediaProofRecord = {
  orderId: string
  salesOrderNumber: string
  submittedAt?: string | null
  units: Record<string, { photos: MediaUpload[]; videos: MediaUpload[] }>
}

export type MediaProofStore = { records: Record<string, MediaProofRecord> }
const MEDIA_PROOF_PATH = 'data/media-proof-store.json'

export async function readMediaProofStore() {
  const { data } = await githubReadJson<MediaProofStore>(MEDIA_PROOF_PATH, { records: {} })
  return { records: data.records || {} }
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
  const file: MediaUpload = {
    id: `${machineId}-${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: upload.name,
    type: upload.type,
    kind,
    url: upload.dataUrl,
    workdriveFileId: null,
    workdriveUrl: null,
    uploadedAt: new Date().toISOString(),
  }
  const key = kind === 'photo' ? 'photos' : 'videos'
  current.units[machineId] = { ...unit, [key]: [...unit[key], file] }
  store.records[order.id] = current
  await githubWriteJson(MEDIA_PROOF_PATH, store, `Save media proof for ${order.salesOrderNumber}`)
  return current
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
