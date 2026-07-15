import { apiOk } from '@/lib/api'
import { requireUser } from '@/lib/auth'

export async function GET() {
  const auth = await requireUser(['Admin', 'Operations'])
  if (!auth.ok) return auth.response
  return apiOk({ zoho: 'pending_credentials', workdrive: 'pending_credentials', lastSyncAt: null, failedJobs: 0, conflicts: 1 })
}
