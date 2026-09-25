import type { SafeUser } from './auth'
import type { MachineUnit, Order } from '@/types/domain'
import { isOperationalZohoOrder, listSyncedOrdersFromSnapshots, readSyncedOrdersStore, type SyncedOrdersStore } from './synced-orders'
import { deriveWorkflowStatus, githubReadJson, githubRequest, githubWriteRetryDelay, isGitHubWriteConflict, type MachineWorkflow, type OrderWorkflow, type Store } from './workflow-store'
import { isOrderTombstoned, LIFECYCLE_BASELINE_PATH, type LifecycleBaselineStore } from './operational-orders'
import { markPublicDatabaseDirty } from './public-database-freshness'

export const REALLOCATION_STORE_PATH = 'data/workflow-store.json'
const emptyBaseline: LifecycleBaselineStore = { version: 1, cutoverVersion: '', cutoverDate: '', tombstones: {} }

export type ReallocationAudit = { at: string; actor: { id: string; name: string; email: string }; action: 'imported' | 'cancelled' | 'relocated' | 'undo_relocation'; sourceOrderId: string; sourceSalesOrderNumber: string; sourceMachineId: string; serialNumber: string; targetOrderId?: string; targetSalesOrderNumber?: string; targetMachineId?: string; displacedDestinationSerial?: string; displacedDestinationQrToken?: string; displacedDestinationSerialVoidedAt?: string }
type RelocationSnapshot = { sourceWorkflow: MachineWorkflow; targetWorkflow: MachineWorkflow; sourceMachine: MachineUnit; targetMachine: MachineUnit; targetRetiredCount: number }
export type ReallocationRow = { id: string; sourceOrderId: string; sourceSalesOrderNumber: string; sourceCustomerName: string; sourceMachineId: string; serialNumber: string; qrToken?: string; itemName: string; sku: string; itemDescription?: string; importedAt: string; importedBy: string; status: 'available' | 'relocated'; relocatedAt?: string; targetOrderId?: string; targetSalesOrderNumber?: string; targetMachineId?: string; relocationSnapshot?: RelocationSnapshot; audit: ReallocationAudit[] }
export type ReallocationState = { rows: Record<string, ReallocationRow>; importedOrders: Record<string, { orderId: string; salesOrderNumber: string; importedAt: string; importedBy: string }>; audit: ReallocationAudit[] }
export type ReallocationStore = Store & { machineReallocation?: ReallocationState }
export type TargetOption = { orderId: string; salesOrderNumber: string; customerName: string; machineId: string; itemName: string; sku: string; currentSerialNumber?: string }
export type CancelledOrderSearchResult = { orderId: string; salesOrderNumber: string; customerName: string; status: string; date: string; generatedMachineCount: number; eligibleMachineCount: number; eligible: boolean; ineligibilityReason?: string; historical: boolean }

const stateOf = (store: ReallocationStore): ReallocationState => store.machineReallocation || { rows: {}, importedOrders: {}, audit: [] }
const key = (value: unknown) => String(value || '').trim().toLowerCase()
const compatible = (a: Pick<MachineUnit, 'sku' | 'itemName'>, b: Pick<MachineUnit, 'sku' | 'itemName'>) => key(a.sku) === key(b.sku) && key(a.itemName) === key(b.itemName)
const sourceLocked = (machine: MachineUnit) => Boolean(machine.sourceRemovedAt)
const targetLocked = (machine: MachineUnit, workflow?: MachineWorkflow) => Boolean(machine.sourceRemovedAt || workflow?.dispatchedAt || workflow?.processedAt || machine.status === 'Dispatched' || machine.status === 'Processed')
const serialFor = (machine: MachineUnit, workflow?: MachineWorkflow) => String(workflow?.serialNumber || machine.serialNumber || '').trim()
const tokenFor = (machine: MachineUnit, workflow?: MachineWorkflow) => String(workflow?.qrToken || machine.qrToken || '').trim()
const cancelled = (order: Order, tombstones: LifecycleBaselineStore['tombstones']) => isOrderTombstoned(order, tombstones) || ['cancelled', 'canceled', 'void'].includes(key(order.status))

function workflowOrder(store: ReallocationStore, order: Order): OrderWorkflow {
  return store.orders[order.id] || { salesOrderId: order.id, salesOrderNumber: order.salesOrderNumber, status: 'open', processedOrder: order, machines: {} }
}

