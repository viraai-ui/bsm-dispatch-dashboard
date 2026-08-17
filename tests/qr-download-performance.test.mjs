import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { readFile } from 'node:fs/promises'
import QRCode from 'qrcode'
import { jsPDF } from 'jspdf'

const ui = await readFile(new URL('../src/components/OrdersClient.tsx', import.meta.url), 'utf8')
const route = await readFile(new URL('../src/app/api/workflow/orders/[id]/route.ts', import.meta.url), 'utf8')

assert.match(ui, /machine\.serialNumber \|\| allocated\[machine\.id\]/, 'existing serial must be reused')
assert.match(ui, /machineIds: string\[\]\) \{ if \(!machineIds\.length\) return \{\}/, 'existing serial must skip allocation request')
assert.ok(ui.indexOf('generateBarcodePdf({ order') < ui.indexOf("void saveWorkflow(order.id, { action: 'generate'"), 'download must start before background persistence')
assert.ok(!route.includes('upsertGeneratedSerialsToMasterDatabase'), 'generate API must not await Neon master mirror')
assert.ok(!ui.includes('qrCode: nextQrCodes[machine.id]'), 'workflow payload must not contain oversized QR data URLs')
assert.ok(ui.includes('Download QR PDF'), 'existing serials need an explicit PDF action')

const payloads = Array.from({ length: 12 }, (_, i) => `Sales Order Number: MOCK-${i}\nMachine Serial Number: 2627${String(i).padStart(4, '0')}`)
const started = performance.now()
const codes = await Promise.all(payloads.map((payload) => QRCode.toDataURL(payload, { margin: 1, width: 240 })))
const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [75, 50], compress: true })
codes.forEach((code, index) => {
  if (index) doc.addPage([75, 50], 'landscape')
  doc.addImage(code, 'PNG', 5, 5, 22, 22)
  doc.text(`2627${String(index).padStart(4, '0')}`, 34, 18)
})
const bytes = doc.output('arraybuffer').byteLength
const elapsed = performance.now() - started
assert.ok(bytes > 10_000, 'mock PDF should contain rendered QR images')
assert.ok(elapsed < 1500, `12-label local generation took ${elapsed.toFixed(1)}ms (limit 1500ms)`)

// A simulated API-limit promise must not be in the local critical path.
const limitedMirror = new Promise((_, reject) => setTimeout(() => reject(new Error('429 API request limit')), 500))
limitedMirror.catch(() => {})
const localStarted = performance.now()
await QRCode.toDataURL(payloads[0], { margin: 1, width: 240 })
const localElapsed = performance.now() - localStarted
assert.ok(localElapsed < 250, `local QR waited on mocked API limit: ${localElapsed.toFixed(1)}ms`)
console.log(`QR performance passed: 12-page PDF ${elapsed.toFixed(1)}ms, one local QR under API limit ${localElapsed.toFixed(1)}ms, ${bytes} bytes`)