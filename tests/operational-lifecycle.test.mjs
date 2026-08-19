import test from 'node:test'
import assert from 'node:assert/strict'
import { projectOperationalOrders, isLocallyTerminal } from '../src/lib/operational-orders.ts'

const order = (id, status = 'confirmed') => ({ id, status, salesOrderNumber: id, customerName: id, lineItems: [], machines: [] })
const workflow = (id, snapshot = order(id)) => ({ salesOrderId: id, salesOrderNumber: id, status: 'processed', processedAt: '2026-01-01T00:00:00Z', processedOrder: snapshot, machines: {} })

const project = ({ synced = [], workflows = {}, completed = {}, packingRecords = {}, loadingRecords = {}, shipments = {}, tombstones = {} } = {}) => projectOperationalOrders({ syncedOrders: synced, workflows, completed, packingRecords, loadingRecords, shipments, tombstones })
const tombstone = (id, stageAtCutover = 'processed') => ({ orderId: id, salesOrderNumber: id, reason: 'baseline_pre_cutover_zoho_closed_or_omitted', stageAtCutover, tombstonedAt: '2026-08-19T00:00:00Z', cutoverVersion: 'lifecycle-baseline-v1', cutoverDate: '2026-08-19' })

test('unprocessed closed and omitted orders disappear', () => {
  assert.deepEqual(project({ synced: [order('closed', 'closed')] }).orders, [])
  assert.deepEqual(project().orders, [])
})

test('processed closed and Zoho-omitted orders survive from durable snapshots without duplicates', () => {
  const closed = order('closed', 'closed')
  const omitted = order('omitted')
  const result = project({ synced: [closed], workflows: { closed: workflow('closed'), omitted: workflow('omitted', omitted) } })
  assert.deepEqual(result.orders.map((item) => item.id).sort(), ['closed', 'omitted'])
  assert.equal(new Set(result.orders.map((item) => item.id)).size, result.orders.length)
})

test('baseline-old closed/omitted is hidden without deleting durable data', () => {
  const saved = order('legacy')
  const workflows = { legacy: workflow('legacy', saved) }
  const completed = { legacy: { completedAt: 'x', order: saved } }
  const packingRecords = { legacy: { submittedAt: 'x', evidence: 'preserved' } }
  const result = project({ workflows, completed, packingRecords, tombstones: { legacy: tombstone('legacy', 'ready_to_ship') } })
  assert.equal(result.byId.legacy, undefined)
  assert.equal(workflows.legacy.processedOrder.id, 'legacy')
  assert.equal(completed.legacy.order.id, 'legacy')
  assert.equal(packingRecords.legacy.evidence, 'preserved')
})

test('future processed then closed remains, while active current remains unaffected', () => {
  const result = project({ synced: [order('future', 'closed'), order('current')], workflows: { future: workflow('future') } })
  assert.deepEqual(result.orders.map(x => x.id).sort(), ['current', 'future'])
})

test('baseline tombstone has precedence over active Zoho and no-LR local state', () => {
  const saved = order('precedence')
  const result = project({ synced: [saved], workflows: { precedence: workflow('precedence', saved) }, shipments: { precedence: { shipmentType: 'transporter', shippedAt: 'x', lrCopy: null } }, tombstones: { precedence: tombstone('precedence', 'builty_needed') } })
  assert.equal(result.byId.precedence, undefined)
})

test('packaging completion advances order and removes it from dispatch projection', () => {
  const saved = order('packed')
  const result = project({ workflows: { packed: workflow('packed', saved) }, completed: { packed: { completedAt: '2026-01-02', order: saved } } })
  assert.equal(result.byId.packed.stage, 'loading_video')
  assert.equal(result.byId.packed.showInDispatch, false)
  assert.equal(result.byId.packed.showInPackingVideo, false)
  assert.equal(result.byId.packed.showInLoadingVideo, true)
})

test('packing and loading submissions enforce stage gates', () => {
  const saved = order('gated')
  const base = { workflows: { gated: workflow('gated', saved) }, completed: { gated: { completedAt: '2026-01-02', order: saved } } }
  let result = project(base)
  assert.equal(result.byId.gated.showInReadyToShip, false)
  result = project({ ...base, packingRecords: { gated: { submittedAt: '2026-01-03' } } })
  assert.equal(result.byId.gated.showInReadyToShip, true)
  assert.equal(result.byId.gated.showInLoadingVideo, true)
  result = project({ ...base, packingRecords: { gated: { submittedAt: '2026-01-03' } }, loadingRecords: { gated: { submittedAt: '2026-01-04' } } })
  assert.equal(result.byId.gated.stage, 'ready_to_ship')
})

test('direct/LR shipment is terminal while transporter without LR remains Builty Needed', () => {
  assert.equal(isLocallyTerminal({ shipmentType: 'direct', shippedAt: '2026-01-05' }), true)
  assert.equal(isLocallyTerminal({ shipmentType: 'transporter', shippedAt: '2026-01-05', lrCopy: null }), false)
  assert.equal(isLocallyTerminal({ shipmentType: 'transporter', shippedAt: '2026-01-05', lrCopy: { url: 'lr' } }), true)
  const saved = order('builty')
  const result = project({ workflows: { builty: workflow('builty', saved) }, completed: { builty: { completedAt: 'x', order: saved } }, packingRecords: { builty: { submittedAt: 'x' } }, loadingRecords: { builty: { submittedAt: 'x' } }, shipments: { builty: { shipmentType: 'transporter', shippedAt: 'x', lrCopy: null } } })
  assert.equal(result.byId.builty.stage, 'builty_needed')
  assert.equal(result.byId.builty.showInReadyToShip, true)
})
