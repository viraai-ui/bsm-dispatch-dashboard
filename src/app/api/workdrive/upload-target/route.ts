import { apiError } from '@/lib/api'
import { requireUser } from '@/lib/auth'

/** Deprecated: this route previously exposed a reusable Zoho OAuth bearer token to
 * browsers. All media now flows through the authenticated server upload endpoint. */
export async function GET() {
  const auth = await requireUser(['Admin', 'Operations'])
  if (!auth.ok) return auth.response
  return apiError('Direct WorkDrive browser uploads are disabled; use /api/media-proof/upload', 410)
}
