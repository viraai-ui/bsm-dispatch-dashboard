import test from 'node:test'
import assert from 'node:assert/strict'
import boundary from '../scripts/lifecycle-baseline-boundary.cjs'

const { boundaryInstant, lifecycleEnteredAt, isPreBoundaryLifecycle } = boundary
const DATE = '2026-08-19'

test('IST lifecycle boundary is exactly start of 2026-08-19', () => {
  assert.equal(boundaryInstant(DATE).toISOString(), '2026-08-18T18:30:00.000Z')
  assert.equal(isPreBoundaryLifecycle({ processedAt: '2026-08-18T18:29:59.999Z' }, null, DATE), true)
  assert.equal(isPreBoundaryLifecycle({ processedAt: '2026-08-18T18:30:00.000Z' }, null, DATE), false)
})

test('uses authoritative earliest local workflow processing timestamp', () => {
  const workflow = { processedAt: '2026-08-19T02:00:00Z', machines: { a: { processedAt: '2026-08-18T17:00:00Z' } } }
  assert.equal(lifecycleEnteredAt(workflow, null), '2026-08-18T17:00:00Z')
  assert.equal(isPreBoundaryLifecycle(workflow, null, DATE), true)
})

test('today and future lifecycle orders can never be baseline-tombstoned', () => {
  assert.equal(isPreBoundaryLifecycle({ processedAt: '2026-08-19T00:00:00+05:30' }, null, DATE), false)
  assert.equal(isPreBoundaryLifecycle({ processedAt: '2026-08-20T00:00:00+05:30' }, null, DATE), false)
})

test('unknown timestamps fail safe and are not baseline-tombstoned', () => {
  assert.equal(isPreBoundaryLifecycle({ status: 'processed' }, {}, DATE), false)
})
