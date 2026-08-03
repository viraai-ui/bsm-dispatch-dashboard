import { SalesmanViewClient } from '@/components/SalesmanViewClient'
import { getSalesmanViewData } from '@/lib/salesman-view'

export const dynamic = 'force-dynamic'

export default async function SalesmanWorkloadPublicPage() {
  const data = await getSalesmanViewData()

  return <main className="public-database-shell public-salesman-shell no-public-brand">
    <SalesmanViewClient initialData={data} publicMode title="Dispatch Queue" />
  </main>
}
