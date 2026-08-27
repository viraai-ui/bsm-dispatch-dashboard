import { apiError, apiOk } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { createR2UploadTarget, ensureR2BrowserCors } from '@/lib/r2'
import { INTERNAL_PAYMENT_SCREENSHOT_MAX_BYTES, paymentScreenshotType } from '@/lib/payment-screenshot'

export const runtime = 'nodejs'

function safe(value: string) { return value.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'payment' }

export async function POST(request: Request) {
  const auth = await requireUser(['Admin'])
  if (!auth.ok) return auth.response
  try {
    const body = await request.json().catch(() => ({}))
    const name = String(body.name || '')
    const image = paymentScreenshotType(name, String(body.type || ''))
    const size = Number(body.size)
    const salesOrderNumber = String(body.salesOrderNumber || '')
    if (!image) return apiError('Only JPEG, PNG, WebP, HEIC or HEIF images are allowed', 400)
    if (!Number.isSafeInteger(size) || size <= 0 || size > INTERNAL_PAYMENT_SCREENSHOT_MAX_BYTES) return apiError('Screenshot must be a non-empty image up to 15 MB', 400)
    const key = `payments/${safe(salesOrderNumber)}/${Date.now()}-${crypto.randomUUID()}.${image.extension}`
    const target = createR2UploadTarget(key, image.mimeType, 900, 3650)
    const cors = await ensureR2BrowserCors(target.uploadUrl)
    if (!cors.corsReady) return apiError(cors.corsError, 503)
    return apiOk({ ...target, uploadContentType: image.mimeType })
  } catch (error) { return apiError(error instanceof Error ? error.message : 'Could not prepare screenshot upload', 400) }
}
