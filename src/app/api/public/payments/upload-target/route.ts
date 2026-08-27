import { apiError, apiOk } from '@/lib/api'
import { createR2UploadTarget, ensureR2BrowserCors } from '@/lib/r2'
import { checkRateLimit, publicApiHeaders, sameOrigin, verifySubmissionToken } from '@/lib/public-payment-security'
import { paymentScreenshotType, PUBLIC_PAYMENT_SCREENSHOT_MAX_BYTES } from '@/lib/payment-screenshot'

export const runtime = 'nodejs'
function safe(value: string) { return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'payment' }

export async function POST(request: Request) {
  if (!sameOrigin(request)) return publicApiHeaders(apiError('Invalid request origin', 403))
  const rate = checkRateLimit(request, 'public-payment-upload', 10)
  if (!rate.allowed) return publicApiHeaders(apiError('Too many upload requests', 429))
  if (Number(request.headers.get('content-length') || 0) > 5000) return publicApiHeaders(apiError('Request is too large', 413))
  const body = await request.json().catch(() => ({}))
  if (!verifySubmissionToken(String(body.submissionToken || ''))) return publicApiHeaders(apiError('Form expired. Reload and try again.', 403))
  const name = String(body.name || '')
  const image = paymentScreenshotType(name, String(body.type || ''))
  const size = Number(body.size)
  if (!image) return publicApiHeaders(apiError('Only JPEG, PNG, WebP, HEIC or HEIF images are allowed', 400))
  if (!Number.isSafeInteger(size) || size <= 0 || size > PUBLIC_PAYMENT_SCREENSHOT_MAX_BYTES) return publicApiHeaders(apiError('Screenshot must be a non-empty image up to 10 MB', 400))
  try {
    const salesOrderNumber = safe(String(body.salesOrderNumber || ''))
    if (salesOrderNumber === 'payment') return publicApiHeaders(apiError('Sales order number is required', 400))
    const key = `payments/public/${salesOrderNumber}/${new Date().toISOString().slice(0, 10)}/${Date.now()}-${crypto.randomUUID()}-${safe(name.replace(/\.[^.]+$/, ''))}.${image.extension}`
    const target = createR2UploadTarget(key, image.mimeType, 300, 3650)
    const cors = await ensureR2BrowserCors(target.uploadUrl)
    if (!cors.corsReady) return publicApiHeaders(apiError(cors.corsError, 503))
    return publicApiHeaders(apiOk({ ...target, uploadContentType: image.mimeType }))
  } catch (error) { return publicApiHeaders(apiError(error instanceof Error ? error.message : 'Could not prepare upload', 500)) }
}
