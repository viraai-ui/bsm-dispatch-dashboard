import type { MachineUnit, Order, OrderLineItem } from '@/types/domain'
import type { MachineWorkflow, OrderWorkflow, Store as WorkflowStore } from './workflow-store'

export type PackagingCompletedRecord = { completedAt: string; order: Order; machineIds?: string[] }
export type PackagingCompletedStore = { completed: Record<string, PackagingCompletedRecord> }
export type SyncOrderStore = { orders: Record<string, Order>; orderIds: string[] }

export function normalizeSalesOrderNumber(value: unknown) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '')
}

function isManualOrder(order: Order) {
  return String(order.id || '').startsWith('manual-so-')
}

function hasDurableWorkflow(workflow: OrderWorkflow | undefined) {
  if (!workflow) return false
  if (workflow.status !== 'open' || workflow.processedAt || workflow.processedOrder) return true
  return Object.values(workflow.machines || {}).some((machine) => Boolean(
    machine.serialNumber || machine.qrToken || machine.qrCode || machine.qrGeneratedAt ||
    machine.qrNotRequiredAt || machine.processedAt || machine.dispatchedAt,
  ))
}

function hasDurableOrderState(order: Order) {
  return [...(order.machines || []), ...(order.retiredMachines || [])].some((machine) => Boolean(
    machine.serialNumber || machine.qrToken || machine.qrPasted || machine.qcDone ||
    machine.mediaPhotos || machine.mediaVideos || machine.vehicleNumber || machine.dispatchNote ||
    !['Not Generated', 'Review Required'].includes(machine.status),
  ))
}

const norm = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
const lineMigrationKey = (line: OrderLineItem) => `${norm(line.itemName)}|${Number(line.rate ?? 0).toFixed(4)}`
const unitOrdinal = (machine: MachineUnit) => {
  const value = Number(machine.unitNumber || machine.id.match(/-(\d+)$/)?.[1] || 0)
  return Number.isFinite(value) && value > 0 ? value : 0
}

type Migration = { order: Order; lineIds: Map<string, string>; machineIds: Map<string, string> }

/**
 * Manual IDs are a separate identity namespace. Do not feed them through normal
 * Zoho reconciliation: line keys may legitimately gain SKU/item IDs in Zoho.
 * Instead establish an unambiguous name+rate line correspondence, then move each
 * unit to the authoritative slot having the same ordinal.
 */
function migrateSnapshot(snapshot: Order, authoritative: Order): Migration {
  const oldGroups = new Map<string, OrderLineItem[]>()
  const newGroups = new Map<string, OrderLineItem[]>()
  for (const line of snapshot.lineItems || []) oldGroups.set(lineMigrationKey(line), [...(oldGroups.get(lineMigrationKey(line)) || []), line])
  for (const line of authoritative.lineItems || []) newGroups.set(lineMigrationKey(line), [...(newGroups.get(lineMigrationKey(line)) || []), line])

  const lineIds = new Map<string, string>()
  for (const oldLine of snapshot.lineItems || []) {
    const key = lineMigrationKey(oldLine)
    const oldMatches = oldGroups.get(key) || []
    const newMatches = newGroups.get(key) || []
    if (oldMatches.length !== 1 || newMatches.length !== 1) {
      throw new Error(`Cannot safely migrate ${authoritative.salesOrderNumber}: ambiguous or missing line ${oldLine.itemName}`)
    }
    lineIds.set(oldLine.id, newMatches[0].id)
  }

  const authoritativeMachines = new Map<string, Map<number, MachineUnit>>()
  for (const machine of authoritative.machines || []) {
    const byOrdinal = authoritativeMachines.get(machine.lineItemId) || new Map<number, MachineUnit>()
    const ordinal = unitOrdinal(machine)
    if (!ordinal || byOrdinal.has(ordinal)) throw new Error(`Cannot safely migrate ${authoritative.salesOrderNumber}: ambiguous authoritative unit ordinal`)
    byOrdinal.set(ordinal, machine)
    authoritativeMachines.set(machine.lineItemId, byOrdinal)
  }

  const machineIds = new Map<string, string>()
  const migrateMachine = (old: MachineUnit): MachineUnit => {
    const lineId = lineIds.get(old.lineItemId)
    const line = authoritative.lineItems.find((item) => item.id === lineId)
    const template = lineId ? authoritativeMachines.get(lineId)?.get(unitOrdinal(old)) : undefined
    if (!line || !template) throw new Error(`Cannot safely migrate ${authoritative.salesOrderNumber}: missing authoritative unit for ${old.id}`)
    machineIds.set(old.id, template.id)
    return {
      ...template,
      ...old,
      id: template.id,
      unitNumber: template.unitNumber,
      orderId: authoritative.id,
      lineItemId: line.id,
      itemName: line.itemName,
      sku: line.sku,
      itemDescription: line.description,
      customerName: authoritative.customerName,
      salesOrderNumber: authoritative.salesOrderNumber,
      deliveryDate: authoritative.deliveryDate,
    }
  }

  const machines = (snapshot.machines || []).map(migrateMachine)
  const retiredMachines = (snapshot.retiredMachines || []).map(migrateMachine)
  return {
    order: { ...snapshot, ...authoritative, lineItems: authoritative.lineItems, machines, retiredMachines },
    lineIds,
    machineIds,
  }
}

