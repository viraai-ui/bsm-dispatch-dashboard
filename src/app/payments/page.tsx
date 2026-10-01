import { DashboardShell } from '@/components/DashboardShell'
import { PaymentsClient } from '@/components/PaymentsClient'
import { MaintenanceLock } from '@/components/MaintenanceLock'
import { getSessionUser } from '@/lib/auth'
import { listPayments } from '@/lib/payments'
import { MAINTENANCE_MODE } from '@/lib/maintenance'

export const dynamic = 'force-dynamic'

export default async function PaymentsPage() {
  const user = await getSessionUser()
  const authed = user?.role === 'Admin' || user?.role === 'Accounts'
  const payments = authed ? await listPayments() : []
  const paymentsModule = <DashboardShell active="Payments"><PaymentsClient initialPayments={payments} userRole={user?.role || 'Admin'} /></DashboardShell>
  if (!MAINTENANCE_MODE) return paymentsModule
  return <div className="maintenance-scope"><div className="maintenance-content" inert aria-hidden="true">{paymentsModule}</div><MaintenanceLock /></div>
}
