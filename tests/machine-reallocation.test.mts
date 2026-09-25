import test from 'node:test'
import assert from 'node:assert/strict'
import { activeTargetOrders, cancelQueuedMachine, historicalOrders, importCancelledOrder, importCancelledOrdersBatch, relocateMachine, searchHistoricalOrders, searchTargetOptions, targetOptions, undoRelocation, type ReallocationStore } from '../src/lib/machine-reallocation.ts'
import type { SyncedOrdersStore } from '../src/lib/synced-orders.ts'
import type { Order, MachineUnit } from '../src/types/domain.ts'

const actor = { id: 'u1', name: 'Operator', email: 'ops@example.com', username: 'ops', role: 'Operations' as const, active: true, createdAt: '', updatedAt: '' }
const machine = (id: string, orderId: string, serial = '', sku = 'MODEL-A', status: MachineUnit['status'] = serial ? 'QR Generated' : 'Not Generated'): MachineUnit => ({ id, unitNumber: 1, serialNumber: serial, qrToken: serial ? `qr-${serial}` : '', orderId, lineItemId: `line-${orderId}`, itemName: 'Bag Maker 500', sku, customerName: orderId, salesOrderNumber: orderId, deliveryDate: '', status, selectedForBatch: false, woodenPacking: 'Not Required', qrPasted: false, qcDone: false, mediaPhotos: 0, mediaVideos: 0, itemDescription: '220V / 50Hz' })
const order = (id: string, machines: MachineUnit[]): Order => ({ id, zohoSalesOrderId: `z-${id}`, salesOrderNumber: id, status: 'open', customerName: `Customer ${id}`, deliveryDate: '', dashboardStatus: 'Not Generated', reviewRequired: false, lineItems: [{ id: `line-${id}`, itemName: 'Bag Maker 500', sku: 'MODEL-A', quantity: machines.length, pendingQuantity: machines.length, woodenPackingRequired: false }], machines })
const setup = () => { const source = order('SO-CANCELLED', [machine('s1', 'SO-CANCELLED', '26279999'), machine('s2', 'SO-CANCELLED', '26280000')]); const target = order('SO-ACTIVE', [machine('t1', 'SO-ACTIVE'), machine('t2', 'SO-ACTIVE')]); return { store: { orders: {} } as ReallocationStore, source, target } }
const active = (target: Order) => new Set([target.id])

