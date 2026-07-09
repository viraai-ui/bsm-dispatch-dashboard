import { apiOk } from '@/lib/api'

export async function GET() {
  return apiOk({ zoho: 'pending_credentials', workdrive: 'pending_credentials', lastSyncAt: null, failedJobs: 0, conflicts: 1 })
}