function migrateWorkflow(workflow: OrderWorkflow, authoritative: Order, fallbackOrder: Order) {
  const migration = migrateSnapshot(workflow.processedOrder || fallbackOrder, authoritative)
  const machines: Record<string, MachineWorkflow> = {}
  for (const [oldKey, value] of Object.entries(workflow.machines || {})) {
    const machineId = migration.machineIds.get(oldKey) || migration.machineIds.get(value.machineUnitId)
    const lineItemId = migration.lineIds.get(value.lineItemId)
    if (!machineId || !lineItemId) throw new Error(`Cannot safely migrate ${authoritative.salesOrderNumber}: workflow unit has no authoritative identity`)
    machines[machineId] = {
      ...value,
      machineUnitId: machineId,
      lineItemId,
      reallocatedFromMachineId: value.reallocatedFromMachineId ? migration.machineIds.get(value.reallocatedFromMachineId) : undefined,
      reallocatedToMachineId: value.reallocatedToMachineId ? migration.machineIds.get(value.reallocatedToMachineId) : undefined,
    }
  }
  return {
    workflow: { ...workflow, salesOrderId: authoritative.id, salesOrderNumber: authoritative.salesOrderNumber, processedOrder: workflow.processedOrder ? migration.order : undefined, machines },
    machineIds: migration.machineIds,
  }
}

/** Pure, all-store identity reconciliation used by the confirmed-order sync. */
export function reconcileConfirmedOrderSnapshots(input: {
  previous: SyncOrderStore
  fetched: Order[]
  workflowStore: WorkflowStore
  completedStore: PackagingCompletedStore
  now?: string
}) {
  const { previous, fetched } = input
  const workflows = { ...(input.workflowStore.orders || {}) }
  const completed = { ...(input.completedStore.completed || {}) }
  const byNumber = new Map<string, Order[]>()
  const indexCandidate = (order: Order | undefined) => {
    if (!order?.id) return
    const key = normalizeSalesOrderNumber(order.salesOrderNumber)
    if (!key) return
    const candidates = byNumber.get(key) || []
    if (!candidates.some((candidate) => candidate.id === order.id)) byNumber.set(key, [...candidates, order])
  }

  for (const order of Object.values(previous.orders || {})) indexCandidate(order)
  for (const workflow of Object.values(input.workflowStore.orders || {})) indexCandidate(workflow.processedOrder)
  for (const record of Object.values(input.completedStore.completed || {})) indexCandidate(record.order)

  const fetchedNumbers = new Set<string>()
  for (const order of fetched) {
    const key = normalizeSalesOrderNumber(order.salesOrderNumber)
    if (!key) continue
    if (fetchedNumbers.has(key)) throw new Error(`Zoho sync returned duplicate sales order number: ${order.salesOrderNumber}`)
    fetchedNumbers.add(key)
  }

  const orders: Record<string, Order> = {}
  const orderIds: string[] = []
  const migrated: Array<{ to: string; salesOrderNumber: string }> = []
  const migratedFrom = new Set<string>()
  for (const authoritative of fetched) {
    const candidates = (byNumber.get(normalizeSalesOrderNumber(authoritative.salesOrderNumber)) || []).filter(isManualOrder)
    if (candidates.length > 1) throw new Error(`Ambiguous manual sales order number: ${authoritative.salesOrderNumber}`)
    const manual = candidates[0]
    let nextOrder = authoritative
    if (manual && manual.id !== authoritative.id) {
      if (workflows[authoritative.id] || completed[authoritative.id]) throw new Error(`Cannot migrate ${authoritative.salesOrderNumber}: Zoho identity already has workflow history`)
      const oldWorkflow = workflows[manual.id]
      const source = oldWorkflow?.processedOrder || completed[manual.id]?.order || manual
      nextOrder = migrateSnapshot(source, authoritative).order

      let workflowMachineIds = new Map<string, string>()
      if (oldWorkflow) {
        const migratedWorkflow = migrateWorkflow(oldWorkflow, authoritative, source)
        workflows[authoritative.id] = migratedWorkflow.workflow
        workflowMachineIds = migratedWorkflow.machineIds
        delete workflows[manual.id]
      }
      if (completed[manual.id]) {
        const oldCompleted = completed[manual.id]
        const completedMigration = migrateSnapshot(oldCompleted.order, authoritative)
        completed[authoritative.id] = {
          ...oldCompleted,
          order: completedMigration.order,
          machineIds: oldCompleted.machineIds?.map((id) => completedMigration.machineIds.get(id) || workflowMachineIds.get(id) || (() => { throw new Error(`Cannot safely migrate ${authoritative.salesOrderNumber}: completed unit has no authoritative identity`) })()),
        }
        delete completed[manual.id]
      }
      migratedFrom.add(manual.id)
      migrated.push({ to: authoritative.id, salesOrderNumber: authoritative.salesOrderNumber })
    }
    orders[nextOrder.id] = nextOrder
    orderIds.push(nextOrder.id)
  }

  const fetchedIds = new Set(orderIds)
  for (const id of previous.orderIds || Object.keys(previous.orders || {})) {
    const order = previous.orders[id]
    if (!order || fetchedIds.has(id) || migratedFrom.has(id)) continue
    if (hasDurableWorkflow(workflows[id]) || hasDurableOrderState(order) || Boolean(completed[id])) {
      orders[id] = order
      orderIds.push(id)
    }
  }
  return { orders, orderIds, workflowStore: { ...input.workflowStore, orders: workflows }, completedStore: { ...input.completedStore, completed }, migrated }
}
