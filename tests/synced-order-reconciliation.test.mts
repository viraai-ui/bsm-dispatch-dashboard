import test from 'node:test'
import assert from 'node:assert/strict'
import { reconcileConfirmedOrderSnapshots } from '../src/lib/synced-order-reconciliation.ts'

const machine = (id: string, orderId: string, serialNumber = '') => ({
  id, unitNumber: 1, serialNumber, qrToken: serialNumber ? `qr-${serialNumber}` : '', orderId,
  lineItemId: 'line-1', itemName: 'Machine', sku: 'M-1', customerName: 'Customer',
  salesOrderNumber: 'SO-001', deliveryDate: '2026-09-01', status: serialNumber ? 'Processed' : 'Not Generated',
  selectedForBatch: Boolean(serialNumber), woodenPacking: serialNumber ? 'Completed' : 'Pending', qrPasted: Boolean(serialNumber), qcDone: Boolean(serialNumber), mediaPhotos: serialNumber ? 2 : 0, mediaVideos: serialNumber ? 1 : 0,
}) as const

const order = (id: string, number = 'SO-001', serial = '') => ({
  id, zohoSalesOrderId: id, salesOrderNumber: number, status: 'open', customerName: 'Customer',
  deliveryDate: '2026-09-01', dashboardStatus: serial ? 'Processed' : 'Not Generated', reviewRequired: false,
  lineItems: [{ id: 'line-1', itemName: 'Machine', sku: 'M-1', quantity: 1, pendingQuantity: 1, woodenPackingRequired: true, zohoItemId: 'item-1' }],
  machines: [machine(`${id}-unit-1`, id, serial)],
}) as any

test('migrates manual workflow and packaging identity to authoritative Zoho order without losing history', () => {
  const manual = order('manual-so-001', ' so 001 ', '26270001')
  manual.lineItems[0] = { ...manual.lineItems[0], id: 'manual-line-8036', itemName: '103 Big', sku: '', zohoItemId: undefined, rate: 125000 }
  manual.machines[0] = { ...manual.machines[0], id: 'manual-so-001-manual-line-8036-1', lineItemId: 'manual-line-8036', itemName: '103 Big', sku: '', mediaPhotos: 4, dispatchNote: 'history survives' }
  const remote = order('zoho-9001', 'SO-001')
  remote.lineItems[0] = { ...remote.lineItems[0], id: '1154219000000999999', itemName: '103 Big', sku: '103 Big', zohoItemId: '1154219000000280682', rate: 125000 }
  remote.machines[0] = { ...remote.machines[0], id: 'zoho-9001-1154219000000999999-1', lineItemId: '1154219000000999999', itemName: '103 Big', sku: '103 Big' }
  remote.customerName = 'Authoritative customer'
  const workflow = {
    salesOrderId: manual.id, salesOrderNumber: manual.salesOrderNumber, status: 'processed',
    processedAt: '2026-08-01T10:00:00Z', dispatchPriority: 'urgent', dispatchSortOrder: 3,
    processedOrder: manual,
    machines: { [manual.machines[0].id]: { machineUnitId: manual.machines[0].id, lineItemId: 'manual-line-8036', serialNumber: '26270001', qrToken: 'qr-26270001', qrStatus: 'generated', qrGeneratedAt: '2026-08-01T09:00:00Z', processedAt: '2026-08-01T10:00:00Z' } },
  } as any
  const completed = { completedAt: '2026-08-02T10:00:00Z', order: manual, machineIds: [manual.machines[0].id] }

  const result = reconcileConfirmedOrderSnapshots({
    previous: { orders: {}, orderIds: [] }, fetched: [remote],
    workflowStore: { orders: { [manual.id]: workflow }, serialCounter: 26270001 },
    completedStore: { completed: { [manual.id]: completed } }, now: '2026-09-01T00:00:00Z',
  })

  assert.deepEqual(result.orderIds, ['zoho-9001'])
  assert.equal(result.orders['zoho-9001'].customerName, 'Authoritative customer')
  assert.equal(result.orders['zoho-9001'].machines[0].serialNumber, '26270001')
  assert.equal(result.orders['zoho-9001'].machines[0].qrToken, 'qr-26270001')
  assert.equal(result.orders['zoho-9001'].machines[0].woodenPacking, 'Completed')
  assert.equal(result.orders['zoho-9001'].machines[0].orderId, 'zoho-9001')
  assert.equal(result.orders['zoho-9001'].machines[0].id, remote.machines[0].id)
  assert.equal(result.orders['zoho-9001'].machines[0].lineItemId, remote.lineItems[0].id)
  assert.equal(result.orders['zoho-9001'].machines[0].sku, '103 Big')
  assert.equal(result.orders['zoho-9001'].machines[0].mediaPhotos, 4)
  assert.equal(result.orders['zoho-9001'].machines[0].dispatchNote, 'history survives')
  assert.equal(result.workflowStore.orders['manual-so-001'], undefined)
  assert.equal(result.workflowStore.orders['zoho-9001'].dispatchPriority, 'urgent')
  assert.equal(result.workflowStore.orders['zoho-9001'].processedAt, '2026-08-01T10:00:00Z')
  assert.equal(result.workflowStore.orders['zoho-9001'].processedOrder?.machines[0].serialNumber, '26270001')
  assert.equal(result.completedStore.completed['manual-so-001'], undefined)
  assert.equal(result.completedStore.completed['zoho-9001'].completedAt, '2026-08-02T10:00:00Z')
  assert.deepEqual(result.completedStore.completed['zoho-9001'].machineIds, [remote.machines[0].id])
  assert.equal(result.workflowStore.orders['zoho-9001'].machines[remote.machines[0].id].machineUnitId, remote.machines[0].id)
  assert.equal(result.workflowStore.orders['zoho-9001'].machines[remote.machines[0].id].lineItemId, remote.lineItems[0].id)
  assert.equal(JSON.stringify(result).includes('manual-so-001'), false)
  assert.equal(JSON.stringify(result).includes('manual-line-8036'), false)
})

