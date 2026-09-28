import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
const require = createRequire(import.meta.url)
const ts = require('typescript')
function load(file, mocks = {}, globals = {}) {
  const source = readFileSync(new URL(`../src/lib/${file}.ts`, import.meta.url), 'utf8')
  const module = { exports: {} }
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module, exports: module.exports, require: name => mocks[name] || require(name), process: { env: { ZOHO_SERIAL_SHEET_ENABLED: 'true', ZOHO_CLIENT_ID: 'test', ZOHO_CLIENT_SECRET: 'test', ZOHO_SERIAL_SHEET_REFRESH_TOKEN: 'test' } }, URLSearchParams, setTimeout: fn => { fn(); return 0 }, ...globals })
  return module.exports
}
const rules = load('serial-sheet-vendors')
const headers = ['S.No.', 'Company Name', 'Address', 'D.O.P.', 'Serial No.', 'Model No.', 'Remark', 'Make ']
const header = { row_index: 1, row_details: headers.map((content, i) => ({ column_index: i + 1, content })) }
const row = (serial, vendor = '', index = 2) => ({ row_index: index, row_details: [{ column_index: 5, content: serial }, { column_index: 8, content: vendor }] })
test('exact trailing-space append header and explicit workflow precedence', () => {
  assert.equal(rules.exactAppendRows([{ Make: 'Chosen' }], [header])[0]['Make '], 'Chosen')
  assert.equal(rules.workflowVendor({ vendor: '' }, { vendor: 'Inventory' }), '')
  assert.equal(rules.workflowVendor({}, { vendor: 'Processed' }), 'Processed')
  assert.equal(rules.workflowVendor({ vendor: 'Chosen' }, { vendor: 'Other' }), 'Chosen')
})
test('blank-only, duplicate refusal, unknown and bounded retries', () => {
  const plan = rules.planVendorUpdates([header, row('1'), row('2', 'Manual', 3), row('3', '', 4), row('3', '', 5)], [{ serial: '1', vendor: 'Chosen' }, { serial: '2', vendor: 'Other' }, { serial: '3', vendor: 'Chosen' }, { serial: '4', vendor: '' }])
  assert.equal(plan.updates.length, 1)
  assert.equal(plan.updates[0].column, 8)
  assert.equal(plan.outcomes.map(x => x.status).join(','), 'pending,conflict,conflict,unknown')
  assert.equal(rules.planVendorUpdates([header, row('1')], [{ serial: '1', vendor: 'A' }, { serial: '1', vendor: 'A' }]).updates.length, 0)
})
test('real reconciler revisits synced serial, fails closed on lost write, retries and becomes a no-op', async () => {
  let content = [header, row('26271344')]
  let writes = 0, commits = 0, loseWrite = true
  let workflow = { salesOrderId: 'order', machines: { machine: { machineUnitId: 'machine', serialNumber: '26271344', vendor: 'Chosen', zohoBackupStatus: 'synced' } } }
  const backup = load('serial-sheet-backup', {
    './serial-sheet-vendors': rules,
    './serial-sheet-vendor-transport': { ...(await import('../src/lib/serial-sheet-vendor-transport.ts')), reserveSheetCall: async () => {}, coolDownSheet: async () => {} },
    './workflow-store': {
      listWorkflows: async () => ({ order: workflow }),
      githubReadJson: async () => ({ data: { orders: {} } }),
      upsertOrderWorkflow: async (_, update) => { commits++; workflow = update(workflow) },
    },
  }, { fetch: async (url, options) => {
    if (url.includes('/oauth/')) return { ok: true, json: async () => ({ access_token: 'fixture', expires_in: 3600 }) }
    const method = options.body.get('method')
    if (method === 'worksheet.csvdata.set') { writes++; if (!loseWrite) content = [header, row('26271344', options.body.get('data').slice(1,-1))] }
    else assert.ok(['worksheet.content.get','range.content.get'].includes(method), 'existing serial must never append')
    return { ok: true, text: async () => JSON.stringify({ range_details: method === 'range.content.get' ? content.slice(1) : content }) }
  } })
  await backup.syncMissingGeneratedSerialsToZohoSheet()
  assert.equal(workflow.machines.machine.zohoBackupStatus, 'error')
  loseWrite = false
  await backup.syncMissingGeneratedSerialsToZohoSheet()
  assert.equal(workflow.machines.machine.zohoBackupStatus, 'synced')
  await backup.syncMissingGeneratedSerialsToZohoSheet()
  assert.equal(writes, 2)
  assert.equal(commits, 2)
  content = [header, row('26271344', 'Manual')]
  await backup.syncMissingGeneratedSerialsToZohoSheet()
  assert.equal(writes, 2, 'manual values preserved')
  assert.equal(workflow.machines.machine.zohoBackupStatus, 'error')
})
