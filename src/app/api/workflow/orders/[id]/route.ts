import { apiError, apiOk } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { allocateSerialNumbers, getOrderWorkflow, upsertOrderWorkflow, type MachineWorkflow } from '@/lib/workflow-store'
import { isMachineLineItem } from '@/lib/item-classification'
import { backupGeneratedSerialsToZohoSheet } from '@/lib/serial-sheet-backup'
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
    if (action === 'allocate_serials') {
      const serials = await allocateSerialNumbers(id, body.machineIds || [])
      return apiOk({ serials })
    }
    const now = new Date().toISOString()
    let sheetBackup: Awaited<ReturnType<typeof backupGeneratedSerialsToZohoSheet>> | null = null
    const workflow = await upsertOrderWorkflow(id, (current) => {
      const machines = { ...(current?.machines || {}) }
      if (action === 'generate') for (const item of body.machines as MachineWorkflow[]) {
        const existing = machines[item.machineUnitId]
        machines[item.machineUnitId] = { ...item, serialNumber: item.serialNumber || existing?.serialNumber, qrToken: item.qrToken || existing?.qrToken || item.serialNumber || existing?.serialNumber, qrStatus: 'generated' }
      }
      if (action === 'not_required') for (const machine of selectedMachines(order, body.selectedMachineIds)) machines[machine.id] = { machineUnitId: machine.id, lineItemId: machine.lineItemId, qrStatus: 'not_required', qrNotRequiredAt: now }
      const generated = Object.values(machines).filter((m) => m.qrStatus === 'generated').length
      let status = current?.status || 'open'
      if (action === 'not_required') status = 'qr_not_required'
      else if (order.machines.length && generated >= order.machines.length) status = 'qr_generated'
      else if (generated > 0) status = 'partially_generated'
      if (action === 'process') {
        const selected = selectedMachines(order, body.selectedMachineIds)
        const nonMachineOnlyOrder = order.machines.length === 0 && (order.lineItems || []).some((item) => item.dispatchCategory !== 'freight' && !isMachineLineItem(item))
        if (!selected.length && !nonMachineOnlyOrder) throw new Error('Please select at least one machine to process')
        const alreadyLocked = selected.filter((machine) => machines[machine.id]?.processedAt || machines[machine.id]?.dispatchedAt)
        if (alreadyLocked.length) throw new Error(`Already processed: ${alreadyLocked.map((m) => `Unit ${m.unitNumber}`).join(', ')}`)
        const incomplete = selected.filter((machine) => !['generated', 'not_required'].includes(machines[machine.id]?.qrStatus || 'pending'))
        if (incomplete.length) throw new Error(`Incomplete selected machines: ${incomplete.map((m) => `Unit ${m.unitNumber}`).join(', ')}`)
        if (!['urgent', 'regular'].includes(String(body.dispatchPriority || ''))) throw new Error('Please select urgent or regular order type')
        const notes = (body.dispatchNotes || {}) as Record<string, string>
        for (const machine of selected) machines[machine.id] = { ...machines[machine.id], machineUnitId: machine.id, lineItemId: machine.lineItemId, processedAt: now, dispatchNote: String(notes[machine.id] || '').trim() }
        status = 'processed'
      }
      const processedOrder = action === 'process'
        ? { ...order, machines: order.machines.map((machine) => ({ ...machine, dispatchNote: machines[machine.id]?.dispatchNote || machine.dispatchNote || '', ...(machines[machine.id]?.qrStatus === 'not_required' ? { status: 'QR Printed' as const } : {}) })) }
        : current?.processedOrder
      return { salesOrderId: id, salesOrderNumber: order.salesOrderNumber || current?.salesOrderNumber || '', status, dispatchPriority: action === 'process' ? body.dispatchPriority : current?.dispatchPriority, processedAt: action === 'process' ? now : current?.processedAt, processedOrder, machines }
    })
    if (action === 'generate' && order?.id && Array.isArray(body.machines)) {
      const generatedDate = new Date().toISOString().slice(0, 10)
      const generatedById = new Map((body.machines as MachineWorkflow[]).map((machine) => [machine.machineUnitId, machine]))
      const generatedMachines = (order.machines || []).map((machine) => {
        const saved = generatedById.get(machine.id)
        return saved ? { ...machine, serialNumber: saved.serialNumber || machine.serialNumber, qrToken: saved.qrToken || machine.qrToken } : machine
      }).filter((machine) => generatedById.has(machine.id))
      sheetBackup = await backupGeneratedSerialsToZohoSheet(order, generatedMachines, generatedDate)
    }
    return apiOk({ workflow, sheetBackup })
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Workflow update failed', 400)
  }
}

function selectedMachines(order: Order, selectedMachineIds?: string[]) {
  const ids = new Set((selectedMachineIds || []).filter(Boolean))
  return order.machines.filter((machine) => ids.has(machine.id))
}
