import { apiError, apiOk } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { getSyncedOrder } from '@/lib/synced-orders'
import { listMediaProofOrders, proceedWithoutVideo, registerR2Video, submitMediaProof, type MediaStage } from '@/lib/media-proof'

const stage: MediaStage = 'loading'

export async function GET() {
  const auth = await requireUser(['Admin', 'Operations', 'Media'])
  if (!auth.ok) return auth.response
  return apiOk(await listMediaProofOrders(stage))
}

export async function POST(request: Request) {
  const auth = await requireUser(['Admin', 'Operations', 'Media'])
  if (!auth.ok) return auth.response
  try {
    const body = await request.json()
    const order = await getSyncedOrder(String(body.orderId || ''))
    if (!order) return apiError('Order not found', 404)
    if (body.action === 'submit') return apiOk({ record: await submitMediaProof(order, stage) })
    if (body.action === 'proceed_without_video') return apiOk({ record: await proceedWithoutVideo(order, stage) })
    if (body.action === 'register_r2_video') {
      if (!body.machineId || !body.name || !body.r2Key || !body.url) return apiError('Missing R2 video data', 400)
      return apiOk({ record: await registerR2Video(order, String(body.machineId), { name: String(body.name), type: String(body.type || 'video/mp4'), key: String(body.r2Key), url: String(body.url), expiresAt: body.expiresAt ? String(body.expiresAt) : null }, stage) })
    }
    return apiError('Loading Video only accepts direct Cloudflare R2 uploads. Please use the browser uploader.', 400)
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Loading video update failed', 400)
  }
}
