import { apiError, apiOk } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { saveMediaUploadBuffer } from '@/lib/media-proof'
import { getSyncedOrder } from '@/lib/synced-orders'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: Request) {
  const auth = await requireUser(['Admin', 'Operations'])
  if (!auth.ok) return auth.response
  try {
    const form = await request.formData()
    const orderId = String(form.get('orderId') || '')
    const machineId = String(form.get('machineId') || '')
    const file = form.get('file')
    if (!orderId || !machineId || !(file instanceof File)) return apiError('Missing video upload data', 400)
    if (!file.type.startsWith('video/')) return apiError('Only video files are allowed', 400)
    const order = await getSyncedOrder(orderId)
    if (!order) return apiError('Order not found', 404)
    const buffer = Buffer.from(await file.arrayBuffer())
    const record = await saveMediaUploadBuffer(order, machineId, { name: file.name, type: file.type, buffer })
    return apiOk({ record })
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Video upload failed', 400)
  }
}
