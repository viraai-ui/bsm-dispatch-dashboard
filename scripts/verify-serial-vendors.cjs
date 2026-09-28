#!/usr/bin/env node
// Independent READ-ONLY verifier. Only OAuth and worksheet.content.get are permitted.
const fs = require('node:fs')
const { execFileSync } = require('node:child_process')
const path = require('node:path')
const crypto = require('node:crypto')
async function readSnapshot() {
  const e = process.env
  const dc = e.ZOHO_DC || 'in'
  const auth = await fetch(`https://accounts.zoho.${dc}/oauth/v2/token`, { method: 'POST', body: new URLSearchParams({ grant_type: 'refresh_token', client_id: e.ZOHO_SERIAL_SHEET_CLIENT_ID || e.ZOHO_CLIENT_ID, client_secret: e.ZOHO_SERIAL_SHEET_CLIENT_SECRET || e.ZOHO_CLIENT_SECRET, refresh_token: e.ZOHO_SERIAL_SHEET_REFRESH_TOKEN }) }).then(r => r.json())
  if (!auth.access_token) throw new Error('Sheet OAuth failed (secret values suppressed)')
  const worksheet = e.ZOHO_SERIAL_SHEET_NAME || 'Sr.No.26-27'
  const resourceId = e.ZOHO_SERIAL_SHEET_ID || 'ryxg17eef99a9ae0441b4bf62c69db2b5640c'
  // No range means full used worksheet, not a cropped register fragment.
  const response = await fetch(`${e.ZOHO_SHEET_API_DOMAIN || `https://sheet.zoho.${dc}`}/api/v2/${resourceId}`, { method: 'POST', headers: { Authorization: `Zoho-oauthtoken ${auth.access_token}` }, body: new URLSearchParams({ method: 'worksheet.content.get', worksheet_name: worksheet }) })
  const raw = await response.json()
  if (!response.ok || raw.error_code || raw.status === 'failure' || !Array.isArray(raw.range_details)) throw new Error(`Sheet read failed: ${raw.error_message || raw.status || response.status}`)
  return { worksheet, resourceId, fetchedAt: new Date().toISOString(), raw }
}
function workflowSources(workflow) {
  const sources = []
  for (const order of Object.values(workflow.orders || {})) for (const m of Object.values(order.machines || {})) {
    if (!m.serialNumber || m.reallocatedToMachineId) continue
    const processed = order.processedOrder?.machines?.find(p => p.id === m.machineUnitId)
    sources.push({ serial: String(m.serialNumber).trim(), vendor: String(m.vendor !== undefined ? m.vendor : processed?.vendor || '').trim(), orderId: order.salesOrderId, machineId: m.machineUnitId })
  }
  return sources
}
function inspect(snapshot, sources) {
  const rows = snapshot.raw.range_details
  const headers = rows.find(r => Number(r.row_index) === 1)?.row_details || []
  const norm = v => String(v).toLowerCase().replace(/[^a-z0-9]/g, '')
  function column(name) {
    const found = headers.filter(h => norm(h.content) === norm(name))
    if (found.length !== 1) throw new Error(`Missing/ambiguous header ${name}`)
    return Number(found[0].column_index)
  }
  const serialCol = column('Serial No.'), makeCol = column('Make')
  const physical = rows.filter(r => Number(r.row_index) > 1).map(r => ({ row: Number(r.row_index), serial: String(r.row_details?.find(c => Number(c.column_index) === serialCol)?.content || '').trim(), vendor: String(r.row_details?.find(c => Number(c.column_index) === makeCol)?.content || '').trim() })).filter(r => r.serial)
  const diff = [], unknown = [], conflicts = [], verified = [], missing = []
  for (const source of sources) {
    const matches = physical.filter(r => r.serial === source.serial)
    if (matches.length > 1 || sources.filter(s => s.serial === source.serial).length > 1) { conflicts.push({ ...source, reason: 'duplicate identity', rows: matches }); continue }
    if (!source.vendor) { unknown.push({ ...source, rows: matches }); continue }
    if (!matches.length) { missing.push(source); continue }
    const row = matches[0]
    if (!row.vendor) diff.push({ ...source, row: row.row, column: makeCol, before: '', after: source.vendor })
    else if (row.vendor.toLowerCase() !== source.vendor.toLowerCase()) conflicts.push({ ...source, row: row.row, actual: row.vendor, reason: 'manual nonblank value preserved' })
    else verified.push({ ...source, row: row.row })
  }
  return { headers, physicalRows: physical.length, diff, unknown, conflicts, missing, verified, samples: physical.filter(r => ['26271344','26271349','26271358'].includes(r.serial)) }
}
function readWorkflow() {
  const meta = JSON.parse(execFileSync('gh', ['api', 'repos/viraai-ui/bsm-dispatch-dashboard/contents/data/workflow-store.json'], { maxBuffer: 50 * 1024 * 1024, encoding: 'utf8', env: { ...process.env, GITHUB_TOKEN: '', GH_TOKEN: '' } }))
  if (meta.content) return JSON.parse(Buffer.from(meta.content, 'base64').toString())
  const blob = JSON.parse(execFileSync('gh', ['api', meta.git_url.replace('https://api.github.com/', '')], { maxBuffer: 50 * 1024 * 1024, encoding: 'utf8', env: { ...process.env, GITHUB_TOKEN: '', GH_TOKEN: '' } }))
  if (!blob.content) throw new Error('Workflow response missing content; no stale local fallback')
  return JSON.parse(Buffer.from(blob.content, 'base64').toString())
}
function cells(snapshot) {
  const result = {}
  for (const row of snapshot.raw.range_details) for (const cell of row.row_details || []) result[`${row.row_index}:${cell.column_index}`] = cell
  return result
}
async function main() {
  const out = process.argv[2]
  if (!out) throw new Error('Usage: node --env-file=<private-env> scripts/verify-serial-vendors.cjs <artifact-directory> [before-snapshot.json]')
  fs.mkdirSync(out, { recursive: true, mode: 0o700 })
  const workflow = readWorkflow(), sources = workflowSources(workflow)
  const snapshot = await readSnapshot(), report = inspect(snapshot, sources)
  const beforeFile = process.argv[3]
  if (beforeFile) {
    const before = cells(JSON.parse(fs.readFileSync(beforeFile, 'utf8'))), after = cells(snapshot)
    report.cellChanges = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key])).map(key => ({ key, before: before[key], after: after[key] }))
  }
  for (const [file, value] of [['sheet-raw.json', snapshot], ['workflow.json', workflow], ['vendor-report.json', report]]) fs.writeFileSync(path.join(out, file), JSON.stringify(value, null, 2), { mode: 0o600 })
  const bytes = fs.readFileSync(path.join(out, 'sheet-raw.json'))
  fs.writeFileSync(path.join(out, 'sheet-raw.sha256'), crypto.createHash('sha256').update(bytes).digest('hex') + '\n', { mode: 0o600 })
  console.log(JSON.stringify({ out, physicalRows: report.physicalRows, blankKnown: report.diff.length, sourceEmpty: report.unknown.length, conflicts: report.conflicts.length, missing: report.missing.length, verified: report.verified.length, samples: report.samples, cellChanges: report.cellChanges?.length }, null, 2))
}
module.exports = { readSnapshot, readWorkflow, workflowSources, inspect, cells }
if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1 })
