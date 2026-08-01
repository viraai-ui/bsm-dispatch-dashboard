import { apiOk } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { getSalesmanViewData } from '@/lib/salesman-view'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireUser(['Admin'])
  if (!auth.ok) return auth.response
  const data = await getSalesmanViewData()
  return apiOk(data)
}
