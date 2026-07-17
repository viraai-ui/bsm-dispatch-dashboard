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
    await ensureR2Cors().catch(() => {})
    const key = buildR2Key({ salesOrderNumber: order.salesOrderNumber, machineName: machine.itemName, machineId, originalName: String(body.name || 'video.mp4'), mimeType: type })
    const target = createR2UploadTarget(key, type)
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
