import 'server-only'

import type { Order } from '@/types/domain'
import { allocateSerialNumbersLegacy, mirrorAllocatedSerialNumbers } from '@/lib/workflow-store'
import { allocateSerialBatch, markWorkflowMirrored, markWorkflowMirrorFailed, serialDatabaseConfigured, type TransferReallocation } from '@/lib/serial-ledger'

/** Select the authority once. A configured database is always authoritative and
 * any allocation/database error propagates; it is never retried via GitHub. */
export async function allocateSerialNumbers(orderId: string, machineIds: string[], order?: Order, transfers: Record<string, TransferReallocation> = {}) {
  const uniqueIds = Array.from(new Set(machineIds.filter(Boolean)))
  if (!uniqueIds.length) return {} as Record<string, string>
  if (!serialDatabaseConfigured()) return allocateSerialNumbersLegacy(orderId, uniqueIds, order)

  const allocated = await allocateSerialBatch(orderId, uniqueIds, order, transfers)
  try {
    await mirrorAllocatedSerialNumbers(orderId, allocated, order, Object.keys(transfers))
    await markWorkflowMirrored(orderId, uniqueIds)
  } catch (error) {
    await markWorkflowMirrorFailed(orderId, uniqueIds, error)
    console.error('Serial workflow mirror queued for reconciliation', { orderId, machineIds: uniqueIds, error })
  }
  return allocated
}