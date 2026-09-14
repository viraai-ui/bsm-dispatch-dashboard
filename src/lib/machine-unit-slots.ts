import type { MachineUnit, Order } from '../types/domain'
import type { OrderWorkflow } from './workflow-store'
import { isMachineLineItem } from './item-classification'

const ordinal = (machine: MachineUnit) => Number(machine.id.match(/-(\d+)$/)?.[1] || machine.unitNumber || 0)

/**
 * Materialise every ordered machine slot. Zoho's pending quantity is a remaining
 * quantity, never the size of the unit identity set. Existing identities always
 * win so serials and dispatched history cannot be duplicated or renumbered.
 */
export function ensureOrderedMachineSlots(order: Order, workflow?: OrderWorkflow): Order {
  const historical = [...(workflow?.processedOrder?.machines || []), ...(order.machines || [])]
  const byId = new Map<string, MachineUnit>()
  for (const machine of historical) byId.set(machine.id, { ...(byId.get(machine.id) || {} as MachineUnit), ...machine })
  const machines: MachineUnit[] = []
  let globalUnit = 0
  for (const line of order.lineItems || []) {
    if (!isMachineLineItem(line)) continue
    const lineExisting = [...byId.values()].filter((machine) => machine.lineItemId === line.id).sort((a, b) => ordinal(a) - ordinal(b))
    const target = Math.max(0, Number(line.quantity || 0), lineExisting.length)
    const template = lineExisting[0]
    for (let slot = 1; slot <= target; slot += 1) {
      globalUnit += 1
      const id = `${order.id}-${line.id}-${slot}`
      const existing = byId.get(id)
      machines.push(existing ? { ...existing, unitNumber: globalUnit } : {
        ...(template || {}), id, unitNumber: globalUnit, serialNumber: '', qrToken: '', orderId: order.id,
        lineItemId: line.id, itemName: line.itemName, sku: line.sku, customerName: order.customerName,
        salesOrderNumber: order.salesOrderNumber, deliveryDate: order.deliveryDate, status: 'Not Generated',
        selectedForBatch: false, woodenPacking: line.woodenPackingRequired ? 'Pending' : 'Not Required',
        qrPasted: false, qcDone: false, mediaPhotos: 0, mediaVideos: 0, itemDescription: line.description,
      })
    }
  }
  return { ...order, machines }
}

export function hasIncompleteMachineSlots(order: Order, workflow?: OrderWorkflow) {
  const hydrated = ensureOrderedMachineSlots(order, workflow)
  return hydrated.machines.some((machine) => !workflow?.machines?.[machine.id]?.dispatchedAt)
}

export function completionCoversMachineIds(machineIds: string[], completedMachineIds?: string[]) {
  if (!machineIds.length) return true
  const done = new Set(completedMachineIds || [])
  return machineIds.every((id) => done.has(id))
}
