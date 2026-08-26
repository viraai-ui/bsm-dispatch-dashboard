import { apiError, apiOk } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { createPayment, listPayments, updatePaymentStatus, type PaymentMode, type PaymentStatus } from '@/lib/payments'
import { notifyAccountsOfNewPayment } from '@/lib/payment-push'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function text(value: unknown) { return String(value || '').trim() }
const PAYMENT_MODES: PaymentMode[] = ['Bank Transfer', 'UPI', 'Credit Card', 'Debit Card', 'Other']

export async function GET() {
  const auth = await requireUser(['Admin', 'Accounts'])
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
  const paymentAmount = Number(body.paymentAmount)
  const paymentMode = text(body.paymentMode) as PaymentMode
  const screenshotUrl = text(body.screenshotUrl)
  const screenshotKey = text(body.screenshotKey)
  const screenshotName = text(body.screenshotName)
  if (!customerName || !salesOrderNumber) return apiError('Customer name and sales order number are required', 400)
  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) return apiError('Payment amount must be greater than zero', 400)
  if (!PAYMENT_MODES.includes(paymentMode)) return apiError('Invalid payment mode', 400)
  try {
    const payment = await createPayment({ customerName, salesOrderNumber, paymentAmount, paymentMode, screenshotUrl, screenshotKey, screenshotName, createdBy: auth.user.id })
    await notifyAccountsOfNewPayment(payment).catch((error) => console.error('Payment created but notification failed', error))
    return apiOk({ payment })
  } catch (error) { return apiError(error instanceof Error ? error.message : 'Could not add payment', 500) }
}

export async function PATCH(request: Request) {
  const auth = await requireUser(['Accounts'])
  if (!auth.ok) return auth.response
  const body = await request.json().catch(() => ({}))
  const id = text(body.id)
  const status = text(body.status) as PaymentStatus
  if (!id || !(['Pending', 'Payment Received'] as PaymentStatus[]).includes(status)) return apiError('Invalid payment status', 400)
  try {
    const payment = await updatePaymentStatus(id, status)
    if (!payment) return apiError('Payment not found', 404)
    return apiOk({ payment })
  } catch (error) { return apiError(error instanceof Error ? error.message : 'Could not update payment', 500) }
}
