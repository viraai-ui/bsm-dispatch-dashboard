import { apiError, apiOk } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { getSyncedOrder } from '@/lib/synced-orders'
import { listMediaProofOrders, saveMediaUpload, submitMediaProof } from '@/lib/media-proof'

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
    if (!body.machineId || !body.kind || !body.dataUrl) return apiError('Missing media upload data', 400)
    const record = await saveMediaUpload(order, String(body.machineId), body.kind === 'video' ? 'video' : 'photo', { name: String(body.name || 'media'), type: String(body.type || ''), dataUrl: String(body.dataUrl) })
    return apiOk({ record })
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Media proof update failed', 400)
  }
}
