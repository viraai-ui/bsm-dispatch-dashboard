import { PackagingTvClient } from '@/components/PackagingTvClient'
import { getSessionUser } from '@/lib/auth'

export default async function PackagingTv() {
  const user = await getSessionUser()
  return <PackagingTvClient userRole={user?.role || 'Dispatch'} />
}
