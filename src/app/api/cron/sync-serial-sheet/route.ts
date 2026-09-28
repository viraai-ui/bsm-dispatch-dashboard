import { apiError, apiOk } from '@/lib/api'
import { syncMissingGeneratedSerialsToZohoSheet } from '@/lib/serial-sheet-backup'
import { isAuthorizedCron } from '@/lib/cron-auth'
import { withSerialSheetLock } from '@/lib/serial-sheet-lock'

export const maxDuration = 300

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return apiError('Unauthorized', 401)
  const result = await withSerialSheetLock(() => syncMissingGeneratedSerialsToZohoSheet())
  if (!result) return apiOk({ skipped: true, reason: 'Serial Sheet reconciliation already running' })
  if (result.errors.length) return apiError(`Serial sheet sync had errors: ${result.errors.join('; ')}`, 500)
  return apiOk(result)
}
