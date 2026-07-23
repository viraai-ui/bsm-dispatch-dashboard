import { apiError, apiOk } from '@/lib/api'
import { syncMissingGeneratedSerialsToZohoSheet } from '@/lib/serial-sheet-backup'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) return apiError('Unauthorized', 401)
  const result = await syncMissingGeneratedSerialsToZohoSheet(26270758)
  if (result.errors.length) return apiError(`Serial sheet sync had errors: ${result.errors.join('; ')}`, 500)
  return apiOk(result)
}
