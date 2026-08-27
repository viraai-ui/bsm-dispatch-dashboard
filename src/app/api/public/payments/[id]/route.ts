import { apiError, apiOk } from '@/lib/api'
import { removePaymentNotifications } from '@/lib/payment-notifications'
import { deletePendingPublicPayment, listPayments } from '@/lib/payments'
import { checkRateLimit, hashPaymentDeleteCapability, publicApiHeaders, sameOrigin, verifyPaymentDeleteCapability } from '@/lib/public-payment-security'
import { deleteR2Object } from '@/lib/r2'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return publicApiHeaders(apiError('Invalid request origin', 403))
  const rate = checkRateLimit(request, 'public-payment-delete', 20)
  if (!rate.allowed) return publicApiHeaders(apiError('Too many requests. Please try again shortly.', 429))
  const { id } = await context.params
  const token = (request.headers.get('x-payment-delete-token') || '').trim()
  if (!token || token.length > 200) return publicApiHeaders(apiError('This device is not authorized to delete this payment.', 403))

  try {
    const payment = (await listPayments()).find((item) => item.id === id)
    if (!payment) {
      // Complete cleanup after a prior deletion whose notification write was interrupted.
      await removePaymentNotifications(id)
      return publicApiHeaders(apiOk({ deleted: true, alreadyDeleted: true }))
    }
    if (!verifyPaymentDeleteCapability(token, payment.publicDeleteTokenHash)) return publicApiHeaders(apiError('This device is not authorized to delete this payment.', 403))
    if (payment.status !== 'Pending') return publicApiHeaders(apiError('Payment Received records cannot be deleted.', 409))

    // Fail closed: retain the record whenever its proof cannot be cleaned up.
    if (payment.screenshotKey) {
      try { await deleteR2Object(payment.screenshotKey) }
      catch { return publicApiHeaders(apiError('Could not remove the payment screenshot. Nothing was deleted; please retry.', 503)) }
    }
    const result = await deletePendingPublicPayment(id, hashPaymentDeleteCapability(token))
    if (result.outcome === 'received') return publicApiHeaders(apiError('Payment Received records cannot be deleted.', 409))
    if (result.outcome === 'forbidden') return publicApiHeaders(apiError('This device is not authorized to delete this payment.', 403))
    if (result.outcome === 'not-found') return publicApiHeaders(apiOk({ deleted: true, alreadyDeleted: true }))
    await removePaymentNotifications(id)
    return publicApiHeaders(apiOk({ deleted: true }))
  } catch (error) {
    return publicApiHeaders(apiError(error instanceof Error ? error.message : 'Could not delete payment. Please retry.', 500))
  }
}
