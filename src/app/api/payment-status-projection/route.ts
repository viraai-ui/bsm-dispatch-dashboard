import { requireUser } from '@/lib/auth'
import { listPayments } from '@/lib/payments'
import { projectPaymentStatuses } from '@/lib/payment-status-projection'

export async function GET() {
  const auth = await requireUser(['Admin', 'Operations'])
  if (!auth.ok) return auth.response
  const bySalesOrder = projectPaymentStatuses(await listPayments())
  return Response.json({ bySalesOrder }, { headers: { 'cache-control': 'no-store' } })
}
