import { requireUser } from '@/lib/auth'
import { apiError } from '@/lib/api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Historical imports are deliberately isolated from every operational path.
 * Enabling the flag only exposes the maintenance boundary; a reviewed one-shot
 * importer must still be supplied before any provider call can occur. */
export async function POST() {
  const auth = await requireUser(['Admin'])
  if (!auth.ok) return auth.response
  if (process.env.DISPATCH_HISTORICAL_BACKFILL_ENABLED !== 'true') return apiError('Historical Dispatch backfill is disabled', 403)
  return apiError('Historical Dispatch backfill requires a reviewed one-shot importer', 501)
}