/** Combines the current Zoho snapshot with durable workflow history without duplicate orders. */
export function historicalOrders(synced: SyncedOrdersStore, store: ReallocationStore) {
  const syncedIds = new Set(synced.orderIds)
  const orders = listSyncedOrdersFromSnapshots(synced, store.orders || {}).filter(order => syncedIds.has(order.id))
  const seen = new Set(orders.map(order => order.id))
  for (const workflow of Object.values(store.orders || {})) {
    const saved = workflow.processedOrder
    if (!saved || seen.has(saved.id)) continue
    const machines = saved.machines.map(machine => {
      const record = workflow.machines?.[machine.id]
      if (!record) return machine
      return { ...machine, serialNumber: record.serialNumber || machine.serialNumber, qrToken: record.qrToken || machine.qrToken, status: record.dispatchedAt ? 'Dispatched' as const : record.processedAt ? 'Processed' as const : record.qrStatus === 'generated' ? 'QR Generated' as const : machine.status }
    })
    orders.push({ ...saved, machines })
    seen.add(saved.id)
  }
  return orders
}

/** Only currently operational, non-tombstoned Zoho orders may receive a serial. */
export function activeTargetOrders(synced: SyncedOrdersStore, store: ReallocationStore, tombstones: LifecycleBaselineStore['tombstones']) {
  const activeIds = new Set(synced.orderIds.filter(id => isOperationalZohoOrder(synced.orders[id]) && !isOrderTombstoned(synced.orders[id], tombstones)))
  return historicalOrders(synced, store).filter(order => activeIds.has(order.id))
}

export function importCancelledOrder(store: ReallocationStore, order: Order, actor: SafeUser, at: string) {
  const state = stateOf(store)
  if (state.importedOrders[order.id]) throw new Error('This cancelled Sales Order has already been imported')
  const workflow = workflowOrder(store, order)
  const generated = order.machines.filter(machine => serialFor(machine, workflow.machines[machine.id]))
  if (!generated.length) throw new Error('No generated machine serials were found for this Sales Order')
  const eligible = generated.filter(machine => !sourceLocked(machine))
  if (!eligible.length) throw new Error('Generated machines were already removed or are already queued')
  const rows = { ...state.rows }; const audits: ReallocationAudit[] = []
  for (const machine of eligible) {
    const saved = workflow.machines[machine.id]
    const serialNumber = serialFor(machine, saved)
    if (Object.values(rows).some(row => key(row.serialNumber) === key(serialNumber))) throw new Error(`Serial ${serialNumber} is already in the reallocation queue`)

    const audit: ReallocationAudit = { at, actor: { id: actor.id, name: actor.name, email: actor.email }, action: 'imported', sourceOrderId: order.id, sourceSalesOrderNumber: order.salesOrderNumber, sourceMachineId: machine.id, serialNumber }
    const id = `${order.id}:${machine.id}`
    rows[id] = { id, sourceOrderId: order.id, sourceSalesOrderNumber: order.salesOrderNumber, sourceCustomerName: order.customerName, sourceMachineId: machine.id, serialNumber, qrToken: tokenFor(machine, saved) || serialNumber, itemName: machine.itemName, sku: machine.sku, itemDescription: machine.itemDescription, importedAt: at, importedBy: actor.email, status: 'available', audit: [audit] }
    audits.push(audit)
  }
  store.machineReallocation = { rows, importedOrders: { ...state.importedOrders, [order.id]: { orderId: order.id, salesOrderNumber: order.salesOrderNumber, importedAt: at, importedBy: actor.email } }, audit: [...state.audit, ...audits] }
  return store.machineReallocation
}