test('imports only generated serial-bearing units with original metadata and audit', () => { const { store, source } = setup(); source.machines.push(machine('empty', source.id)); const state = importCancelledOrder(store, source, actor, '2026-01-01T00:00:00Z'); assert.equal(Object.keys(state.rows).length, 2); assert.equal(state.rows['SO-CANCELLED:s1'].sourceCustomerName, 'Customer SO-CANCELLED'); assert.equal(state.rows['SO-CANCELLED:s1'].itemDescription, '220V / 50Hz'); assert.equal(state.audit[0].action, 'imported') })
test('rejects duplicate imports while retaining historically dispatched source units', () => { const a = setup(); importCancelledOrder(a.store, a.source, actor, 'now'); assert.throws(() => importCancelledOrder(a.store, a.source, actor, 'later'), /already been imported/); const b = setup(); b.source.machines[0].status = 'Dispatched'; const state = importCancelledOrder(b.store, b.source, actor, 'now'); assert.deepEqual(Object.values(state.rows).map(row => row.sourceMachineId), ['s1', 's2']) })
test('offers compatible active machine slots, including generated destinations, only after a customer or SO search', () => { const { store, source, target } = setup(); importCancelledOrder(store, source, actor, 'now'); target.customerName = 'Acme Films'; target.machines.push(machine('wrong', target.id, '', 'MODEL-B')); target.machines.push(machine('used', target.id, '123')); const row = store.machineReallocation!.rows['SO-CANCELLED:s1']; const options = targetOptions(store, [source, target], row); assert.deepEqual(options.map(x => x.machineId), ['t1', 't2', 'used']); assert.deepEqual(searchTargetOptions(store, [target], row, '').map(x => x.machineId), []); assert.deepEqual(searchTargetOptions(store, [target], row, 'acme').map(x => x.machineId), ['t1', 't2', 'used']); assert.equal(searchTargetOptions(store, [target], row, 'SO-ACTIVE')[2].currentSerialNumber, '123') })
test('atomically moves existing serial and exact QR token, keeps source history, and supports partial rows', () => { const { store, source, target } = setup(); importCancelledOrder(store, source, actor, 'now'); const moved = relocateMachine(store, [source, target], active(target), 'SO-CANCELLED:s1', target.id, 't1', actor, 'later'); assert.equal(moved.status, 'relocated'); assert.equal(store.orders[target.id].machines.t1.serialNumber, '26279999'); assert.equal(store.orders[target.id].machines.t1.qrToken, 'qr-26279999'); assert.equal(store.orders[target.id].machines.t1.zohoBackupStatus, 'pending'); assert.equal(store.orders[source.id].machines.s1.serialNumber, undefined); assert.equal(store.orders[source.id].machines.s1.qrToken, undefined); assert.equal(store.orders[source.id].processedOrder!.machines[0].sourceRemovedAt, 'later'); assert.equal(store.machineReallocation!.rows['SO-CANCELLED:s2'].status, 'available'); assert.equal(store.machineReallocation!.audit.at(-1)?.targetSalesOrderNumber, 'SO-ACTIVE') })
test('replaces a workflow-generated destination serial and QR while retaining its void history', () => {
  const { store, source, target } = setup()
  store.orders[target.id] = {
    salesOrderId: target.id,
    salesOrderNumber: target.salesOrderNumber,
    status: 'partially_generated',
    processedOrder: target,
    machines: { t1: { machineUnitId: 't1', lineItemId: target.machines[0].lineItemId, serialNumber: 'destination-serial', qrToken: 'destination-token', qrCode: 'destination-image', qrStatus: 'generated', qrGeneratedAt: 'before' } },
  }
  importCancelledOrder(store, source, actor, 'imported')
  const row = store.machineReallocation!.rows['SO-CANCELLED:s1']
  assert.equal(searchTargetOptions(store, [target], row, target.salesOrderNumber)[0].currentSerialNumber, 'destination-serial')

  relocateMachine(store, [source, target], active(target), row.id, target.id, 't1', actor, 'relocated')

  const destination = store.orders[target.id].machines.t1
  assert.equal(destination.serialNumber, row.serialNumber)
  assert.equal(destination.qrToken, row.qrToken)
  assert.equal(destination.qrCode, undefined)
  assert.equal(destination.replacedSerialNumber, 'destination-serial')
  assert.equal(destination.replacedSerialQrToken, 'destination-token')
  assert.equal(destination.replacedSerialVoidedAt, 'relocated')
  assert.deepEqual(store.orders[target.id].processedOrder!.retiredMachines?.map(machine => [machine.serialNumber, machine.qrToken, machine.sourceRemovedAt]), [['destination-serial', 'destination-token', 'relocated']])
  assert.equal(store.machineReallocation!.audit.at(-1)?.actor.email, actor.email)
})
test('guards replay, inactive target, wrong model, full target, and dispatched target without mutating ownership', () => { const a = setup(); importCancelledOrder(a.store, a.source, actor, 'now'); relocateMachine(a.store, [a.source, a.target], active(a.target), 'SO-CANCELLED:s1', a.target.id, 't1', actor, 'later'); assert.throws(() => relocateMachine(a.store, [a.source, a.target], active(a.target), 'SO-CANCELLED:s1', a.target.id, 't2', actor, 'again'), /already/); const inactive = setup(); importCancelledOrder(inactive.store, inactive.source, actor, 'now'); assert.throws(() => relocateMachine(inactive.store, [inactive.source, inactive.target], new Set(), 'SO-CANCELLED:s1', inactive.target.id, 't1', actor, 'later'), /no longer active/); assert.equal(inactive.store.orders[inactive.target.id], undefined); const b = setup(); importCancelledOrder(b.store, b.source, actor, 'now'); b.target.machines[0].sku = 'WRONG'; assert.throws(() => relocateMachine(b.store, [b.source, b.target], active(b.target), 'SO-CANCELLED:s1', b.target.id, 't1', actor, 'later'), /not compatible/); assert.equal(b.store.orders[b.target.id], undefined); const c = setup(); importCancelledOrder(c.store, c.source, actor, 'now'); c.target.machines[0].serialNumber = 'occupied'; c.target.machines[0].qrToken = 'qr-occupied'; relocateMachine(c.store, [c.source, c.target], active(c.target), 'SO-CANCELLED:s1', c.target.id, 't1', actor, 'later'); assert.equal(c.store.orders[c.target.id].machines.t1.serialNumber, '26279999'); assert.equal(c.store.orders[c.target.id].machines.t1.replacedSerialNumber, 'occupied'); assert.equal(c.store.orders[c.target.id].machines.t1.replacedSerialVoidedAt, 'later'); assert.equal(c.store.orders[c.target.id].processedOrder!.retiredMachines?.[0].serialNumber, 'occupied'); assert.equal(c.store.machineReallocation!.audit.at(-1)?.displacedDestinationSerial, 'occupied'); assert.equal(c.store.machineReallocation!.audit.at(-1)?.displacedDestinationSerialVoidedAt, 'later'); const d = setup(); importCancelledOrder(d.store, d.source, actor, 'now'); d.target.machines[0].status = 'Dispatched'; assert.throws(() => relocateMachine(d.store, [d.source, d.target], active(d.target), 'SO-CANCELLED:s1', d.target.id, 't1', actor, 'later'), /locked/) })

