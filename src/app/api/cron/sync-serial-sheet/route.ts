import { apiError, apiOk } from '@/lib/api'
import { syncMissingGeneratedSerialsToZohoSheet } from '@/lib/serial-sheet-backup'
import { isAuthorizedCron } from '@/lib/cron-auth'

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return apiError('Unauthorized', 401)
  const result = await syncMissingGeneratedSerialsToZohoSheet()
  if (result.errors.length) return apiError(`Serial sheet sync had errors: ${result.errors.join('; ')}`, 500)
  return apiOk(result)
}
