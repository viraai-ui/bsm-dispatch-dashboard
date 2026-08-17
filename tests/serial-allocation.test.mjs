import assert from 'node:assert/strict'

process.env.GITHUB_TOKEN = 'test-token'
process.env.GITHUB_OWNER = 'test-owner'
process.env.GITHUB_REPO = 'test-repo'

const { allocateSerialNumbersLegacy: allocateSerialNumbers, highestSerialCounter } = await import('../src/lib/workflow-store.ts')
const initial = 26270758

assert.equal(highestSerialCounter({ serialCounter: initial + 1, orders: { rolledBack: { machines: { unit: { serialNumber: String(initial + 9) } } } } }), initial + 9, 'stale counter must not reuse a serial after rollback')
assert.equal(highestSerialCounter({ serialCounter: initial + 11, orders: {} }), initial + 11, 'valid persisted counter remains authoritative')

let store = { serialCounter: initial + 20, orders: { seed: { salesOrderId: 'seed', salesOrderNumber: 'SO-SEED', status: 'open', machines: {} } } }
let shaVersion = 1
let conflicts = 0
let reads = 0
let writes = 0
const response = (status, data) => ({ ok: status >= 200 && status < 300, status, json: async () => data })
globalThis.fetch = async (_url, init = {}) => {
  const method = init.method || 'GET'
  if (method === 'GET') {
    reads += 1
    return response(200, { sha: `sha-${shaVersion}`, content: Buffer.from(JSON.stringify(store)).toString('base64') })
  }
  writes += 1
  await new Promise((resolve) => setTimeout(resolve, 5))
  const body = JSON.parse(init.body)
  if (body.sha !== `sha-${shaVersion}`) {
    conflicts += 1
    return response(409, { message: `sha does not match current sha-${shaVersion}` })
  }
  store = JSON.parse(Buffer.from(body.content, 'base64').toString('utf8'))
  shaVersion += 1
  return response(200, {})
}

const makeOrder = (id, machineIds) => ({ id, zohoSalesOrderId: id, salesOrderNumber: `SO-${id}`, status: 'open', customerName: 'Test', shippingAddress: '', salesperson: '', deliveryDate: '', dashboardStatus: 'Open', reviewRequired: false, lineItems: [], machines: machineIds.map((machineId, index) => ({ id: machineId, unitNumber: index + 1, serialNumber: '', qrToken: '', orderId: id, lineItemId: `line-${id}`, itemName: 'Machine', sku: '', customerName: 'Test', salesOrderNumber: `SO-${id}`, deliveryDate: '', status: 'Not Generated', selectedForBatch: false, woodenPacking: 'Not Required', qrPasted: false, qcDone: false, mediaPhotos: 0, mediaVideos: 0 })) })

const started = performance.now()
const [a, b] = await Promise.all([
  allocateSerialNumbers('A', ['A-1', 'A-2'], makeOrder('A', ['A-1', 'A-2'])),
  allocateSerialNumbers('B', ['B-1', 'B-2'], makeOrder('B', ['B-1', 'B-2'])),
])
const elapsed = performance.now() - started
const serials = [...Object.values(a), ...Object.values(b)].map(Number).sort((x, y) => x - y)
assert.deepEqual(serials, [initial + 21, initial + 22, initial + 23, initial + 24], 'concurrent allocations must be unique and gap-free')
assert.equal(new Set(serials).size, 4)
assert.equal(store.serialCounter, initial + 24)
assert.ok(conflicts >= 1, 'test must exercise optimistic-concurrency retry')
for (const allocation of [a, b]) {
  const values = Object.values(allocation).map(Number)
  assert.deepEqual(values, [...values].sort((x, y) => x - y), 'machine request order must remain monotonic')
}
const repeated = await allocateSerialNumbers('A', ['A-1', 'A-2'], makeOrder('A', ['A-1', 'A-2']))
assert.deepEqual(repeated, a, 'allocation must be idempotent after reload/retry')
assert.equal(store.serialCounter, initial + 24)
console.log(`Serial allocation tests passed: 10 assertions, ${reads} reads, ${writes} writes, ${conflicts} conflict retry, ${elapsed.toFixed(1)}ms mocked concurrency`)