/** Search projection for the add modal. Any database order may be a source when it has movable serials. */
export function searchHistoricalOrders(orders: Order[], store: ReallocationStore, tombstones: LifecycleBaselineStore['tombstones'], input: string, currentOrderIds: Set<string> = new Set()) {
  const query = key(input)
  if (!query) return [] as CancelledOrderSearchResult[]
  const state = stateOf(store)
  return orders.filter(order => key(order.customerName).includes(query) || key(order.salesOrderNumber).includes(query)).map(order => {
    const workflow = workflowOrder(store, order)
    const generated = order.machines.filter(machine => serialFor(machine, workflow.machines[machine.id]))
    const eligibleMachines = generated.filter(machine => {
      const saved = workflow.machines[machine.id]; const serial = serialFor(machine, saved)
      return !sourceLocked(machine) && !Object.values(state.rows).some(row => key(row.serialNumber) === key(serial))
    })
    const alreadyImported = Boolean(state.importedOrders[order.id])
    let ineligibilityReason: string | undefined
    if (alreadyImported) ineligibilityReason = 'Already imported'
    else if (!generated.length) ineligibilityReason = 'No generated machine serials'
    else if (!eligibleMachines.length) ineligibilityReason = 'Generated machines were already removed or are already queued'
    return { orderId: order.id, salesOrderNumber: order.salesOrderNumber, customerName: order.customerName, status: isOrderTombstoned(order, tombstones) ? 'Cancelled' : String(order.status || ''), date: order.zohoLastModifiedTime || order.deliveryDate || '', generatedMachineCount: generated.length, eligibleMachineCount: eligibleMachines.length, eligible: !alreadyImported && eligibleMachines.length > 0, ineligibilityReason, historical: !currentOrderIds.has(order.id) }
  }).sort((a, b) => Number(b.eligible) - Number(a.eligible) || a.customerName.localeCompare(b.customerName) || a.salesOrderNumber.localeCompare(b.salesOrderNumber))
}

/** Applies the whole selection to a disposable clone before changing the persistence snapshot. */
export function importCancelledOrdersBatch(store: ReallocationStore, orders: Order[], orderIds: string[], tombstones: LifecycleBaselineStore['tombstones'], actor: SafeUser, at: string) {
  const ids = Array.from(new Set(orderIds.map(value => String(value || '').trim()).filter(Boolean)))
  if (!ids.length) throw new Error('At least one cancelled Sales Order is required')
  const selected = ids.map(id => orders.find(order => order.id === id || order.zohoSalesOrderId === id))
  const missingAt = selected.findIndex(order => !order)
  if (missingAt >= 0) throw new Error(`Cancelled Sales Order ${ids[missingAt]} was not found in local database/history`)
  const preview = structuredClone(store) as ReallocationStore
  for (const order of selected as Order[]) importCancelledOrder(preview, order, actor, at)
  store.machineReallocation = preview.machineReallocation
  return store.machineReallocation!
}

export function cancelQueuedMachine(store: ReallocationStore, rowId: string, actor: SafeUser, at: string) {
  const state = stateOf(store); const row = state.rows[rowId]
  if (!row) throw new Error('Reallocation row was not found')
  if (row.status !== 'available') throw new Error('Only an available queued machine can be removed')
  const audit: ReallocationAudit = { at, actor: { id: actor.id, name: actor.name, email: actor.email }, action: 'cancelled', sourceOrderId: row.sourceOrderId, sourceSalesOrderNumber: row.sourceSalesOrderNumber, sourceMachineId: row.sourceMachineId, serialNumber: row.serialNumber }
  const rows = { ...state.rows }; delete rows[rowId]
  const importedOrders = { ...state.importedOrders }
  if (!Object.values(rows).some(item => item.sourceOrderId === row.sourceOrderId)) delete importedOrders[row.sourceOrderId]
  store.machineReallocation = { rows, importedOrders, audit: [...state.audit, audit] }
  return audit
}

export function targetOptions(store: ReallocationStore, activeOrders: Order[], row: ReallocationRow): TargetOption[] {
  return activeOrders.flatMap(order => {
    if (order.id === row.sourceOrderId) return []
    const workflow = workflowOrder(store, order)
    return order.machines.filter(machine => compatible(row, machine) && !targetLocked(machine, workflow.machines[machine.id])).map(machine => ({ orderId: order.id, salesOrderNumber: order.salesOrderNumber, customerName: order.customerName, machineId: machine.id, itemName: machine.itemName, sku: machine.sku, currentSerialNumber: serialFor(machine, workflow.machines[machine.id]) || undefined }))
  })
}

