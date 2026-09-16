import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { readMediaProofStore } from '@/lib/media-proof'
import { githubWriteJson } from '@/lib/workflow-store'
import { deleteR2Object } from '@/lib/r2'
import { cleanMediaStore, cleanPayments, cleanShipmentStore, ONE_TIME_VIDEO_PURGE_DAYS, type DeleteMemo } from '@/lib/attachment-retention'
import { readShipmentStore, writeShipmentStore } from '@/lib/ready-to-ship'
import { listPayments, updatePaymentStore } from '@/lib/payments'
import { reconcileR2Retention } from '@/lib/r2-reconciliation'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request)) {
    const auth = await requireUser(['Admin'])
    if (!auth.ok) return auth.response
  }
  try {
    const requestedVideoDays = Number(request.nextUrl.searchParams.get('videoDays') || 30)
    if (![30, ONE_TIME_VIDEO_PURGE_DAYS].includes(requestedVideoDays)) return apiError('videoDays must be 21 or 30', 400)
    const memo: DeleteMemo = new Map()
    const remove = (key: string) => deleteR2Object(key)
    const [packingSource, loadingSource, shipmentSource, paymentSource] = await Promise.all([
      readMediaProofStore('packing'), readMediaProofStore('loading'), readShipmentStore(), listPayments(),
    ])
    const registered = new Set<string>()
    const collect = (value: unknown) => {
      if (!value || typeof value !== 'object') return
      const record = value as Record<string, unknown>
      if (typeof record.r2Key === 'string') registered.add(record.r2Key)
      if (typeof record.key === 'string' && (record.key.startsWith('payments/') || record.key.startsWith('media-proof/'))) registered.add(record.key)
      Object.values(record).forEach(collect)
    }
    ;[packingSource, loadingSource, shipmentSource, paymentSource].forEach(collect)
    const execute = request.nextUrl.searchParams.get('execute') === 'true'
    const reconciliation = await reconcileR2Retention(registered, { execute })
    if (!execute) return apiOk({ mode: 'inventory', ...reconciliation })
    const packing = await cleanMediaStore(packingSource, remove, { days: requestedVideoDays, memo })
    const loading = await cleanMediaStore(loadingSource, remove, { days: requestedVideoDays, memo })
    const shipments = await cleanShipmentStore(shipmentSource, remove, { memo })
    const payments = await cleanPayments(paymentSource, remove, { memo })
    // Serialize GitHub-backed writes: concurrent commits race the branch ref and
    // can report failure after the R2 objects were already removed.
    if (packing.result.removed) await githubWriteJson('data/media-proof-store.json', packing.store, 'Apply packing media retention')
    if (loading.result.removed) await githubWriteJson('data/loading-video-store.json', loading.store, 'Apply loading media retention')
    if (shipments.result.removed) await writeShipmentStore(shipments.store, 'Apply LR/builty retention')
    if (payments.result.removed) await updatePaymentStore(() => payments.payments)
    const after = await reconcileR2Retention(registered)
    return apiOk({ policy: { videoDays: requestedVideoDays, documentDays: 30 }, before: reconciliation, after, packing: packing.result, loading: loading.result, shipments: shipments.result, payments: payments.result, uniqueKeysProcessed: memo.size })
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Media cleanup failed', 500)
  }
}