test('finds Zoho-deleted source in workflow history and does not duplicate order arrays', () => { const { store, source, target } = setup(); store.orders[source.id] = { salesOrderId: source.id, salesOrderNumber: source.salesOrderNumber, status: 'qr_generated', processedOrder: source, machines: { s1: { machineUnitId: 's1', lineItemId: source.machines[0].lineItemId, serialNumber: '26279999', qrToken: 'token-original', qrStatus: 'generated' }, s2: { machineUnitId: 's2', lineItemId: source.machines[1].lineItemId, serialNumber: '26280000', qrToken: 'qr-26280000', qrStatus: 'generated' } } }; const synced: SyncedOrdersStore = { orders: { [target.id]: target }, orderIds: [target.id], lastSuccessfulSyncAt: null }; const history = historicalOrders(synced, store); assert.deepEqual(history.map(item => item.id).sort(), [source.id, target.id].sort()); importCancelledOrder(store, history.find(item => item.id === source.id)!, actor, 'now'); relocateMachine(store, [history.find(item => item.id === source.id)!, target], active(target), 'SO-CANCELLED:s1', target.id, 't1', actor, 'later'); assert.equal(store.orders[target.id].machines.t1.qrToken, 'token-original'); assert.equal(store.orders[source.id].processedOrder!.machines.length, 2); assert.equal(store.orders[target.id].processedOrder!.machines.length, 2) })

test('active target projection excludes closed and tombstoned orders', () => { const { store, target } = setup(); const closed = order('SO-CLOSED', [machine('c1', 'SO-CLOSED')]); (closed as any).status = 'closed'; const tombstoned = order('SO-TOMBSTONED', [machine('x1', 'SO-TOMBSTONED')]); const synced: SyncedOrdersStore = { orders: { [target.id]: target, [closed.id]: closed, [tombstoned.id]: tombstoned }, orderIds: [target.id, closed.id, tombstoned.id], lastSuccessfulSyncAt: null }; const projected = activeTargetOrders(synced, store, { [tombstoned.id]: { orderId: tombstoned.id, salesOrderNumber: tombstoned.salesOrderNumber, reason: 'cancelled_from_dashboard', stageAtCutover: 'open', tombstonedAt: 'now', cutoverVersion: 'v', cutoverDate: '2026-01-01' } }); assert.deepEqual(projected.map(item => item.id), [target.id]) })

test('rejects duplicate serial ownership present only in order snapshots', () => { const { store, source, target } = setup(); importCancelledOrder(store, source, actor, 'now'); const other = order('SO-OTHER', [machine('o1', 'SO-OTHER', '26279999')]); assert.throws(() => relocateMachine(store, [source, target, other], active(target), 'SO-CANCELLED:s1', target.id, 't1', actor, 'later'), /another owner/); assert.equal(store.orders[target.id], undefined) })

