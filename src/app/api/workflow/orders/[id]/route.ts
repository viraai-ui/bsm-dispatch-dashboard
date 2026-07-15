import { apiError, apiOk } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { getOrderWorkflow, upsertOrderWorkflow, type MachineWorkflow } from '@/lib/workflow-store'
import type { Order } from '@/types/domain'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(['Admin', 'Operations'])
  if (!auth.ok) return auth.response
  const { id } = await params
  const workflow = await getOrderWorkflow(id)
  return apiOk({ workflow })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(['Admin', 'Operations'])
  if (!auth.ok) return auth.response
  try {
    const { id } = await params
    const body = await request.json()
    const action = body.action as string
    const order = body.order as Order
    const now = new Date().toISOString()
    const workflow = await upsertOrderWorkflow(id, (current) => {
      const machines = { ...(current?.machines || {}) }
      if (action === 'generate') for (const item of body.machines as MachineWorkflow[]) machines[item.machineUnitId] = item
      if (action === 'not_required') for (const machine of order.machines) machines[machine.id] = { machineUnitId: machine.id, lineItemId: machine.lineItemId, qrStatus: 'not_required', qrNotRequiredAt: now }
      const generated = Object.values(machines).filter((m) => m.qrStatus === 'generated').length
      let status = current?.status || 'open'
      if (action === 'not_required') status = 'qr_not_required'
      else if (order.machines.length && generated >= order.machines.length) status = 'qr_generated'
      else if (generated > 0) status = 'partially_generated'
      if (action === 'process') {
        const incomplete = order.machines.filter((machine) => !['generated', 'not_required'].includes(machines[machine.id]?.qrStatus || 'pending'))
        if (incomplete.length) throw new Error(`Incomplete machines: ${incomplete.map((m) => `Unit ${m.unitNumber}`).join(', ')}`)
        status = 'processed'
      }
      return { salesOrderId: id, salesOrderNumber: order.salesOrderNumber, status, processedAt: action === 'process' ? now : current?.processedAt, processedOrder: action === 'process' ? order : current?.processedOrder, machines }
    })
    return apiOk({ workflow })
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Workflow update failed', 400)
  }
}
