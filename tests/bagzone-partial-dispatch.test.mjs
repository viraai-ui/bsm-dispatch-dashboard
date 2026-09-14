import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { ensureOrderedMachineSlots, hasIncompleteMachineSlots, completionCoversMachineIds } from '../src/lib/machine-unit-slots.ts'

const fixture = JSON.parse(await readFile(new URL('./fixtures/bagzone-partial-dispatch.json', import.meta.url), 'utf8'))
const order = fixture.order
const ids = order.machines.map((machine) => machine.id)
const workflow = { salesOrderId: order.id, salesOrderNumber: order.salesOrderNumber, status: 'processed', machines: Object.fromEntries(order.machines.map((machine) => [machine.id, { machineUnitId: machine.id, lineItemId: machine.lineItemId, serialNumber: machine.serialNumber, qrStatus: 'generated', processedAt: '2026-07-27', dispatchedAt: '2026-07-29' }])) }

test('BAGZONE closed partial dispatch retains stable identities and surfaces Units 3-4', () => {
  const hydrated = ensureOrderedMachineSlots(order, workflow)
  assert.equal(hydrated.machines.length, 4)
  assert.deepEqual(hydrated.machines.slice(0, 2).map((m) => [m.id, m.serialNumber]), [[ids[0], '26270783'], [ids[1], '26270784']])
  assert.deepEqual(hydrated.machines.slice(2).map((m) => [m.unitNumber, m.serialNumber, m.status]), [[3, '', 'Not Generated'], [4, '', 'Not Generated']])
  assert.equal(hasIncompleteMachineSlots(order, workflow), true)
  assert.equal(completionCoversMachineIds(hydrated.machines.slice(2).map((m) => m.id), ids), false)
})

test('only remaining slots are serial/process eligible', () => {
  const hydrated = ensureOrderedMachineSlots(order, workflow)
  const selectable = hydrated.machines.filter((machine) => !workflow.machines[machine.id]?.processedAt)
  assert.deepEqual(selectable.map((machine) => machine.unitNumber), [3, 4])
  assert.ok(selectable.every((machine) => !machine.serialNumber))
})
