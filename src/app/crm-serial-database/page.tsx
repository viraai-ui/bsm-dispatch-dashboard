import { DatabaseClient } from '@/components/DatabaseClient'
import { buildOrderStatusMap } from '@/lib/status-projection'
import { loadDatabaseOrders } from '@/lib/database-orders'
import { transformPublicMediaRecords, transformPublicShipments } from '@/lib/public-database-media'

export const dynamic = 'force-dynamic'

export default async function CrmSerialDatabasePage() {
  const { databaseOrders, workflows, warrantyDates, shipmentRecords, serialSheet } = await loadDatabaseOrders()
  const { statuses, mediaRecords, packingMediaRecords, loadingMediaRecords } = await buildOrderStatusMap(databaseOrders, workflows)
  const publicPacking = transformPublicMediaRecords(packingMediaRecords, 'packing')
  const publicLoading = transformPublicMediaRecords(loadingMediaRecords, 'loading')

  return <main className="public-database-shell">
    <div className="public-database-brand"><img src="/brand/bsm-logo.png" alt="BSM" /><div><strong>BSM Machine Database</strong><span>Search by serial number · Data {serialSheet.stale ? 'may be delayed' : 'refreshed'} {serialSheet.fetchedAt ? new Date(serialSheet.fetchedAt).toLocaleString('en-IN') : 'from the live store'}</span></div></div>
    <DatabaseClient orders={databaseOrders} mediaRecords={transformPublicMediaRecords(mediaRecords, 'packing')} packingMediaRecords={publicPacking} loadingMediaRecords={publicLoading} statuses={statuses} warrantyDates={warrantyDates} shipmentRecords={transformPublicShipments(shipmentRecords)} publicMode />
  </main>
}
