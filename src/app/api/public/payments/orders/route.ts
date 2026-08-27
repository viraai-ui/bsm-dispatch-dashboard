import { apiError, apiOk } from '@/lib/api'
import { listPaymentOpenSalesOrders } from '@/lib/payment-open-sales-orders'
import { checkRateLimit, issueSubmissionToken, publicApiHeaders } from '@/lib/public-payment-security'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const rate = checkRateLimit(request, 'public-payment-orders', 30)
  if (!rate.allowed) {
    const response = apiError('Too many requests. Please try again shortly.', 429)
    response.headers.set('Retry-After', String(rate.retryAfter))
    return publicApiHeaders(response)
  }
  try {
    // Deliberately uses only the dedicated read-only payment lookup; no state is persisted.
    const refresh = new URL(request.url).searchParams.get('refresh') === '1'
    const orders = (await listPaymentOpenSalesOrders(refresh)).map(({ id, salesOrderNumber, customerName }) => ({ id, salesOrderNumber, customerName }))
    return publicApiHeaders(apiOk({ orders, submissionToken: issueSubmissionToken() }))
  } catch (error) {
    return publicApiHeaders(apiError(error instanceof Error ? error.message : 'Could not load sales orders', 502))
  }
}