/** Destination choices are deliberately returned only in response to an operator query. */
export function searchTargetOptions(store: ReallocationStore, activeOrders: Order[], row: ReallocationRow, input: string): TargetOption[] {
  const query = key(input)
  if (!query) return []
  return targetOptions(store, activeOrders, row).filter(target => key(`${target.customerName} ${target.salesOrderNumber}`).includes(query))
}

function updatedOrder(base: Order, fallback: Order, machineId: string, update: (machine: MachineUnit) => MachineUnit) {
  const saved = new Map((base.machines || []).map(machine => [machine.id, machine]))
  const machines = fallback.machines.map(machine => {
    const merged = { ...machine, ...(saved.get(machine.id) || {}) }
    return machine.id === machineId ? update(merged) : merged
  })
  return { ...fallback, ...base, lineItems: base.lineItems?.length ? base.lineItems : fallback.lineItems, machines }
}

export function relocateMachine(store: ReallocationStore, orders: Order[], activeTargetOrderIds: Set<string>, rowId: string, targetOrderId: string, targetMachineId: string, actor: SafeUser, at: string) {
  const state = stateOf(store); const row = state.rows[rowId]
  if (!row) throw new Error('Reallocation row was not found')
  if (row.status !== 'available') throw new Error('This machine has already been reallocated')
  if (!activeTargetOrderIds.has(targetOrderId)) throw new Error('Target Sales Order is no longer active')
  const source = orders.find(order => order.id === row.sourceOrderId); const target = orders.find(order => order.id === targetOrderId)
  if (!source || !target) throw new Error('Source or target Sales Order was not found')
  const sourceMachine = source.machines.find(machine => machine.id === row.sourceMachineId); const targetMachine = target.machines.find(machine => machine.id === targetMachineId)
  if (!sourceMachine || !targetMachine) throw new Error('Source or target machine unit was not found')
  const sourceWorkflow = workflowOrder(store, source); const targetWorkflow = workflowOrder(store, target)
  const sourceSaved = sourceWorkflow.machines[sourceMachine.id]
  if (serialFor(sourceMachine, sourceSaved) !== row.serialNumber) throw new Error('Source serial ownership changed; refresh before retrying')
  if (!compatible(sourceMachine, targetMachine)) throw new Error('Target machine model is not compatible')
  if (sourceLocked(sourceMachine) || targetLocked(targetMachine, targetWorkflow.machines[targetMachine.id])) throw new Error('Source or target machine is dispatched or locked')
  for (const order of orders) for (const machine of order.machines || []) if (key(machine.serialNumber) === key(row.serialNumber) && !(order.id === source.id && machine.id === sourceMachine.id)) throw new Error('Serial has another owner; relocation aborted')
  for (const orderWorkflow of Object.values(store.orders)) for (const machine of Object.values(orderWorkflow.machines || {})) if (key(machine.serialNumber) === key(row.serialNumber) && !(orderWorkflow.salesOrderId === source.id && machine.machineUnitId === sourceMachine.id)) throw new Error('Serial has another owner; relocation aborted')

  const qrToken = tokenFor(sourceMachine, sourceSaved) || row.qrToken
  if (!qrToken) throw new Error('Source QR token is missing; relocation aborted')
  const displacedDestinationSerial = serialFor(targetMachine, targetWorkflow.machines[targetMachine.id]) || undefined
  const displacedDestinationQrToken = displacedDestinationSerial ? tokenFor(targetMachine, targetWorkflow.machines[targetMachine.id]) || undefined : undefined
  const audit: ReallocationAudit = { at, actor: { id: actor.id, name: actor.name, email: actor.email }, action: 'relocated', sourceOrderId: source.id, sourceSalesOrderNumber: source.salesOrderNumber, sourceMachineId: sourceMachine.id, serialNumber: row.serialNumber, targetOrderId: target.id, targetSalesOrderNumber: target.salesOrderNumber, targetMachineId: targetMachine.id, displacedDestinationSerial, displacedDestinationQrToken, displacedDestinationSerialVoidedAt: displacedDestinationSerial ? at : undefined }
  const sourceRecord: MachineWorkflow = { ...(sourceSaved || { machineUnitId: sourceMachine.id, lineItemId: sourceMachine.lineItemId, qrStatus: 'generated' as const }), serialNumber: row.serialNumber, qrToken }
  const { qrCode, qrGeneratedAt, ...sourceWithoutQr } = sourceRecord
  sourceWorkflow.machines = { ...sourceWorkflow.machines, [sourceMachine.id]: { ...sourceWithoutQr, serialNumber: undefined, qrToken: undefined, qrStatus: 'pending', reallocatedToMachineId: targetMachine.id, reallocatedAt: at } }
  const targetSaved: MachineWorkflow = { ...(targetWorkflow.machines[targetMachine.id] || { machineUnitId: targetMachine.id, lineItemId: targetMachine.lineItemId, qrStatus: displacedDestinationSerial ? 'generated' as const : 'pending' as const }), serialNumber: displacedDestinationSerial, qrToken: displacedDestinationQrToken }
  const relocationSnapshot: RelocationSnapshot = { sourceWorkflow: structuredClone(sourceRecord), targetWorkflow: structuredClone(targetSaved), sourceMachine: structuredClone((sourceWorkflow.processedOrder || source).machines.find(machine => machine.id === sourceMachine.id) || sourceMachine), targetMachine: structuredClone((targetWorkflow.processedOrder || target).machines.find(machine => machine.id === targetMachine.id) || targetMachine), targetRetiredCount: (targetWorkflow.processedOrder?.retiredMachines || []).length }
  targetWorkflow.machines = { ...targetWorkflow.machines, [targetMachine.id]: { ...targetSaved, serialNumber: row.serialNumber, qrToken, qrCode, qrStatus: 'generated', qrGeneratedAt: qrGeneratedAt || at, zohoBackupStatus: 'pending', zohoBackupQueuedAt: at, zohoBackupSyncedAt: undefined, zohoBackupError: undefined, zohoBackupReplaceExisting: true, reallocatedFromMachineId: sourceMachine.id, reallocatedAt: at, replacedSerialNumber: displacedDestinationSerial, replacedSerialQrToken: displacedDestinationQrToken, replacedSerialVoidedAt: displacedDestinationSerial ? at : undefined } }
  sourceWorkflow.processedOrder = updatedOrder(sourceWorkflow.processedOrder || source, source, sourceMachine.id, machine => ({ ...machine, serialNumber: '', qrToken: '', status: 'Not Generated', selectedForBatch: false, qrPasted: false, qcDone: false, sourceRemovedAt: at }))
  targetWorkflow.processedOrder = updatedOrder(targetWorkflow.processedOrder || target, target, targetMachine.id, machine => ({ ...machine, serialNumber: row.serialNumber, qrToken, status: 'QR Generated', selectedForBatch: false, qrPasted: false, qcDone: false }))
  if (displacedDestinationSerial) targetWorkflow.processedOrder.retiredMachines = [...(targetWorkflow.processedOrder.retiredMachines || []), { ...targetMachine, serialNumber: displacedDestinationSerial, qrToken: displacedDestinationQrToken || '', sourceRemovedAt: at }]
  sourceWorkflow.status = deriveWorkflowStatus(sourceWorkflow, sourceWorkflow.processedOrder.machines.length)
  targetWorkflow.status = deriveWorkflowStatus(targetWorkflow, targetWorkflow.processedOrder.machines.length)
  store.orders[source.id] = sourceWorkflow; store.orders[target.id] = targetWorkflow
  const updated = { ...row, qrToken, status: 'relocated' as const, relocatedAt: at, targetOrderId: target.id, targetSalesOrderNumber: target.salesOrderNumber, targetMachineId: targetMachine.id, relocationSnapshot, audit: [...row.audit, audit] }
  store.machineReallocation = { ...state, rows: { ...state.rows, [rowId]: updated }, audit: [...state.audit, audit] }
  return updated
}

