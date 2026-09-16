import type { MediaProofStore, MediaUpload } from './media-proof'
import type { Payment, PaymentAttachment } from './payments'
import type { ShipmentStore } from './ready-to-ship'

export const ATTACHMENT_RETENTION_DAYS = 30
export const ONE_TIME_VIDEO_PURGE_DAYS = 21
const DAY_MS = 86_400_000
export type RetentionCategory = 'packing' | 'loading' | 'shipments' | 'payments'
export type CategoryResult = { scanned: number; removed: number; errors: string[] }
export type DeleteObject = (key: string) => Promise<unknown>

export type DeleteMemo = Map<string, Promise<{ ok: boolean; error?: string }>>
function deletion(key: string, remove: DeleteObject, memo: DeleteMemo) {
  let result = memo.get(key)
  if (!result) {
    result = remove(key).then(() => ({ ok: true })).catch((error) => ({ ok: false, error: error instanceof Error ? error.message : 'delete failed' }))
    memo.set(key, result)
  }
  return result
}
export function expiresAt(timestamp: string, days = ATTACHMENT_RETENTION_DAYS) {
  const parsed = Date.parse(timestamp)
  return new Date((Number.isFinite(parsed) ? parsed : Date.now()) + days * DAY_MS).toISOString()
}
function due(timestamp: string | undefined | null, now: number, days = ATTACHMENT_RETENTION_DAYS) {
  const parsed = Date.parse(timestamp || '')
  return Number.isFinite(parsed) && parsed + days * DAY_MS <= now
}

export async function cleanMediaStore(store: MediaProofStore, remove: DeleteObject, options: { now?: number; days?: number; memo?: DeleteMemo } = {}) {
  const now = options.now ?? Date.now(), days = options.days ?? ATTACHMENT_RETENTION_DAYS, memo = options.memo ?? new Map()
  const result: CategoryResult = { scanned: 0, removed: 0, errors: [] }, next: MediaProofStore = structuredClone(store)
  for (const [orderId, record] of Object.entries(next.records || {})) for (const [machineId, unit] of Object.entries(record.units || {})) {
    for (const field of ['photos', 'videos'] as const) {
      const kept: MediaUpload[] = []
      for (const file of unit[field] || []) {
        result.scanned++
        file.expiresAt = expiresAt(file.uploadedAt, ATTACHMENT_RETENTION_DAYS)
        // Photos are business evidence and are not covered by the video policy.
        if (file.kind !== 'video' || !due(file.uploadedAt, now, days)) { kept.push(file); continue }
        if (!file.r2Key) { kept.push(file); continue } // cleanup route only owns registered R2 objects
        const deleted = await deletion(file.r2Key, remove, memo)
        if (deleted.ok) result.removed++
        else { kept.push(file); result.errors.push(`${file.r2Key}: ${deleted.error}`) }
      }
      unit[field] = kept
    }
    if (!unit.photos.length && !unit.videos.length) delete record.units[machineId]
  }
  return { store: next, result }
}

export async function cleanShipmentStore(store: ShipmentStore, remove: DeleteObject, options: { now?: number; memo?: DeleteMemo } = {}) {
  const now = options.now ?? Date.now(), memo = options.memo ?? new Map(), result: CategoryResult = { scanned: 0, removed: 0, errors: [] }
  const next: ShipmentStore = structuredClone(store)
  for (const shipment of Object.values(next.shipments || {})) {
    const doc = shipment.lrCopy
    if (!doc) continue
    result.scanned++
    const uploadedAt = doc.uploadedAt || shipment.shippedAt
    doc.uploadedAt = uploadedAt
    doc.expiresAt = expiresAt(uploadedAt)
    if (!due(uploadedAt, now) || !doc.r2Key) continue
    const deleted = await deletion(doc.r2Key, remove, memo)
    if (deleted.ok) { shipment.lrCopy = null; result.removed++ }
    else result.errors.push(`${doc.r2Key}: ${deleted.error}`)
  }
  return { store: next, result }
}

export async function cleanPayments(payments: Payment[], remove: DeleteObject, options: { now?: number; memo?: DeleteMemo } = {}) {
  const now = options.now ?? Date.now(), memo = options.memo ?? new Map(), result: CategoryResult = { scanned: 0, removed: 0, errors: [] }
  const next: Payment[] = structuredClone(payments)
  for (const payment of next) {
    const source = payment.attachments?.length ? payment.attachments : (payment.screenshotKey || payment.screenshotUrl ? [{ key: payment.screenshotKey || '', url: payment.screenshotUrl || '', name: payment.screenshotName || 'Payment proof', contentType: '', size: 0 }] : [])
    const kept: PaymentAttachment[] = []
    for (const proof of source) {
      result.scanned++
      const uploadedAt = proof.uploadedAt || payment.createdAt
      const normalized = { ...proof, uploadedAt, expiresAt: expiresAt(uploadedAt) }
      if (!due(uploadedAt, now) || !proof.key) { kept.push(normalized); continue }
      const deleted = await deletion(proof.key, remove, memo)
      if (deleted.ok) result.removed++
      else { kept.push(normalized); result.errors.push(`${proof.key}: ${deleted.error}`) }
    }
    payment.attachments = kept
    payment.screenshotKey = undefined; payment.screenshotUrl = undefined; payment.screenshotName = undefined
  }
  return { payments: next, result }
}
