import { apiError, apiOk } from '@/lib/api'
import { listPaymentOpenSalesOrders } from '@/lib/payment-open-sales-orders'
import { createPaymentNotifications } from '@/lib/payment-notifications'
import { notifyAccountsOfNewPayment } from '@/lib/payment-push'
import { createPublicPayment, listPayments, type PaymentMode } from '@/lib/payments'
import { checkRateLimit, issuePaymentDeleteCapability, publicApiHeaders, sameOrigin, verifySubmissionToken } from '@/lib/public-payment-security'
import { verifyR2Object } from '@/lib/r2'
import { PAYMENT_PROOF_MIME_TYPES, PUBLIC_PAYMENT_SCREENSHOT_MAX_BYTES } from '@/lib/payment-screenshot'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const MODES: PaymentMode[] = ['Bank Transfer', 'UPI', 'Credit Card', 'Debit Card', 'Other']
const MAX_BODY = 20_000
function value(input: unknown) { return String(input || '').trim() }

/** Read-only salesman facade. Keep this deliberately narrower than the authenticated payment API. */
export async function GET(request: Request) {
  const rate = checkRateLimit(request, 'public-payment-list', 120)
  if (!rate.allowed) return publicApiHeaders(apiError('Too many requests', 429))
  try {
    const payments = (await listPayments()).map((payment) => ({
      id: payment.id,
      date: payment.createdAt,
      salesOrderNumber: payment.salesOrderNumber,
      customerName: payment.customerName,
      paymentMode: payment.paymentMode || null,
      paymentAmount: payment.paymentAmount ?? null,
      status: payment.status,
      hasScreenshot: Boolean(payment.screenshotKey),
      proofUrl: payment.screenshotKey ? `/api/public/payments/${encodeURIComponent(payment.id)}/proof` : null,
    }))
    const response = apiOk({ payments })
    response.headers.set('Cache-Control', 'no-store, max-age=0')
    return publicApiHeaders(response)
  } catch (error) {
    return publicApiHeaders(apiError(error instanceof Error ? error.message : 'Could not load payments', 500))
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return publicApiHeaders(apiError('Invalid request origin', 403))
  const length = Number(request.headers.get('content-length') || 0)
  if (length > MAX_BODY) return publicApiHeaders(apiError('Request is too large', 413))
  const rate = checkRateLimit(request, 'public-payment-submit', 8)
  if (!rate.allowed) {
    const response = apiError('Too many submissions. Please try again shortly.', 429)
    response.headers.set('Retry-After', String(rate.retryAfter))
    return publicApiHeaders(response)
  }
  const raw = await request.text().catch(() => '')
  if (Buffer.byteLength(raw) > MAX_BODY) return publicApiHeaders(apiError('Request is too large', 413))
  let body: Record<string, unknown>
  try { body = JSON.parse(raw) } catch { return publicApiHeaders(apiError('Invalid request', 400)) }
  if (value(body.website)) return publicApiHeaders(apiError('Invalid submission', 400))
  if (!verifySubmissionToken(value(body.submissionToken))) return publicApiHeaders(apiError('Form expired. Reload and try again.', 403))
  const idempotencyKey = value(request.headers.get('idempotency-key'))
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(idempotencyKey)) return publicApiHeaders(apiError('Invalid submission key', 400))
  const orderId = value(body.salesOrderId)
  const salesOrderNumber = value(body.salesOrderNumber)
  const amountText = value(body.paymentAmount)
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(amountText)) return publicApiHeaders(apiError('Enter a valid payment amount with up to 2 decimal places', 400))
  const paymentAmount = Number(amountText)
  if (paymentAmount <= 0 || paymentAmount > 9999999999.99) return publicApiHeaders(apiError('Payment amount is outside the allowed range', 400))
  const paymentMode = value(body.paymentMode) as PaymentMode
  if (!MODES.includes(paymentMode)) return publicApiHeaders(apiError('Select a valid payment mode', 400))
  const screenshotKey = value(body.screenshotKey)
  const screenshotUrl = value(body.screenshotUrl)
  const screenshotName = value(body.screenshotName).slice(0, 120)
  if (screenshotKey && (!/^payments\/public\/[a-zA-Z0-9._/-]{1,220}$/.test(screenshotKey) || screenshotUrl !== `/api/r2/view?key=${encodeURIComponent(screenshotKey)}`)) return publicApiHeaders(apiError('Invalid screenshot reference', 400))
  try {
    const order = (await listPaymentOpenSalesOrders(false)).find((item) => item.id === orderId && item.salesOrderNumber === salesOrderNumber)
    if (!order) return publicApiHeaders(apiError('Sales order is no longer open. Please select another.', 400))
    if (screenshotKey) await verifyR2Object(screenshotKey, { prefixes: ['payments/public/'], expectedTypes: PAYMENT_PROOF_MIME_TYPES, maxBytes: PUBLIC_PAYMENT_SCREENSHOT_MAX_BYTES, order: order.salesOrderNumber })
    const deleteCapability = issuePaymentDeleteCapability()
    const result = await createPublicPayment({ customerName: order.customerName, salesOrderNumber: order.salesOrderNumber, paymentAmount, paymentMode, screenshotKey, screenshotUrl, screenshotName, publicDeleteTokenHash: deleteCapability.hash }, idempotencyKey)
    if (!result.duplicate) {
      await createPaymentNotifications(result.payment, 'public-salesman').catch((error) => console.error('Public payment notification failed', error))
      await notifyAccountsOfNewPayment(result.payment).catch((error) => console.error('Public payment push failed', error))
    }
    return publicApiHeaders(apiOk({ receipt: { id: result.payment.id, salesOrderNumber: result.payment.salesOrderNumber, paymentAmount: result.payment.paymentAmount, status: result.payment.status }, deleteToken: result.duplicate ? undefined : deleteCapability.token, duplicate: result.duplicate }))
  } catch (error) {
    return publicApiHeaders(apiError(error instanceof Error ? error.message : 'Could not submit payment', 500))
  }
}
