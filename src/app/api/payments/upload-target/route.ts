import { apiError, apiOk } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { createR2UploadTarget, ensureR2BrowserCors } from '@/lib/r2'

export const runtime = 'nodejs'

function safe(value: string) { return value.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'payment' }

export async function POST(request: Request) {
  const auth = await requireUser(['Admin'])
  if (!auth.ok) return auth.response
  try {
    const body = await request.json().catch(() => ({}))
    const name = String(body.name || '')
    const type = String(body.type || '')
    const size = Number(body.size)
    const salesOrderNumber = String(body.salesOrderNumber || '')
    if (!type.startsWith('image/')) return apiError('Only image screenshots are allowed', 400)
    if (!Number.isSafeInteger(size) || size <= 0 || size > 15 * 1024 * 1024) return apiError('Screenshot must be a non-empty image up to 15 MB', 400)
    const extension = name.includes('.') ? name.split('.').pop() : 'jpg'
    const key = `payments/${safe(salesOrderNumber)}/${Date.now()}-${crypto.randomUUID()}.${safe(extension || 'jpg')}`
    const target = createR2UploadTarget(key, type, 900, 3650)
    const cors = await ensureR2BrowserCors(target.uploadUrl)
    if (!cors.corsReady) return apiError(cors.corsError, 503)
    return apiOk(target)
  } catch (error) { return apiError(error instanceof Error ? error.message : 'Could not prepare screenshot upload', 400) }
}
