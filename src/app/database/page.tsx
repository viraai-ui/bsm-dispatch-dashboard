import { DashboardShell } from '@/components/DashboardShell'
import { DatabaseClient } from '@/components/DatabaseClient'
import { buildOrderStatusMap } from '@/lib/status-projection'
import { loadDatabaseOrders } from '@/lib/database-orders'

export const dynamic = 'force-dynamic'

export default async function DatabasePage() {
  const { databaseOrders, workflows, warrantyDates, shipmentRecords } = await loadDatabaseOrders()
  const { statuses, mediaRecords, packingMediaRecords, loadingMediaRecords } = await buildOrderStatusMap(databaseOrders, workflows)
  return <DashboardShell active="Database"><DatabaseClient orders={databaseOrders} mediaRecords={mediaRecords} packingMediaRecords={packingMediaRecords} loadingMediaRecords={loadingMediaRecords} statuses={statuses} warrantyDates={warrantyDates} shipmentRecords={shipmentRecords} /></DashboardShell>
}
