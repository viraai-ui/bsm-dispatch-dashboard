import { apiError, apiOk } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { createPayment, listPayments, updatePaymentStatus, type PaymentStatus } from '@/lib/payments'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function text(value: unknown) { return String(value || '').trim() }

export async function GET() {
  const auth = await requireUser(['Admin'])
  if (!auth.ok) return auth.response
  try { return apiOk({ payments: await listPayments() }) }
  catch (error) { return apiError(error instanceof Error ? error.message : 'Could not load payments', 500) }
}

export async function POST(request: Request) {
  const auth = await requireUser(['Admin'])
  if (!auth.ok) return auth.response
  const body = await request.json().catch(() => ({}))
  const customerName = text(body.customerName)
  const salesOrderNumber = text(body.salesOrderNumber)
  const screenshotUrl = text(body.screenshotUrl)
  const screenshotKey = text(body.screenshotKey)
  const screenshotName = text(body.screenshotName)
  if (!customerName || !salesOrderNumber || !screenshotUrl || !screenshotKey) return apiError('Customer, sales order number and payment screenshot are required', 400)
  try {
    const payment = await createPayment({ customerName, salesOrderNumber, screenshotUrl, screenshotKey, screenshotName, createdBy: auth.user.id })
    return apiOk({ payment })
  } catch (error) { return apiError(error instanceof Error ? error.message : 'Could not add payment', 500) }
}

export async function PATCH(request: Request) {
  const auth = await requireUser(['Admin'])
  if (!auth.ok) return auth.response
  const body = await request.json().catch(() => ({}))
  const id = text(body.id)
  const status = text(body.status) as PaymentStatus
  if (!id || !['Pending', 'Payment Received'].includes(status)) return apiError('Invalid payment status update', 400)
  try {
    const payment = await updatePaymentStatus(id, status)
    if (!payment) return apiError('Payment not found', 404)
    return apiOk({ payment })
  } catch (error) { return apiError(error instanceof Error ? error.message : 'Could not update payment', 500) }
}
