import { apiError, apiOk } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { getSyncedOrder } from '@/lib/synced-orders'
import { listMediaProofOrders, proceedWithoutVideo, registerR2Video, registerWorkDriveVideo, saveMediaUpload, submitMediaProof } from '@/lib/media-proof'

export async function GET() {
  const auth = await requireUser(['Admin', 'Operations'])
  if (!auth.ok) return auth.response
  return apiOk(await listMediaProofOrders())
}

export async function POST(request: Request) {
  const auth = await requireUser(['Admin', 'Operations'])
  if (!auth.ok) return auth.response
  try {
    const body = await request.json()
    if (body.action === 'submit') return apiOk({ record: await submitMediaProof(String(body.orderId || '')) })
    const order = await getSyncedOrder(String(body.orderId || ''))
    if (!order) return apiError('Order not found', 404)
    if (body.action === 'proceed_without_video') return apiOk({ record: await proceedWithoutVideo(order) })
    if (body.action === 'register_r2_video') {
      if (!body.machineId || !body.name || !body.r2Key || !body.url) return apiError('Missing R2 video data', 400)
      return apiOk({ record: await registerR2Video(order, String(body.machineId), { name: String(body.name), type: String(body.type || 'video/mp4'), key: String(body.r2Key), url: String(body.url), expiresAt: body.expiresAt ? String(body.expiresAt) : null }) })
    }
    if (body.action === 'register_workdrive_video') {
      if (!body.machineId || !body.name || !body.workdriveUrl) return apiError('Missing WorkDrive video data', 400)
      return apiOk({ record: await registerWorkDriveVideo(order, String(body.machineId), { name: String(body.name), type: String(body.type || 'video/mp4'), fileId: body.workdriveFileId ? String(body.workdriveFileId) : null, url: String(body.workdriveUrl) }) })
    }
    if (!body.machineId || !body.kind || !body.dataUrl) return apiError('Missing media upload data', 400)
    if (body.kind !== 'video') return apiError('Only video upload is required for media proof', 400)
    const record = await saveMediaUpload(order, String(body.machineId), 'video', { name: String(body.name || 'media'), type: String(body.type || ''), dataUrl: String(body.dataUrl) })
    return apiOk({ record })
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Media proof update failed', 400)
  }
}