test('searches partial customer and SO across current and deleted history with eligibility metadata', () => {
  const { store, source, target } = setup(); source.customerName = 'Acme Historical Industries'; target.customerName = 'Acme Active'
  const tombstones = { [source.id]: { orderId: source.id, salesOrderNumber: source.salesOrderNumber, reason: 'cancelled_from_dashboard' as const, stageAtCutover: 'open' as const, tombstonedAt: 'now', cutoverVersion: 'v', cutoverDate: '2026-01-01' } }
  const byCustomer = searchHistoricalOrders([source, target], store, tombstones, 'historical', new Set([target.id]))
  assert.equal(byCustomer[0].historical, true); assert.equal(byCustomer[0].eligibleMachineCount, 2); assert.equal(byCustomer[0].eligible, true)
  const bySo = searchHistoricalOrders([source], store, {}, 'historical', new Set([source.id]))
  assert.equal(bySo[0].eligible, true); assert.equal(bySo[0].eligibleMachineCount, 2); assert.equal(bySo[0].ineligibilityReason, undefined)
})

test('batch import is all-or-nothing for multiple orders and duplicates while allowing active sources', () => {
  const { store, source } = setup(); const second = order('SO-CANCELLED-2', [machine('s3', 'SO-CANCELLED-2', '26280001')])
  const tombstones = Object.fromEntries([source, second].map(item => [item.id, { orderId: item.id, salesOrderNumber: item.salesOrderNumber, reason: 'cancelled_from_dashboard' as const, stageAtCutover: 'open' as const, tombstonedAt: 'now', cutoverVersion: 'v', cutoverDate: '2026-01-01' }]))
  const state = importCancelledOrdersBatch(store, [source, second], [source.id, second.id], tombstones, actor, 'now')
  assert.equal(Object.keys(state.rows).length, 3)
  const duplicateStore = { orders: {} } as ReallocationStore; importCancelledOrder(duplicateStore, source, actor, 'before')
  assert.throws(() => importCancelledOrdersBatch(duplicateStore, [source, second], [second.id, source.id], tombstones, actor, 'now'), /already been imported/)
  assert.equal(duplicateStore.machineReallocation!.importedOrders[second.id], undefined)
  const activeStore = { orders: {} } as ReallocationStore
  const activeState = importCancelledOrdersBatch(activeStore, [source, second], [source.id, second.id], {}, actor, 'now')
  assert.equal(Object.keys(activeState.rows).length, 3)
})

test('processed and historically dispatched source machines remain reallocatable', () => {
  const { store, source } = setup()
  source.machines[0].status = 'Processed'
  source.machines[1].status = 'Dispatched'
  const results = searchHistoricalOrders([source], store, {}, 'cancelled')
  assert.equal(results[0].eligibleMachineCount, 2)
  const state = importCancelledOrder(store, source, actor, 'now')
  assert.deepEqual(Object.values(state.rows).map(row => row.sourceMachineId), ['s1', 's2'])
})

test('cancel is atomic and removing the whole imported order allows re-import', () => {
  const { store, source } = setup(); importCancelledOrder(store, source, actor, 'import')
  cancelQueuedMachine(store, `${source.id}:s1`, actor, 'cancel-1')
  assert.ok(store.machineReallocation!.importedOrders[source.id])
  cancelQueuedMachine(store, `${source.id}:s2`, actor, 'cancel-2')
  assert.equal(store.machineReallocation!.importedOrders[source.id], undefined)
  assert.equal(store.machineReallocation!.audit.at(-1)?.action, 'cancelled')
  assert.equal(Object.keys(importCancelledOrder(store, source, actor, 'again').rows).length, 2)
})

