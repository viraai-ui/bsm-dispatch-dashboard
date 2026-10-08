import { apiError, apiOk } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { getMediaOrder } from '@/lib/media-order-resolver'
import { deleteMediaVideo, listMediaProofOrders, proceedWithoutVideo, registerR2Video, registerWorkDriveVideo, saveMediaUpload, submitMediaProof, type MediaStage } from '@/lib/media-proof'
import { verifyMediaRegistrationCapability } from '@/lib/media-registration-capability'

const stage: MediaStage = 'packing'

export async function GET() {
  const auth = await requireUser(['Admin', 'Media'])
  if (!auth.ok) return auth.response
  return apiOk(await listMediaProofOrders(stage))
}

export async function POST(request: Request) {
  const auth = await requireUser(['Admin', 'Media'])
  if (!auth.ok) return auth.response
  try {
    const body = await request.json()
    const orderId = String(body.orderId || '')
    const machineId = String(body.machineId || '')
    const r2Key = String(body.r2Key || '')
    const order = body.action === 'register_r2_video'
      ? verifyMediaRegistrationCapability(String(body.registrationToken || ''), { stage, orderId, machineId, r2Key })
      : await getMediaOrder(orderId)
    if (!order) return apiError('Order not found', 404)
    if (body.action === 'submit') return apiOk({ record: await submitMediaProof(order, stage) })
    if (body.action === 'proceed_without_video') return apiOk({ record: await proceedWithoutVideo(order, stage) })
    if (body.action === 'delete_video') {
      if (!body.machineId || !body.videoId) return apiError('Missing video delete data', 400)
      return apiOk({ record: await deleteMediaVideo(order, String(body.machineId), String(body.videoId), stage) })
    }
    if (body.action === 'register_r2_video') {
      if (!body.machineId || !body.name || !body.r2Key || !body.registrationToken) return apiError('Missing R2 video data', 400)
      return apiOk({ record: await registerR2Video(order, machineId, { name: String(body.name), type: String(body.type || 'video/mp4'), key: r2Key, url: '', expiresAt: null }, stage) })
    }
    if (body.action === 'register_workdrive_video') {
      if (!body.machineId || !body.name || !body.workdriveUrl) return apiError('Missing WorkDrive video data', 400)
      return apiOk({ record: await registerWorkDriveVideo(order, String(body.machineId), { name: String(body.name), type: String(body.type || 'video/mp4'), fileId: body.workdriveFileId ? String(body.workdriveFileId) : null, url: String(body.workdriveUrl) }, stage) })
    }
    if (!body.machineId || !body.kind || !body.dataUrl) return apiError('Missing media upload data', 400)
    if (body.kind !== 'video') return apiError('Only video upload is required for media proof', 400)
    const record = await saveMediaUpload(order, String(body.machineId), 'video', { name: String(body.name || 'media'), type: String(body.type || ''), dataUrl: String(body.dataUrl) }, stage)
    return apiOk({ record })
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Media proof update failed', 400)
  }
}
