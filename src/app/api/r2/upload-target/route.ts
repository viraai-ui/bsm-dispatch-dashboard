import { apiError, apiOk } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { buildR2Key, createR2UploadTarget, ensureR2Cors } from '@/lib/r2'
import { getSyncedOrder } from '@/lib/synced-orders'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const auth = await requireUser(['Admin', 'Operations'])
  if (!auth.ok) return auth.response
  try {
    const body = await request.json()
    const order = await getSyncedOrder(String(body.orderId || ''))
    if (!order) return apiError('Order not found', 404)
    const machineId = String(body.machineId || '')
    const machine = order.machines.find((item) => item.id === machineId)
    if (!machine) return apiError('Machine not found for this order', 404)
    const type = String(body.type || 'video/mp4')
    if (!type.startsWith('video/')) return apiError('Only video files are allowed', 400)
    await ensureR2Cors()
    const key = buildR2Key({ salesOrderNumber: order.salesOrderNumber, machineName: machine.itemName, machineId, originalName: String(body.name || 'video.mp4'), mimeType: type })
    return apiOk(createR2UploadTarget(key, type))
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Could not create R2 upload target', 400)
  }
}
