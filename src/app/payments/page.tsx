import { DashboardShell } from '@/components/DashboardShell'
import { PaymentsClient } from '@/components/PaymentsClient'
import { hasPageAccess } from '@/lib/page-auth'
import { listPayments } from '@/lib/payments'

export const dynamic = 'force-dynamic'

export default async function PaymentsPage() {
  const authed = await hasPageAccess(['Admin'])
  const payments = authed ? await listPayments() : []
  return <DashboardShell active="Payments"><PaymentsClient initialPayments={payments} /></DashboardShell>
}
