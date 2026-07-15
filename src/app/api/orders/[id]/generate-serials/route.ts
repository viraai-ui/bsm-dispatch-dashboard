import type { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api'
import { orders } from '@/lib/mock-data'
import { formatSerial, getFinancialYearPrefix } from '@/lib/rules'
import { requireUser } from '@/lib/auth'

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(['Admin', 'Operations'])
  if (!auth.ok) return auth.response
  const { id } = await params
  const order = orders.find((item) => item.id === id)
  if (!order) return apiError('Order not found', 404)
  if (order.reviewRequired) return apiError('Order has unresolved Zoho review conflict', 409)

  const fyPrefix = getFinancialYearPrefix()
  return apiOk({
    mock: true,
    orderId: order.id,
    message: 'Production path uses Postgres transaction + serial_counters row lock before inserting machine_units.',
    sampleSerial: formatSerial(fyPrefix, 1),
    idempotency: 'existing machine units are checked before create',
  })
}
