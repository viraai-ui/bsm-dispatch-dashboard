import { apiError, apiOk } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { addTransporter, deleteTransporter, listReadyToShipItems, processShipment, readTransportersStore, updateTransporter } from '@/lib/ready-to-ship'
import { R2_DOCUMENT_MAX_BYTES, verifyR2Object } from '@/lib/r2'

export async function GET() {
  const auth = await requireUser(['Admin', 'Operations'])
  if (!auth.ok) return auth.response
  const [items, transporters] = await Promise.all([listReadyToShipItems(), readTransportersStore()])
  return apiOk({ items, transporters: transporters.transporters })
}

export async function POST(request: Request) {
  const auth = await requireUser(['Admin', 'Operations'])
  if (!auth.ok) return auth.response
  try {
    const body = await request.json()
    if (body.action === 'add_transporter') {
      return apiOk({ transporter: await addTransporter({ name: String(body.name || ''), phone: String(body.phone || ''), notes: String(body.notes || '') }) })
    }
    if (body.action === 'delete_transporter') {
      return apiOk(await deleteTransporter(String(body.id || '')))
    }
    if (body.action === 'update_transporter') {
      return apiOk({ transporter: await updateTransporter({ id: String(body.id || ''), name: String(body.name || ''), phone: String(body.phone || ''), notes: String(body.notes || '') }) })
    }
    if (body.action === 'process_shipment') {
      let lrCopy = null
      if (body.lrCopy && typeof body.lrCopy === 'object') {
        const item = (await listReadyToShipItems()).find((candidate) => candidate.id === String(body.itemId || ''))
        if (!item) return apiError('Ready-to-ship item not found', 404)
        const key = String(body.lrCopy.r2Key || '')
        const metadata = await verifyR2Object(key, { prefixes: ['media-proof/'], expectedTypes: ['image/', 'application/pdf'], maxBytes: R2_DOCUMENT_MAX_BYTES, order: item.salesOrderNumber, machineId: 'shipment-lr-builty', stage: 'shipment' })
        lrCopy = { name: String(body.lrCopy.name || '').slice(0, 180), type: metadata.contentType, url: `/api/r2/view?key=${encodeURIComponent(key)}`, r2Key: key, expiresAt: null }
      }
      return apiOk({ shipment: await processShipment({
        itemId: String(body.itemId || ''),
        vehicleNumber: String(body.vehicleNumber || ''),
        driverName: String(body.driverName || ''),
        driverPhone: String(body.driverPhone || ''),
        transporterName: String(body.transporterName || ''),
        transporterPhone: String(body.transporterPhone || ''),
        expectedDelivery: String(body.expectedDelivery || ''),
        notes: String(body.notes || ''),
        customerPhone: String(body.customerPhone || ''),
        salespersonName: String(body.salespersonName || ''),
        salespersonPhone: String(body.salespersonPhone || ''),
        sendWhatsapp: Boolean(body.sendWhatsapp),
        shipmentType: body.shipmentType === 'transporter' ? 'transporter' : 'direct',
        lrCopy,
      }) })
    }
    return apiError('Unknown Ready to Ship action', 400)
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Ready to Ship update failed', 400)
  }
}