test('undo restores source and an empty destination and queues authoritative Sheet replacement', () => {
  const { store, source, target } = setup(); importCancelledOrder(store, source, actor, 'import')
  relocateMachine(store, [source, target], active(target), `${source.id}:s1`, target.id, 't1', actor, 'move')
  const row = undoRelocation(store, `${source.id}:s1`, actor, 'undo')
  assert.equal(row.status, 'available'); assert.equal(store.orders[source.id].machines.s1.serialNumber, '26279999')
  assert.equal(store.orders[source.id].machines.s1.qrToken, 'qr-26279999'); assert.equal(store.orders[source.id].machines.s1.zohoBackupStatus, 'pending')
  assert.equal(store.orders[source.id].machines.s1.zohoBackupReplaceExisting, true)
  assert.equal(store.orders[target.id].machines.t1.serialNumber, undefined); assert.equal(store.orders[target.id].processedOrder!.machines[0].serialNumber, '')
  assert.equal(store.machineReallocation!.audit.at(-1)?.action, 'undo_relocation')
  assert.throws(() => undoRelocation(store, row.id, actor, 'replay'), /already undone/)
})

test('undo restores displaced destination ownership and rejects duplicate restored ownership', () => {
  const { store, source, target } = setup(); target.machines[0] = machine('t1', target.id, 'OLD')
  importCancelledOrder(store, source, actor, 'import'); relocateMachine(store, [source, target], active(target), `${source.id}:s1`, target.id, 't1', actor, 'move')
  undoRelocation(store, `${source.id}:s1`, actor, 'undo')
  assert.equal(store.orders[target.id].machines.t1.serialNumber, 'OLD'); assert.equal(store.orders[target.id].machines.t1.qrToken, 'qr-OLD')
  assert.equal(store.orders[target.id].machines.t1.zohoBackupStatus, 'pending'); assert.equal(store.orders[target.id].processedOrder!.retiredMachines?.length, 0)
  const duplicate = setup(); duplicate.target.machines[0] = machine('t1', duplicate.target.id, 'OLD'); importCancelledOrder(duplicate.store, duplicate.source, actor, 'i'); relocateMachine(duplicate.store, [duplicate.source, duplicate.target], active(duplicate.target), `${duplicate.source.id}:s1`, duplicate.target.id, 't1', actor, 'm')
  duplicate.store.orders.OTHER = { salesOrderId: 'OTHER', salesOrderNumber: 'OTHER', status: 'open', machines: { x: { machineUnitId: 'x', lineItemId: 'x', serialNumber: 'OLD', qrStatus: 'generated' } } }
  assert.throws(() => undoRelocation(duplicate.store, `${duplicate.source.id}:s1`, actor, 'u'), /another owner/)
  assert.equal(duplicate.store.orders[duplicate.target.id].machines.t1.serialNumber, '26279999')
})

test('undo reconstructs legacy SO-07864 relocation of 26271099 and restores displaced 26271282', () => {
  const source = order('SO-07864', [machine('source-machine', 'SO-07864', '26271099')])
  const target = order('SO-07987', [machine('target-machine', 'SO-07987', '26271282')])
  const store = { orders: {} } as ReallocationStore
  importCancelledOrder(store, source, actor, '2026-05-01T00:00:00Z')
  const rowId = 'SO-07864:source-machine'
  relocateMachine(store, [source, target], active(target), rowId, target.id, 'target-machine', actor, '2026-05-02T00:00:00Z')
  delete store.machineReallocation!.rows[rowId].relocationSnapshot

  const restored = undoRelocation(store, rowId, actor, '2026-05-03T00:00:00Z')

  assert.equal(restored.status, 'available')
  assert.equal(store.orders[source.id].machines['source-machine'].serialNumber, '26271099')
  assert.equal(store.orders[source.id].machines['source-machine'].qrToken, 'qr-26271099')
  assert.equal(store.orders[source.id].machines['source-machine'].reallocatedToMachineId, undefined)
  assert.equal(store.orders[source.id].machines['source-machine'].zohoBackupStatus, 'pending')
  assert.equal(store.orders[target.id].machines['target-machine'].serialNumber, '26271282')
  assert.equal(store.orders[target.id].machines['target-machine'].qrToken, 'qr-26271282')
  assert.equal(store.orders[target.id].machines['target-machine'].reallocatedFromMachineId, undefined)
  assert.equal(store.orders[target.id].machines['target-machine'].replacedSerialNumber, undefined)
  assert.equal(store.orders[target.id].machines['target-machine'].zohoBackupStatus, 'pending')
  assert.equal(store.orders[target.id].processedOrder!.retiredMachines?.length, 0)
  assert.throws(() => undoRelocation(store, rowId, actor, 'replay'), /already undone/)
})
