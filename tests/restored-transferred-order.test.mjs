import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { listSyncedOrdersFromSnapshots } from '../src/lib/synced-orders.ts'
import { deriveWorkflowStatus } from '../src/lib/workflow-store.ts'
import { isTransferredMachineWorkflow } from '../src/lib/machine-workflow-projection.ts'

const orderId = '1154219000035933004'
const machineId = `${orderId}-1154219000035933007-1`
const currentOrder = {
  id: orderId,
  zohoSalesOrderId: orderId,
  salesOrderNumber: 'SO-07789',
  status: 'open',
  customerName: 'OXFORD SHOES & SAFETY PRODUCTS',
  shippingAddress: '',
  salesperson: '',
  deliveryDate: '2026-08-21',
  dashboardStatus: 'Not Generated',
  reviewRequired: false,
  lineItems: [{ id: '1154219000035933007', itemName: 'Latex Glue Applicator', sku: '108 B', quantity: 1, pendingQuantity: 1, woodenPackingRequired: true, dispatchCategory: 'machine' }],
  machines: [{ id: machineId, unitNumber: 1, serialNumber: '', qrToken: '', orderId, lineItemId: '1154219000035933007', itemName: 'Latex Glue Applicator', sku: '108 B', customerName: 'OXFORD SHOES & SAFETY PRODUCTS', salesOrderNumber: 'SO-07789', deliveryDate: '2026-08-21', status: 'Not Generated', selectedForBatch: false, woodenPacking: 'Pending', qrPasted: false, qcDone: false, mediaPhotos: 0, mediaVideos: 0 }],
}
const transferredMachine = {
  machineUnitId: machineId,
  lineItemId: '1154219000035933007',
  serialNumber: '',
  qrToken: '',
  qrStatus: 'transferred',
  processedAt: '2026-08-21T11:21:39.394Z',
  dispatchedAt: '2026-08-22T09:33:44.799Z',
  transferDestinationOrderId: '1154219000036922008',
  transferDestinationSalesOrderNumber: 'SO-07950',
  transferredAt: '2026-09-16T10:44:27Z',
}
const restoredWorkflow = { salesOrderId: orderId, salesOrderNumber: 'SO-07789', status: 'open', processedOrder: currentOrder, machines: { [machineId]: transferredMachine } }

test('restored Oxford source slot ignores transferred lifecycle state while preserving audit history', () => {
  assert.equal(isTransferredMachineWorkflow(transferredMachine), true)
  assert.equal(deriveWorkflowStatus(restoredWorkflow, 1), 'open')
  const [projected] = listSyncedOrdersFromSnapshots({ orders: { [orderId]: currentOrder }, orderIds: [orderId], lastSuccessfulSyncAt: null }, { [orderId]: restoredWorkflow })
  assert.equal(projected.dashboardStatus, 'Not Generated')
  assert.equal(projected.machines[0].status, 'Not Generated')
  assert.equal(projected.machines[0].serialNumber, '')
  assert.equal(restoredWorkflow.machines[machineId].transferDestinationOrderId, '1154219000036922008')
  assert.equal(restoredWorkflow.machines[machineId].dispatchedAt, '2026-08-22T09:33:44.799Z')
})

test('client merge also leaves transferred source slots fresh and selectable', async () => {
  const source = await readFile(new URL('../src/components/OrdersClient.tsx', import.meta.url), 'utf8')
  assert.match(source, /if \(isTransferredMachineWorkflow\(saved\)\) return machine/)
  assert.match(source, /if \(saved\?\.qrCode && !isTransferredMachineWorkflow\(saved\)\) codes\[machine\.id\] = saved\.qrCode/)
})

test('new generation retains the historical transfer destination audit', async () => {
  const source = await readFile(new URL('../src/app/api/workflow/orders/[id]/route.ts', import.meta.url), 'utf8')
  assert.match(source, /transferDestinationOrderId: existing\?\.transferDestinationOrderId/)
  assert.match(source, /transferDestinationSalesOrderNumber: existing\?\.transferDestinationSalesOrderNumber/)
  assert.match(source, /transferredAt: existing\?\.transferredAt/)
})

test('bundled SO-07789 workflow is open and retains transfer audit ownership', async () => {
  const store = JSON.parse(await readFile(new URL('../data/workflow-store.json', import.meta.url), 'utf8'))
  const workflow = store.orders[orderId]
  const machine = workflow.machines[machineId]
  assert.equal(workflow.status, 'open')
  assert.equal(machine.qrStatus, 'transferred')
  assert.equal(machine.transferDestinationOrderId, '1154219000036922008')
  assert.equal(machine.transferDestinationSalesOrderNumber, 'SO-07950')
  assert.ok(machine.dispatchedAt)
  assert.ok(machine.transferredAt)
})
