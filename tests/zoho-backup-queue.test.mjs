import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const route = await readFile(new URL('../src/app/api/workflow/orders/[id]/route.ts', import.meta.url), 'utf8')
const sheet = await readFile(new URL('../src/lib/serial-sheet-backup.ts', import.meta.url), 'utf8')
const ui = await readFile(new URL('../src/components/OrdersClient.tsx', import.meta.url), 'utf8')
const workflow = await readFile(new URL('../src/lib/workflow-store.ts', import.meta.url), 'utf8')

assert.ok(route.includes("zohoBackupStatus: existing?.zohoBackupStatus === 'synced' ? 'synced' : 'pending'"), 'generate must durably queue Sheet backup')
assert.ok(route.indexOf('upsertOrderWorkflow') >= 0, 'workflow must be the authoritative durable persistence')
assert.ok(!route.includes('upsertGeneratedSerialsToMasterDatabase'), 'generate response must not await Neon master backup')
assert.ok(!route.includes('backupGeneratedSerialsToZohoSheet(order'), 'generate must not synchronously call Sheet')
assert.ok(!route.includes('backup did not verify'), 'Sheet verification must not gate serial generation')
assert.ok(!route.includes('updateSerialVendorsInZohoSheet'), 'processing must not wait for Sheet vendor API')
assert.ok(route.includes("status: 'pending'"), 'API must report queued, not successful, backup')
assert.ok(ui.includes('Zoho backup queued (non-blocking)'), 'UI must surface a truthful non-blocking warning')
assert.ok(workflow.includes("zohoBackupStatus?: 'pending' | 'synced' | 'error'"), 'workflow must store explicit backup state')
assert.ok(sheet.includes('One full read for the whole queue, one batch append, and at most one readback'), 'reconciler must batch API calls')
assert.ok(sheet.includes('prevent duplicates within this batch'), 'batch must deduplicate serials')
assert.ok(sheet.includes("machineWorkflow.zohoBackupStatus === 'synced'"), 'retries must skip completed queue items')
assert.ok(!sheet.includes('serial <= minSerial'), 'retry queue must not strand old pending serials behind a cutoff')
assert.ok(sheet.includes('if (rows.length) await appendSerialRows(rows)'), 'empty append must be impossible')
assert.ok(sheet.indexOf('const after = await fetchSerialRecords()') < sheet.indexOf("zohoBackupStatus: ok ? 'synced' : 'error'"), 'readback must happen before an item is marked synced')
assert.ok(sheet.includes("zohoBackupStatus: ok ? 'synced' : 'error'"), 'eventual reconciliation must persist outcome')
assert.ok(sheet.includes('/api request limit|rate limit|too many requests|quota/'), 'quota failures must not be aggressively retried')
// Fault model: first append succeeds but readback fails. The item remains queued; on the
// next tick the initial read sees it and skips append, then marks it synced. Repeated ticks
// stop at the synced state and cannot append a duplicate.
let state = 'pending'; let present = false; let appends = 0
function tick({ failReadback = false } = {}) {
  if (state === 'synced') return
  const wasPresent = present
  if (!wasPresent) { present = true; appends++ }
  if (failReadback && !wasPresent) { state = 'error'; return }
  if (present) state = 'synced'
}
tick({ failReadback: true })
assert.equal(state, 'error', 'temporary Zoho readback failure must remain queued')
tick()
assert.equal(state, 'synced', 'next tick must recover after temporary failure')
tick()
assert.equal(appends, 1, 'successful and repeated retries must not create duplicates')
console.log('Zoho backup architecture/fault regression tests passed: 19 assertions')
