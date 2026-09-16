import { deleteR2Object, listR2Objects, type R2InventoryObject } from './r2'

const DAY = 86_400_000
const VIDEO = /\.(mp4|mov|webm|m4v)$/i
const DOCUMENT = /\.(pdf|jpe?g|png|webp)$/i

export type ReconciliationResult = { scanned: number; eligible: number; deleted: number; failed: number; bytesReclaimed: number; orphanCount: number; errors: string[] }

export function classifyRetention(object: R2InventoryObject, now = Date.now()) {
  const age = now - Date.parse(object.lastModified)
  if (!Number.isFinite(age) || age < 0) return null
  if (object.key.startsWith('media-proof/') && VIDEO.test(object.key) && age >= 21 * DAY) return 'video'
  if ((object.key.startsWith('payments/') || (object.key.startsWith('media-proof/') && /(shipment[ _-]*lr|builty|\/lr\/)/i.test(object.key))) && DOCUMENT.test(object.key) && age >= 30 * DAY) return 'document'
  return null
}

export async function reconcileR2Retention(registeredKeys: Set<string>, options: { execute?: boolean; now?: number } = {}) {
  const inventory = await listR2Objects()
  const result: ReconciliationResult = { scanned: inventory.length, eligible: 0, deleted: 0, failed: 0, bytesReclaimed: 0, orphanCount: inventory.filter(o => !registeredKeys.has(o.key)).length, errors: [] }
  const eligible = inventory.filter(o => classifyRetention(o, options.now) !== null)
  result.eligible = eligible.length
  if (options.execute) for (const object of eligible) {
    try { await deleteR2Object(object.key); result.deleted++; result.bytesReclaimed += object.size }
    catch (error) { result.failed++; result.errors.push(`${object.key}: ${error instanceof Error ? error.message : 'delete failed'}`) }
  }
  const bytes = inventory.reduce((sum, object) => sum + object.size, 0)
  return { inventory, summary: { count: inventory.length, bytes }, eligible, result }
}