test('preserves absent authoritative snapshots carrying serials or durable workflows', () => {
  const serialOrder = order('zoho-closed', 'SO-002', '26270002')
  const workflowOrder = order('zoho-processed', 'SO-003')
  const stale = order('zoho-unprocessed', 'SO-004')
  const current = order('zoho-current', 'SO-005')
  const result = reconcileConfirmedOrderSnapshots({
    previous: { orders: { [serialOrder.id]: serialOrder, [workflowOrder.id]: workflowOrder, [stale.id]: stale }, orderIds: [serialOrder.id, workflowOrder.id, stale.id] },
    fetched: [current],
    workflowStore: { orders: { [workflowOrder.id]: { salesOrderId: workflowOrder.id, salesOrderNumber: workflowOrder.salesOrderNumber, status: 'processed', processedAt: '2026-08-01', processedOrder: workflowOrder, machines: {} } } },
    completedStore: { completed: {} },
  })
  assert.deepEqual(result.orderIds, ['zoho-current', 'zoho-closed', 'zoho-processed'])
  assert.equal(result.orders['zoho-closed'].machines[0].serialNumber, '26270002')
  assert.equal(result.orders['zoho-unprocessed'], undefined)
})

test('rejects ambiguous manual identities and duplicate fetched SO numbers', () => {
  const a = order('manual-so-a', 'SO 77')
  const b = order('manual-so-b', 'so-77')
  const remote = order('zoho-77', 'SO-77')
  const base = { workflowStore: { orders: {} }, completedStore: { completed: {} } }
  assert.throws(() => reconcileConfirmedOrderSnapshots({ ...base, previous: { orders: { [a.id]: a, [b.id]: b }, orderIds: [a.id, b.id] }, fetched: [remote] }), /Ambiguous manual sales order number/)
  assert.throws(() => reconcileConfirmedOrderSnapshots({ ...base, previous: { orders: {}, orderIds: [] }, fetched: [remote, order('zoho-78', ' so 77 ')] }), /duplicate sales order number/)
})