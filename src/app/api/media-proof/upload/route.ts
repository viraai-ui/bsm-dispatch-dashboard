import { apiError, apiOk } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { saveMediaUploadBuffer, type MediaStage } from '@/lib/media-proof'
import { getMediaOrder } from '@/lib/media-order-resolver'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: Request) {
  const auth = await requireUser(['Admin', 'Operations', 'Media'])
  if (!auth.ok) return auth.response
  try {
    const form = await request.formData()
    const orderId = String(form.get('orderId') || '')
    const machineId = String(form.get('machineId') || '')
    const stage: MediaStage = form.get('stage') === 'loading' ? 'loading' : 'packing'
    const file = form.get('file')
    if (!orderId || !machineId || !(file instanceof File)) return apiError('Missing video upload data', 400)
    const type = file.type && file.type.startsWith('video/') ? file.type : 'video/mp4'
    if (!type.startsWith('video/')) return apiError('Only video files are allowed', 400)
    const order = await getMediaOrder(orderId)
    if (!order) return apiError('Order not found', 404)
    const buffer = Buffer.from(await file.arrayBuffer())
    const record = await saveMediaUploadBuffer(order, machineId, { name: file.name || 'gallery-video.mp4', type, buffer }, stage)
    return apiOk({ record })
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Video upload failed', 400)
  }
}
