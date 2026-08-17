import { apiError, apiOk } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { buildR2Key, createR2UploadTarget } from '@/lib/r2'
import { getMediaOrder } from '@/lib/media-order-resolver'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const requestedStage = String(body.stage || '')
    const stage = requestedStage === 'loading' ? 'loading' : requestedStage === 'shipment' ? 'shipment' : 'packing'
    const auth = await requireUser(stage === 'packing' ? ['Admin', 'Media'] : stage === 'shipment' ? ['Admin', 'Operations'] : ['Admin', 'Operations'])
    if (!auth.ok) return auth.response
    const order = await getMediaOrder(String(body.orderId || ''))
    if (!order) return apiError('Order not found', 404)
    const machineId = String(body.machineId || '')
    const shipmentDocument = stage === 'shipment'
    const loadingOrderVideo = stage === 'loading' && machineId === 'loading-order'
    const machine = loadingOrderVideo ? null : order.machines.find((item) => item.id === machineId)
    if (!loadingOrderVideo && !shipmentDocument && !machine) return apiError('Machine not found for this order', 404)
    const type = String(body.type || 'video/mp4')
    const size = Number(body.size)
    if (!Number.isSafeInteger(size) || size <= 0) return apiError('A valid non-empty file size is required', 400)
    if (size > (shipmentDocument ? 15 : 250) * 1024 * 1024) return apiError(`File exceeds the ${shipmentDocument ? '15 MB' : '250 MB'} limit`, 413)
    if (shipmentDocument) {
      if (!type.startsWith('image/') && type !== 'application/pdf') return apiError('Only image or PDF files are allowed', 400)
    } else if (!type.startsWith('video/')) return apiError('Only video files are allowed', 400)

    const key = buildR2Key({ salesOrderNumber: order.salesOrderNumber, machineName: shipmentDocument ? 'Shipment LR Builty' : machine?.itemName || 'Loading Video', machineId: shipmentDocument ? 'shipment-lr-builty' : machineId, originalName: String(body.name || (shipmentDocument ? 'shipment-document' : 'video.mp4')), mimeType: type })
    const target = createR2UploadTarget(key, type, 900, shipmentDocument ? 60 : 30)
    const cors = await checkBrowserCors(target.uploadUrl)
    return apiOk({ ...target, ...cors })
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Could not create R2 upload target', 400)
  }
}

async function checkBrowserCors(uploadUrl: string) {
  try {
    const response = await fetch(uploadUrl, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://dispatch.bsmindia.com',
        'Access-Control-Request-Method': 'PUT',
        'Access-Control-Request-Headers': 'content-type',
      },
      cache: 'no-store',
    })
    if (response.ok) return { corsReady: true }
    const body = await response.text().catch(() => '')
    if (body.includes('CORS not configured') || response.status === 403) {
      return { corsReady: false, corsError: 'Cloudflare R2 bucket CORS is not configured for https://dispatch.bsmindia.com. Add PUT/GET/HEAD CORS for this origin in Cloudflare R2 bucket settings.' }
    }
    return { corsReady: false, corsError: `Cloudflare R2 browser upload preflight failed: HTTP ${response.status}` }
  } catch {
    return { corsReady: false, corsError: 'Cloudflare R2 browser upload preflight failed. Check the R2 bucket CORS policy.' }
  }
}
