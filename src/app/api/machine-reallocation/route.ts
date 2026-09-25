import { apiError, apiOk } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { cancelQueuedReallocation, getMachineReallocationView, importCancelledSalesOrder, importCancelledSalesOrders, relocateQueuedMachine, searchCancelledSalesOrders, searchReallocationDestinations, undoQueuedRelocation } from '@/lib/machine-reallocation'

export async function GET(request: Request) {
  const auth = await requireUser(['Admin', 'Operations']); if (!auth.ok) return auth.response
  try { const params = new URL(request.url).searchParams; const query = params.get('q')?.trim(); const rowId = params.get('destinationRowId')?.trim(); return apiOk(rowId ? await searchReallocationDestinations(rowId, query || '') : query ? await searchCancelledSalesOrders(query) : await getMachineReallocationView()) } catch (error) { return apiError(error instanceof Error ? error.message : 'Unable to load reallocation queue', 500) }
}
export async function POST(request: Request) {
  const auth = await requireUser(['Admin', 'Operations']); if (!auth.ok) return auth.response
  try {
    const body = await request.json()
    if (body.action === 'import-batch') {
      if (!Array.isArray(body.orderIds) || !body.orderIds.length) return apiError('At least one cancelled Sales Order is required')
      if (body.orderIds.length > 100 || body.orderIds.some((id: unknown) => typeof id !== 'string' || !id.trim())) return apiError('Invalid Sales Order selection')
      return apiOk(await importCancelledSalesOrders(body.orderIds, auth.user))
    }
    if (body.action === 'import') { if (!String(body.salesOrderNumber || '').trim()) return apiError('Sales Order number is required'); return apiOk(await importCancelledSalesOrder(body.salesOrderNumber, auth.user)) }
    if (body.action === 'relocate') { if (!body.rowId || !body.targetOrderId || !body.targetMachineId) return apiError('Row and target machine are required'); return apiOk(await relocateQueuedMachine(body.rowId, body.targetOrderId, body.targetMachineId, auth.user)) }
    if (body.action === 'cancel') { if (!body.rowId) return apiError('Row is required'); return apiOk(await cancelQueuedReallocation(body.rowId, auth.user)) }
    if (body.action === 'undo') { if (!body.rowId) return apiError('Row is required'); return apiOk(await undoQueuedRelocation(body.rowId, auth.user)) }
    return apiError('Unsupported action')
  } catch (error) { return apiError(error instanceof Error ? error.message : 'Reallocation failed', 409) }
}
