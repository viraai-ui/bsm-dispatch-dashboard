import { apiError, apiOk } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { saveMediaUploadBuffer } from '@/lib/media-proof'
import { getMediaOrder } from '@/lib/media-order-resolver'
import { buildR2Key, uploadBufferToR2 } from '@/lib/r2'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: Request) {
  try {
    const form = await request.formData()
    const orderId = String(form.get('orderId') || '')
    const machineId = String(form.get('machineId') || '')
    const stage = form.get('stage') === 'loading' ? 'loading' : form.get('stage') === 'shipment' ? 'shipment' : 'packing'
    const auth = await requireUser(stage === 'packing' ? ['Admin', 'Media'] : ['Admin', 'Operations'])
    if (!auth.ok) return auth.response
    const file = form.get('file')
    if (!orderId || !machineId || !(file instanceof File)) return apiError(stage === 'shipment' ? 'Missing Builty/LR upload data' : 'Missing video upload data', 400)
    if (file.size <= 0) return apiError('The selected file is empty', 400)
    const maximum = stage === 'shipment' ? 15 * 1024 * 1024 : 250 * 1024 * 1024
    if (file.size > maximum) return apiError(`File exceeds the ${stage === 'shipment' ? '15 MB' : '250 MB'} limit`, 413)
    const type = file.type
    if (!type) return apiError('File type is missing', 400)
    if (stage === 'shipment') {
      if (!type.startsWith('image/') && type !== 'application/pdf') return apiError('Only image or PDF files are allowed', 400)
    } else if (!type.startsWith('video/')) return apiError('Only video files are allowed', 400)
    const order = await getMediaOrder(orderId)
    if (!order) return apiError('Order not found', 404)
    const buffer = Buffer.from(await file.arrayBuffer())
    if (stage === 'shipment') {
      const key = buildR2Key({ salesOrderNumber: order.salesOrderNumber, machineName: 'Shipment LR Builty', machineId: 'shipment-lr-builty', originalName: file.name || 'shipment-document', mimeType: type })
      const target = await uploadBufferToR2(key, type, buffer)
      return apiOk({ file: { name: file.name || 'shipment-document', type, url: target.publicUrl, r2Key: target.key, expiresAt: target.expiresAt } })
    }
    const record = await saveMediaUploadBuffer(order, machineId, { name: file.name || 'gallery-video.mp4', type, buffer }, stage)
    return apiOk({ record })
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Video upload failed', 400)
  }
}
