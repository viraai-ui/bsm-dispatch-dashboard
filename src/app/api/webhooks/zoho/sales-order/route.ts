import { NextRequest } from 'next/server'
import { apiError, apiOk, requireWebhookSecret } from '@/lib/api'

export async function POST(request: NextRequest) {
  if (!requireWebhookSecret(request)) return apiError('Invalid webhook secret', 401)
  const payload = await request.json().catch(() => null)
  return apiOk({ stored: true, nextAction: 'fetch_full_sales_order_from_zoho', payloadReceived: Boolean(payload) })
}
