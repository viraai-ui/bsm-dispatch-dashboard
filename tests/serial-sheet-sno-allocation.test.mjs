import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const source = readFileSync(new URL('../src/lib/serial-sheet-backup.ts', import.meta.url), 'utf8')
const module = { exports: {} }
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  module,
  exports: module.exports,
  require: name => name.startsWith('.') || name.startsWith('@/') ? {} : require(name),
  process: { env: {} },
})

const { planSerialSheetRows } = module.exports

function entry(serial, replaceExisting = false) {
  const machine = { id: `machine-${serial}`, serialNumber: serial, itemName: `Model ${serial}` }
  return {
    workflowId: `workflow-${serial}`,
    machineId: machine.id,
    serial,
    vendor: '',
    order: { id: `order-${serial}`, customerName: `Customer ${serial}`, shippingAddress: 'Address', machines: [machine], lineItems: [] },
    machine,
    generatedAt: '2026-09-28',
    replaceExisting,
  }
}

test('hundreds of historical entries and a replacement do not advance S.No.', () => {
  const records = Array.from({ length: 555 }, (_, index) => ({
    'S.No.': String(796 + index),
    'Serial No.': `existing-${index}`,
  }))
  const historical = records.map((record, index) => entry(record['Serial No.'], index === 200))
  const entries = [
    ...historical.slice(0, 201),
    entry('new-one'),
    ...historical.slice(201),
    entry('new-two'),
  ]

  // Mix an existing replacement with genuinely missing serials. Its original
  // S.No. is retained, while only the two appends consume 1351 and 1352.

  const plan = planSerialSheetRows(records, entries)
  assert.deepEqual(Array.from(plan.rows, row => row['S.No.']), ['1351', '1352'])
  assert.deepEqual(Array.from(plan.rows, row => row['Serial No.']), ['new-one', 'new-two'])
  assert.equal(plan.replacements.length, 1)
  assert.equal(plan.replacements[0]['Serial No.'], 'existing-200')
  assert.equal(plan.replacements[0]['S.No.'], records[200]['S.No.'])
})
