import { SalesmanViewClient } from '@/components/SalesmanViewClient'
import { getSalesmanViewData } from '@/lib/salesman-view'

export const dynamic = 'force-dynamic'

export default async function SalesmanWorkloadPublicPage() {
  const data = await getSalesmanViewData()

  return <main className="public-database-shell public-salesman-shell">
    <div className="public-database-brand"><img src="/brand/bsm-logo.png" alt="BSM" /><div><strong>BSM Salesman View</strong><span>View-only live dispatch workload</span></div></div>
    <SalesmanViewClient initialData={data} publicMode />
  </main>
}
