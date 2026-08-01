import { DashboardShell } from '@/components/DashboardShell'
import { SalesmanViewClient } from '@/components/SalesmanViewClient'
import { hasPageAccess } from '@/lib/page-auth'
import { getSalesmanViewData } from '@/lib/salesman-view'

export const dynamic = 'force-dynamic'

export default async function SalesmanViewPage() {
  const authed = await hasPageAccess(['Admin'])
  const data = authed ? await getSalesmanViewData() : null
  return <DashboardShell active="Salesman View"><SalesmanViewClient initialData={data} /></DashboardShell>
}
