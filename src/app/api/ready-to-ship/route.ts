import { apiError, apiOk } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { addTransporter, deleteTransporter, listReadyToShipItems, readTransportersStore } from '@/lib/ready-to-ship'

export async function GET() {
  const auth = await requireUser(['Admin'])
  if (!auth.ok) return auth.response
  const [items, transporters] = await Promise.all([listReadyToShipItems(), readTransportersStore()])
  return apiOk({ items, transporters: transporters.transporters })
}

export async function POST(request: Request) {
  const auth = await requireUser(['Admin'])
  if (!auth.ok) return auth.response
  try {
    const body = await request.json()
    if (body.action === 'add_transporter') {
      return apiOk({ transporter: await addTransporter({ name: String(body.name || ''), phone: String(body.phone || ''), notes: String(body.notes || '') }) })
    }
    if (body.action === 'delete_transporter') {
      return apiOk(await deleteTransporter(String(body.id || '')))
    }
    return apiError('Unknown Ready to Ship action', 400)
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Ready to Ship update failed', 400)
  }
}
