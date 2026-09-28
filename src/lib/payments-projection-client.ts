import type { ProjectedPaymentStatus } from './payment-status-projection'
export type PaymentProjection = { version: number; generatedAt: string; bySalesOrder: Record<string, ProjectedPaymentStatus> }
export function validProjection(value: unknown): value is PaymentProjection {
  const p = value as PaymentProjection | null
  return Boolean(p && Number.isSafeInteger(p.version) && p.version > 0 && typeof p.generatedAt === 'string' && Number.isFinite(Date.parse(p.generatedAt)) && p.bySalesOrder && !Array.isArray(p.bySalesOrder) && typeof p.bySalesOrder === 'object' && Object.entries(p.bySalesOrder).every(([key, status]) => key && ['Pending', 'Received', 'Partial', 'Void'].includes(status)))
}
/** One bounded request per instance; source additionally holds a durable shared
 * refresh lease. Never fall back to Dispatch's obsolete payment ledger. */
export function createPaymentProjectionReader(fetcher: typeof fetch = fetch, clock = Date.now) {
  let last: PaymentProjection | undefined, nextAttempt = 0
  let inflight: Promise<PaymentProjection> | undefined
  return async function read(): Promise<PaymentProjection> {
    if (inflight) return inflight
    if (clock() < nextAttempt) {
      if (last) return last
      throw new Error('Payment projection unavailable')
    }
    nextAttempt = clock() + 15_000
    inflight = (async () => {
      try {
        const secret = process.env.DISPATCH_PAYMENT_PROJECTION_SECRET?.trim()
        if (!secret || secret.length < 32) throw new Error('Payment projection is not configured')
        const response = await fetcher('https://bsm-payments-dashboard.vercel.app/api/payment-status-projection', { headers: { authorization: `Bearer ${secret}` }, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12_000) })
        if (!response.ok) throw new Error('Payment projection source unavailable')
        const snapshot: unknown = await response.json()
        if (!validProjection(snapshot)) throw new Error('Invalid payment projection')
        if (!last || snapshot.version > last.version) last = { ...snapshot, bySalesOrder: { ...last?.bySalesOrder, ...snapshot.bySalesOrder } }
        return last
      } catch {
        if (last) return last
        throw new Error('Payment projection temporarily unavailable')
      }
    })()
    try { return await inflight }
    finally { inflight = undefined }
  }
}
export const readPaymentProjection = createPaymentProjectionReader()
