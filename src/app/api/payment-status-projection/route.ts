import { requireUser } from '@/lib/auth'
import { readPaymentProjection } from '@/lib/payments-projection-client'

export const dynamic = 'force-dynamic'
export async function GET() {
  const auth = await requireUser(['Admin', 'Operations'])
  if (!auth.ok) {
    auth.response.headers.set('cache-control', 'no-store')
    return auth.response
  }
  const headers = { 'cache-control': 'private, no-store' }
  try {
    return Response.json(await readPaymentProjection(), { headers })
  } catch {
    return Response.json({ error: 'Payment projection temporarily unavailable' }, { status: 503, headers })
  }
}