export function undoRelocation(store: ReallocationStore, rowId: string, actor: SafeUser, at: string) {
  const state = stateOf(store); const row = state.rows[rowId]
  if (!row) throw new Error('Reallocation row was not found')
  if (row.status !== 'relocated' || !row.targetOrderId || !row.targetMachineId) throw new Error('This relocation cannot be undone or was already undone')
  const source = store.orders[row.sourceOrderId]; const target = store.orders[row.targetOrderId]
  if (!source?.processedOrder || !target?.processedOrder) throw new Error('Source or target workflow was not found')
  const currentSource = source.machines[row.sourceMachineId]; const currentTarget = target.machines[row.targetMachineId]
  if (currentSource?.serialNumber) throw new Error('Source machine ownership changed; undo aborted')
  if (key(currentTarget?.serialNumber) !== key(row.serialNumber) || currentTarget?.reallocatedFromMachineId !== row.sourceMachineId) throw new Error('Target machine ownership changed; undo aborted')
  let snapshot = row.relocationSnapshot
  let legacyRetiredIndex = -1
  if (!snapshot) {
    const relocatedAudit = [...row.audit, ...state.audit].reverse().find(entry => entry.action === 'relocated' && entry.sourceOrderId === row.sourceOrderId && entry.sourceMachineId === row.sourceMachineId && entry.targetOrderId === row.targetOrderId && entry.targetMachineId === row.targetMachineId && key(entry.serialNumber) === key(row.serialNumber))
    if (!currentSource || currentSource.reallocatedToMachineId !== row.targetMachineId || !relocatedAudit) throw new Error('Legacy relocation history is incomplete; undo aborted')
    const retired = target.processedOrder.retiredMachines || []
    const relocationAt = relocatedAudit.displacedDestinationSerialVoidedAt || currentTarget.replacedSerialVoidedAt || relocatedAudit.at || row.relocatedAt
    const retiredCandidates = retired.map((machine, index) => ({ machine, index })).filter(({ machine }) => machine.id === row.targetMachineId && (!relocationAt || machine.sourceRemovedAt === relocationAt))
    if (retiredCandidates.length > 1) throw new Error('Legacy destination history conflicts; undo aborted')
    const retiredCandidate = retiredCandidates[0]
    const displacedCandidates = [currentTarget.replacedSerialNumber, relocatedAudit.displacedDestinationSerial, retiredCandidate?.machine.serialNumber].map(value => String(value || '').trim()).filter(Boolean)
    if (new Set(displacedCandidates.map(key)).size > 1) throw new Error('Legacy destination history conflicts; undo aborted')
    const displaced = displacedCandidates[0]
    legacyRetiredIndex = retiredCandidate && key(retiredCandidate.machine.serialNumber) === key(displaced) ? retiredCandidate.index : -1
    const retiredMachine = legacyRetiredIndex >= 0 ? retired[legacyRetiredIndex] : undefined
    const displacedQrCandidates = [currentTarget.replacedSerialQrToken, relocatedAudit.displacedDestinationQrToken, retiredMachine?.qrToken].map(value => String(value || '').trim()).filter(Boolean)
    if (new Set(displacedQrCandidates.map(key)).size > 1) throw new Error('Legacy destination QR history conflicts; undo aborted')
    const sourceProcessed = source.processedOrder.machines.find(machine => machine.id === row.sourceMachineId)
    const targetProcessed = target.processedOrder.machines.find(machine => machine.id === row.targetMachineId)
    if (!sourceProcessed || !targetProcessed) throw new Error('Legacy relocation machine history is incomplete; undo aborted')
    const sourceQrToken = String(row.qrToken || currentTarget.qrToken || row.serialNumber).trim()
    const sourceWorkflow: MachineWorkflow = { ...currentSource, serialNumber: row.serialNumber, qrToken: sourceQrToken, qrCode: currentTarget.qrCode, qrStatus: 'generated', qrGeneratedAt: currentTarget.qrGeneratedAt, reallocatedToMachineId: undefined, reallocatedAt: undefined }
    const targetWorkflow: MachineWorkflow = { ...currentTarget, serialNumber: displaced || undefined, qrToken: displaced ? displacedQrCandidates[0] || displaced : undefined, qrCode: undefined, qrStatus: displaced ? 'generated' : 'pending', qrGeneratedAt: undefined, reallocatedFromMachineId: undefined, reallocatedAt: undefined, replacedSerialNumber: undefined, replacedSerialQrToken: undefined, replacedSerialVoidedAt: undefined }
    const sourceMachine: MachineUnit = { ...sourceProcessed, serialNumber: row.serialNumber, qrToken: sourceQrToken, status: 'QR Generated', selectedForBatch: false, qrPasted: false, qcDone: false, sourceRemovedAt: undefined }
    const targetMachine: MachineUnit = retiredMachine ? { ...retiredMachine, sourceRemovedAt: undefined } : { ...targetProcessed, serialNumber: displaced || '', qrToken: displaced ? displacedQrCandidates[0] || displaced : '', status: displaced ? 'QR Generated' : 'Not Generated', selectedForBatch: false, qrPasted: false, qcDone: false, sourceRemovedAt: undefined }
    snapshot = { sourceWorkflow, targetWorkflow, sourceMachine, targetMachine, targetRetiredCount: retired.length }
  }
  const displaced = snapshot.targetWorkflow.serialNumber
  for (const workflow of Object.values(store.orders)) for (const machine of Object.values(workflow.machines || {})) if (displaced && key(machine.serialNumber) === key(displaced) && !(workflow.salesOrderId === target.salesOrderId && machine.machineUnitId === row.targetMachineId)) throw new Error('Destination serial has another owner; undo aborted')
  const sourceRestored: MachineWorkflow = { ...snapshot.sourceWorkflow, zohoBackupStatus: 'pending', zohoBackupQueuedAt: at, zohoBackupSyncedAt: undefined, zohoBackupError: undefined, zohoBackupReplaceExisting: true, reallocatedToMachineId: undefined, reallocatedAt: undefined }
  const targetRestored: MachineWorkflow = { ...snapshot.targetWorkflow, zohoBackupStatus: displaced ? 'pending' : undefined, zohoBackupQueuedAt: displaced ? at : undefined, zohoBackupSyncedAt: undefined, zohoBackupError: undefined, zohoBackupReplaceExisting: Boolean(displaced), reallocatedFromMachineId: undefined, reallocatedAt: undefined, replacedSerialNumber: undefined, replacedSerialQrToken: undefined, replacedSerialVoidedAt: undefined }
  source.machines = { ...source.machines, [row.sourceMachineId]: sourceRestored }; target.machines = { ...target.machines, [row.targetMachineId]: targetRestored }
  source.processedOrder = updatedOrder(source.processedOrder, source.processedOrder, row.sourceMachineId, () => structuredClone(snapshot.sourceMachine))
  target.processedOrder = updatedOrder(target.processedOrder, target.processedOrder, row.targetMachineId, () => structuredClone(snapshot.targetMachine))
  target.processedOrder.retiredMachines = legacyRetiredIndex >= 0 ? (target.processedOrder.retiredMachines || []).filter((_, index) => index !== legacyRetiredIndex) : (target.processedOrder.retiredMachines || []).slice(0, snapshot.targetRetiredCount)
  source.status = deriveWorkflowStatus(source, source.processedOrder.machines.length); target.status = deriveWorkflowStatus(target, target.processedOrder.machines.length)
  const audit: ReallocationAudit = { at, actor: { id: actor.id, name: actor.name, email: actor.email }, action: 'undo_relocation', sourceOrderId: row.sourceOrderId, sourceSalesOrderNumber: row.sourceSalesOrderNumber, sourceMachineId: row.sourceMachineId, serialNumber: row.serialNumber, targetOrderId: row.targetOrderId, targetSalesOrderNumber: row.targetSalesOrderNumber, targetMachineId: row.targetMachineId, displacedDestinationSerial: displaced }
  const updated: ReallocationRow = { ...row, status: 'available', relocatedAt: undefined, targetOrderId: undefined, targetSalesOrderNumber: undefined, targetMachineId: undefined, relocationSnapshot: undefined, audit: [...row.audit, audit] }
  store.machineReallocation = { ...state, rows: { ...state.rows, [rowId]: updated }, audit: [...state.audit, audit] }
  return updated
}

