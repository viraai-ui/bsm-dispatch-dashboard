import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const ui = await readFile(new URL('../src/components/OrdersClient.tsx', import.meta.url), 'utf8')
const route = await readFile(new URL('../src/app/api/workflow/orders/[id]/route.ts', import.meta.url), 'utf8')
const store = JSON.parse(await readFile(new URL('../data/workflow-store.json', import.meta.url), 'utf8'))

assert.match(ui, /setProcessed\(true\)[\s\S]*?try \{[\s\S]*?catch \(error\)[\s\S]*?finally \{\s*setProcessed\(false\)/, 'Process busy state must always clear')
assert.ok(ui.includes("processed ? 'Processing…' : 'Proceed'"), 'Process button must expose progress')
assert.ok(ui.includes('controller.abort(), 30_000'), 'Workflow request must have a finite timeout')
assert.ok(ui.includes('Processing timed out. No duplicate will be created; please retry once.'), 'Timeout must be actionable')
assert.ok(route.includes('alreadyLocked.length === selected.length'), 'Exact process replay must be idempotent')
const order = store.orders['1154219000036081003']
const machine = order.machines['1154219000036081003-1154219000036081006-1']
assert.equal(order.salesOrderNumber, 'SO-07818')
assert.equal(machine.serialNumber, '26271066')
assert.equal(machine.qrStatus, 'generated', 'Allocated/downloaded SO-07818 QR must be process-eligible')
assert.equal(order.status, 'open', 'Repair must not invent dispatch details or process the order')
console.log('Order process resilience regression tests passed: 9 assertions')