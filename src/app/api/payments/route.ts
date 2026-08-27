import { apiError, apiOk } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { createPayment, listPayments, paymentAttachments, updatePaymentStatus, type PaymentAttachment, type PaymentMode, type PaymentStatus } from '@/lib/payments'
import { notifyAccountsOfNewPayment } from '@/lib/payment-push'
import { createPaymentNotifications } from '@/lib/payment-notifications'
import { verifyR2Object } from '@/lib/r2'
import { INTERNAL_PAYMENT_SCREENSHOT_MAX_BYTES, PAYMENT_PROOF_MIME_TYPES } from '@/lib/payment-screenshot'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
function text(value: unknown) { return String(value || '').trim() }
const PAYMENT_MODES: PaymentMode[] = ['Bank Transfer', 'UPI', 'Cash', 'Credit Card', 'Debit Card', 'Other']

export async function GET() {
  const auth = await requireUser(['Admin', 'Accounts']); if (!auth.ok) return auth.response
  try {
    const payments = (await listPayments()).map((payment) => ({ ...payment, attachments: paymentAttachments(payment).map((proof, index) => ({ ...proof, key: '', url: `/api/payments/${encodeURIComponent(payment.id)}/proof?index=${index}` })) }))
    const response = apiOk({ payments }); response.headers.set('Cache-Control', 'no-store, max-age=0'); return response
  } catch (error) { return apiError(error instanceof Error ? error.message : 'Could not load payments', 500) }
}

export async function POST(request: Request) {
  const auth = await requireUser(['Admin']); if (!auth.ok) return auth.response
  const body = await request.json().catch(() => ({})); const customerName = text(body.customerName); const salesOrderNumber = text(body.salesOrderNumber)
  const paymentAmount = Number(body.paymentAmount); const paymentMode = text(body.paymentMode) as PaymentMode; const remarks = text(body.remarks)
  const legacyKey = text(body.screenshotKey); const requested = Array.isArray(body.attachments) ? body.attachments : legacyKey ? [{ key: legacyKey, name: text(body.screenshotName) }] : []
  if (!customerName || !salesOrderNumber) return apiError('Customer name and sales order number are required', 400)
  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) return apiError('Payment amount must be greater than zero', 400)
  if (!PAYMENT_MODES.includes(paymentMode)) return apiError('Invalid payment mode', 400)
  if (remarks.length > 500) return apiError('Remarks must be 500 characters or fewer', 400)
  if (requested.length > 10) return apiError('Up to 10 payment proofs are allowed', 400)
  try {
    const seen = new Set<string>(); const attachments: PaymentAttachment[] = []
    for (const item of requested) {
      const key = text(item?.key); if (!key || seen.has(key)) return apiError('Invalid or duplicate payment proof', 400); seen.add(key)
      const metadata = await verifyR2Object(key, { prefixes: ['payments/'], expectedTypes: PAYMENT_PROOF_MIME_TYPES, maxBytes: INTERNAL_PAYMENT_SCREENSHOT_MAX_BYTES, order: salesOrderNumber })
      attachments.push({ key, url: `/api/r2/view?key=${encodeURIComponent(key)}`, name: text(item?.name).slice(0, 180) || 'Payment proof', contentType: metadata.contentType, size: metadata.contentLength })
    }
    const first = attachments[0]
    const payment = await createPayment({ customerName, salesOrderNumber, paymentAmount, paymentMode, remarks: remarks || undefined, attachments, screenshotUrl: first?.url, screenshotKey: first?.key, screenshotName: first?.name, createdBy: auth.user.id })
    await createPaymentNotifications(payment, auth.user.id).catch(console.error); await notifyAccountsOfNewPayment(payment).catch(console.error)
    return apiOk({ payment: { ...payment, attachments: paymentAttachments(payment).map((proof, index) => ({ ...proof, key: '', url: `/api/payments/${payment.id}/proof?index=${index}` })) } })
  } catch (error) { return apiError(error instanceof Error ? error.message : 'Could not add payment', 500) }
}

export async function PATCH(request: Request) {
  const auth = await requireUser(['Admin', 'Accounts']); if (!auth.ok) return auth.response
  const body = await request.json().catch(() => ({})); const id = text(body.id); const status = text(body.status) as PaymentStatus
  if (!id || !(['Pending', 'Payment Received'] as PaymentStatus[]).includes(status)) return apiError('Invalid payment status', 400)
  try { const payment = await updatePaymentStatus(id, status); return payment ? apiOk({ payment }) : apiError('Payment not found', 404) } catch (error) { return apiError(error instanceof Error ? error.message : 'Could not update payment', 500) }
}