async function snapshot() { return githubReadJson<ReallocationStore>(REALLOCATION_STORE_PATH, { orders: {} }) }
async function commit(store: ReallocationStore, sha: string | undefined, message: string) {
  const body: Record<string, string> = { message, content: Buffer.from(JSON.stringify(store, null, 2)).toString('base64') }; if (sha) body.sha = sha
  await githubRequest(`/contents/${REALLOCATION_STORE_PATH}`, { method: 'PUT', body: JSON.stringify(body) })
  markPublicDatabaseDirty()
}
async function mutate<T>(message: string, fn: (store: ReallocationStore) => T) {
  let failure: unknown
  for (let attempt = 0; attempt < 3; attempt++) { const current = await snapshot(); const result = fn(current.data); try { await commit(current.data, current.sha, message); return result } catch (error) { failure = error; if (!isGitHubWriteConflict(error) || attempt === 2) break; await new Promise(resolve => setTimeout(resolve, githubWriteRetryDelay(attempt))) } }
  throw failure instanceof Error ? failure : new Error('Reallocation persistence failed')
}

export async function getMachineReallocationView() {
  const current = await snapshot()
  const state = stateOf(current.data)
  return { rows: Object.values(state.rows).sort((a, b) => b.importedAt.localeCompare(a.importedAt)), importedOrders: state.importedOrders }
}
export async function searchReallocationDestinations(rowId: string, input: string) {
  const query = String(input || '').trim()
  if (!query) return [] as TargetOption[]
  const [current, synced, baseline] = await Promise.all([snapshot(), readSyncedOrdersStore(), githubReadJson<LifecycleBaselineStore>(LIFECYCLE_BASELINE_PATH, emptyBaseline)])
  const row = stateOf(current.data).rows[rowId]
  if (!row || row.status !== 'available') throw new Error('Reallocation row is no longer available')
  return searchTargetOptions(current.data, activeTargetOrders(synced, current.data, baseline.data.tombstones), row, query)
}
export async function searchCancelledSalesOrders(input: string) {
  const query = String(input || '').trim()
  if (!query) return [] as CancelledOrderSearchResult[]
  const [current, synced, baseline] = await Promise.all([snapshot(), readSyncedOrdersStore(), githubReadJson<LifecycleBaselineStore>(LIFECYCLE_BASELINE_PATH, emptyBaseline)])
  return searchHistoricalOrders(historicalOrders(synced, current.data), current.data, baseline.data.tombstones, query, new Set(synced.orderIds))
}
export async function importCancelledSalesOrders(orderIds: string[], actor: SafeUser) {
  const [synced, baseline] = await Promise.all([readSyncedOrdersStore(), githubReadJson<LifecycleBaselineStore>(LIFECYCLE_BASELINE_PATH, emptyBaseline)])
  await mutate(`Import ${orderIds.length} cancelled Sales Order(s) for machine reallocation`, store => importCancelledOrdersBatch(store, historicalOrders(synced, store), orderIds, baseline.data.tombstones, actor, new Date().toISOString()))
  return getMachineReallocationView()
}
export async function importCancelledSalesOrder(input: string, actor: SafeUser) {
  const [synced, baseline] = await Promise.all([readSyncedOrdersStore(), githubReadJson<LifecycleBaselineStore>(LIFECYCLE_BASELINE_PATH, emptyBaseline)])
  const query = key(input)
  await mutate(`Import ${String(input).trim()} for machine reallocation`, store => {
    const order = historicalOrders(synced, store).find(item => key(item.salesOrderNumber) === query || key(item.id) === query || key(item.zohoSalesOrderId) === query)
    if (!order) throw new Error('Sales Order was not found in local database/history')
    return importCancelledOrder(store, order, actor, new Date().toISOString())
  })
  return getMachineReallocationView()
}
export async function relocateQueuedMachine(rowId: string, targetOrderId: string, targetMachineId: string, actor: SafeUser) {
  const [synced, baseline] = await Promise.all([readSyncedOrdersStore(), githubReadJson<LifecycleBaselineStore>(LIFECYCLE_BASELINE_PATH, emptyBaseline)])
  await mutate(`Relocate queued machine ${rowId}`, store => {
    const orders = historicalOrders(synced, store)
    const activeIds = new Set(activeTargetOrders(synced, store, baseline.data.tombstones).map(order => order.id))
    return relocateMachine(store, orders, activeIds, rowId, targetOrderId, targetMachineId, actor, new Date().toISOString())
  })
  return getMachineReallocationView()
}

export async function cancelQueuedReallocation(rowId: string, actor: SafeUser) {
  await mutate(`Cancel queued machine ${rowId}`, store => cancelQueuedMachine(store, rowId, actor, new Date().toISOString()))
  return getMachineReallocationView()
}

export async function undoQueuedRelocation(rowId: string, actor: SafeUser) {
  await mutate(`Undo relocated machine ${rowId}`, store => undoRelocation(store, rowId, actor, new Date().toISOString()))
  return getMachineReallocationView()
}
