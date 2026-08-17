import { apiError, apiOk } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { allocateSerialNumbers, getOrderWorkflow, upsertOrderWorkflow, type MachineWorkflow } from '@/lib/workflow-store'
import { isMachineLineItem } from '@/lib/item-classification'

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
    if (action === 'undo') {
      const workflow = await upsertOrderWorkflow(id, (current) => {
        const order = body.order as Order | undefined
        return {
          salesOrderId: id,
          salesOrderNumber: order?.salesOrderNumber || current?.salesOrderNumber || '',
          status: 'open',
          machines: {},
        }
      })
      return apiOk({ workflow })
    }
    const order = body.order as Order
    if (action === 'allocate_serials') {
      const serials = await allocateSerialNumbers(id, body.machineIds || [], body.order as Order | undefined)
      return apiOk({ serials })
    }
    const now = new Date().toISOString()
    let sheetBackup: { synced: number; skipped: number; configured: boolean; errors: string[]; queued?: number; status?: 'pending' } | null = null

    const workflow = await upsertOrderWorkflow(id, (current) => {
      const machines = { ...(current?.machines || {}) }
      if (action === 'generate') for (const item of body.machines as MachineWorkflow[]) {
        const existing = machines[item.machineUnitId]
        machines[item.machineUnitId] = { ...item, serialNumber: item.serialNumber || existing?.serialNumber, qrToken: item.qrToken || existing?.qrToken || item.serialNumber || existing?.serialNumber, qrStatus: 'generated', zohoBackupStatus: existing?.zohoBackupStatus === 'synced' ? 'synced' : 'pending', zohoBackupQueuedAt: existing?.zohoBackupQueuedAt || now, zohoBackupError: undefined }
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
        const vendors = (body.dispatchVendors || {}) as Record<string, string>
        for (const machine of selected) machines[machine.id] = { ...machines[machine.id], machineUnitId: machine.id, lineItemId: machine.lineItemId, processedAt: now, dispatchNote: String(notes[machine.id] || '').trim(), vendor: titleCaseVendor(String(vendors[machine.id] || machine.vendor || '').trim()) }
        status = 'processed'
      }
      const processedOrder = action === 'process'
        ? { ...order, machines: order.machines.map((machine) => ({ ...machine, dispatchNote: machines[machine.id]?.dispatchNote || machine.dispatchNote || '', vendor: machines[machine.id]?.vendor || machine.vendor || '', ...(machines[machine.id]?.qrStatus === 'not_required' ? { status: 'QR Printed' as const } : {}) })) }
        : current?.processedOrder
      return { salesOrderId: id, salesOrderNumber: order.salesOrderNumber || current?.salesOrderNumber || '', status, dispatchPriority: action === 'process' ? body.dispatchPriority : current?.dispatchPriority, processedAt: action === 'process' ? now : current?.processedAt, processedOrder, machines }
    })
    if (action === 'generate' && order?.id && Array.isArray(body.machines)) {
      const generatedById = new Map((body.machines as MachineWorkflow[]).map((machine) => [machine.machineUnitId, machine]))
      const generatedMachines = (order.machines || []).map((machine) => {
        const saved = generatedById.get(machine.id)
        return saved ? { ...machine, serialNumber: saved.serialNumber || machine.serialNumber, qrToken: saved.qrToken || machine.qrToken } : machine
      }).filter((machine) => generatedById.has(machine.id))
      // Sheet is a recoverable secondary backup. Workflow persistence is authoritative;
      // the scheduled/manual reconciler drains this explicit, idempotent queue.
      sheetBackup = { synced: 0, skipped: 0, configured: process.env.ZOHO_SERIAL_SHEET_ENABLED === 'true', errors: [], queued: generatedMachines.length, status: 'pending' }
    }
    // Processing is intentionally independent of Zoho Sheet availability. Vendor data is
    // durable in the workflow and can be reconciled without holding this request open.
    return apiOk({ workflow, sheetBackup, masterBackup: null })
  } catch (error) {
    return apiError(error instanceof Error ? error.message : 'Workflow update failed', 400)
  }
}

function selectedMachines(order: Order, selectedMachineIds?: string[]) {
  const ids = new Set((selectedMachineIds || []).filter(Boolean))
  return order.machines.filter((machine) => ids.has(machine.id))
}

function titleCaseVendor(value: string) { return value.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase()) }
