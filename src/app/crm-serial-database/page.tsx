import { DatabaseClient } from '@/components/DatabaseClient'
import { buildOrderStatusMap } from '@/lib/status-projection'
import { loadDatabaseOrders } from '@/lib/database-orders'

export const dynamic = 'force-dynamic'

export default async function CrmSerialDatabasePage() {
  const { databaseOrders, workflows, warrantyDates } = await loadDatabaseOrders()
  const { statuses, mediaRecords, packingMediaRecords, loadingMediaRecords } = await buildOrderStatusMap(databaseOrders, workflows)

  return <main className="public-database-shell">
    <div className="public-database-brand"><img src="/brand/bsm-logo.png" alt="BSM" /><div><strong>BSM Machine Database</strong><span>Search by serial number</span></div></div>
    <DatabaseClient orders={databaseOrders} mediaRecords={mediaRecords} packingMediaRecords={packingMediaRecords} loadingMediaRecords={loadingMediaRecords} statuses={statuses} warrantyDates={warrantyDates} publicMode />
  </main>
}
