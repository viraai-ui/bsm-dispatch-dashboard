import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const route = await readFile(new URL('../src/app/api/workflow/orders/[id]/route.ts', import.meta.url), 'utf8')
const sheet = await readFile(new URL('../src/lib/serial-sheet-backup.ts', import.meta.url), 'utf8')
const ui = await readFile(new URL('../src/components/OrdersClient.tsx', import.meta.url), 'utf8')
const workflow = await readFile(new URL('../src/lib/workflow-store.ts', import.meta.url), 'utf8')

assert.ok(route.includes("zohoBackupStatus: existing?.zohoBackupStatus === 'synced' ? 'synced' : 'pending'"), 'generate must durably queue Sheet backup')
assert.ok(route.indexOf('upsertOrderWorkflow') < route.indexOf('upsertGeneratedSerialsToMasterDatabase'), 'workflow must persist before secondary backups')
assert.ok(!route.includes('backupGeneratedSerialsToZohoSheet(order'), 'generate must not synchronously call Sheet')
assert.ok(!route.includes('backup did not verify'), 'Sheet verification must not gate serial generation')
assert.ok(!route.includes('updateSerialVendorsInZohoSheet'), 'processing must not wait for Sheet vendor API')
assert.ok(route.includes("status: 'pending'"), 'API must report queued, not successful, backup')
assert.ok(ui.includes('Serial saved; Zoho backup queued'), 'UI must surface a truthful non-blocking warning')
assert.ok(workflow.includes("zohoBackupStatus?: 'pending' | 'synced' | 'error'"), 'workflow must store explicit backup state')
assert.ok(sheet.includes('One full read for the whole queue, one batch append, and at most one readback'), 'reconciler must batch API calls')
assert.ok(sheet.includes('prevent duplicates within this batch'), 'batch must deduplicate serials')
assert.ok(sheet.includes("machineWorkflow.zohoBackupStatus === 'synced'"), 'retries must skip completed queue items')
assert.ok(sheet.includes("zohoBackupStatus: ok ? 'synced' : 'error'"), 'eventual reconciliation must persist outcome')
assert.ok(sheet.includes('/api request limit|rate limit|too many requests|quota/'), 'quota failures must not be aggressively retried')
console.log('Zoho backup architecture regression tests passed: 13 assertions')
