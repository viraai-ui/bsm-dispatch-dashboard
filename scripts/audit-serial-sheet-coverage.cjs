#!/usr/bin/env node
const { execFileSync } = require('node:child_process')
const https = require('node:https')

const repo = process.env.GITHUB_REPO_FULL || 'viraai-ui/bsm-dispatch-dashboard'
const DEFAULT_SERIAL_SHEET_ID = 'ryxg17eef99a9ae0441b4bf62c69db2b5640c'
const DEFAULT_SERIAL_WORKSHEET = 'Sr.No.26-27'
const DEFAULT_DATABASE_WORKSHEETS = ['Sr.No.26-27', 'Sr. No.25-26', 'Sr.No.25-26']

function ghApi(path) {
  return JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', maxBuffer: 80 * 1024 * 1024 }))
}

function readUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'user-agent': 'bsm-serial-sheet-audit' } }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => res.statusCode >= 200 && res.statusCode < 300 ? resolve(body) : reject(new Error(`${url} returned ${res.statusCode}: ${body.slice(0, 200)}`)))
    }).on('error', reject)
  })
}

async function githubJson(path) {
  if (process.env.USE_LOCAL_WORKFLOW === 'true') return require(require('node:path').join(process.cwd(), path))
  try {
    const meta = ghApi(`/repos/${repo}/contents/${path}`)
    if (meta.content && meta.encoding === 'base64') return JSON.parse(Buffer.from(meta.content, 'base64').toString('utf8'))
    if (meta.download_url) return JSON.parse(await readUrl(meta.download_url))
    if (meta.git_url) {
      const blob = ghApi(meta.git_url.replace('https://api.github.com', ''))
      return JSON.parse(Buffer.from(blob.content || '', 'base64').toString('utf8'))
    }
  } catch (error) {
    if (process.env.ALLOW_LOCAL_WORKFLOW_FALLBACK !== 'false') return require(require('node:path').join(process.cwd(), path))
    throw error
  }
  throw new Error(`Could not read ${path}`)
}

function dc() { return process.env.ZOHO_DC || 'in' }
function accountsDomain() { return `https://accounts.zoho.${dc()}` }
function sheetDomain() { return process.env.ZOHO_SHEET_API_DOMAIN || `https://sheet.zoho.${dc()}` }
function sheetClientId() { return process.env.ZOHO_SERIAL_SHEET_CLIENT_ID || process.env.ZOHO_CLIENT_ID || '' }
function sheetClientSecret() { return process.env.ZOHO_SERIAL_SHEET_CLIENT_SECRET || process.env.ZOHO_CLIENT_SECRET || '' }
function sheetRefreshToken() { return process.env.ZOHO_SERIAL_SHEET_REFRESH_TOKEN || '' }
function sheetResourceId() { return process.env.ZOHO_SERIAL_SHEET_ID || DEFAULT_SERIAL_SHEET_ID }
function primaryWorksheet() { return process.env.ZOHO_SERIAL_SHEET_NAME || DEFAULT_SERIAL_WORKSHEET }
function databaseWorksheets() {
  return [...new Set((process.env.ZOHO_SERIAL_DATABASE_SHEET_NAMES
    ? process.env.ZOHO_SERIAL_DATABASE_SHEET_NAMES.split(',').map((name) => name.trim()).filter(Boolean)
    : DEFAULT_DATABASE_WORKSHEETS))]
}

async function getSheetAccessToken() {
  const body = new URLSearchParams({
    refresh_token: sheetRefreshToken(),
    client_id: sheetClientId(),
    client_secret: sheetClientSecret(),
    grant_type: 'refresh_token',
  })
  const response = await fetch(`${accountsDomain()}/oauth/v2/token`, { method: 'POST', body })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || !data.access_token) throw new Error(data.error || 'Unable to refresh Zoho Sheet token')
  return data.access_token
}

let tokenPromise
async function sheetPost(params) {
  tokenPromise ||= getSheetAccessToken()
  const token = await tokenPromise
  const response = await fetch(`${sheetDomain()}/api/v2/${sheetResourceId()}`, {
    method: 'POST',
    headers: { Authorization: `Zoho-oauthtoken ${token}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  })
  const text = await response.text()
  let data = {}
  try { data = JSON.parse(text) } catch { data = { raw: text } }
  if (!response.ok || data.status === 'failure' || data.error_code) throw new Error(data.error_message || data.message || `Zoho Sheet request failed (${response.status})`)
  return data
}

function normalizeSheetKey(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '') }
function sheetValue(row, names) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== null) return row[name]
    const normalized = normalizeSheetKey(name)
    const match = Object.keys(row).find((key) => normalizeSheetKey(key) === normalized)
    if (match && row[match] !== undefined && row[match] !== null) return row[match]
  }
  return ''
}

async function fetchSerialContentRecords(worksheetName) {
  const data = await sheetPost({ method: 'worksheet.content.get', worksheet_name: worksheetName, range: 'A1:Z10000' })
  const rows = Array.isArray(data.range_details) ? data.range_details : []
  const headers = new Map()
  const records = []
  for (const row of rows) {
    const rowDetails = Array.isArray(row.row_details) ? row.row_details : []
    if (Number(row.row_index) === 1) {
      for (const cell of rowDetails) {
        const header = String(cell.content || '').trim()
        if (header) headers.set(Number(cell.column_index), header)
      }
      continue
    }
    const record = { row_index: row.row_index, __worksheetName: worksheetName }
    for (const cell of rowDetails) {
      const header = headers.get(Number(cell.column_index))
      if (header) record[header] = cell.content
    }
    records.push(record)
  }
  return records
}

function collectWorkflowMachines(workflow) {
  const rows = []
  for (const [orderId, order] of Object.entries(workflow.orders || {})) {
    const processedMachines = new Map((order.processedOrder?.machines || []).map((m) => [m.id, m]))
    for (const machine of Object.values(order.machines || {})) {
      const serial = String(machine.serialNumber || '').trim()
      if (!serial) continue
      const snapshot = processedMachines.get(machine.machineUnitId) || {}
      rows.push({
        serial,
        orderId,
        salesOrderNumber: order.salesOrderNumber || order.processedOrder?.salesOrderNumber || '',
        customerName: order.processedOrder?.customerName || snapshot.customerName || '',
        itemName: snapshot.itemName || '',
        vendor: machine.vendor || snapshot.vendor || '',
        generatedAt: machine.qrGeneratedAt || machine.processedAt || order.processedAt || '',
      })
    }
  }
  return rows.sort((a, b) => Number(a.serial) - Number(b.serial))
}

async function run() {
  if (!sheetRefreshToken() || !sheetClientId() || !sheetClientSecret()) throw new Error('Zoho Sheet credentials are missing')
  const workflow = await githubJson('data/workflow-store.json')
  const workflowMachines = collectWorkflowMachines(workflow)
  const worksheetNames = databaseWorksheets()
  const sheetErrors = []
  const allSheetRows = (await Promise.all(worksheetNames.map(async (name) => {
    try { return await fetchSerialContentRecords(name) }
    catch (error) { sheetErrors.push({ worksheetName: name, error: error instanceof Error ? error.message : String(error) }); return [] }
  }))).flat()
  const sheetSerials = new Set(allSheetRows.map((row) => String(sheetValue(row, ['Serial No.', 'Serial No', 'Serial']) || '').trim()).filter(Boolean))
  const missing = workflowMachines.filter((machine) => !sheetSerials.has(machine.serial))
  const duplicates = []
  const counts = new Map()
  for (const row of allSheetRows) {
    const serial = String(sheetValue(row, ['Serial No.', 'Serial No', 'Serial']) || '').trim()
    if (!serial) continue
    counts.set(serial, (counts.get(serial) || 0) + 1)
  }
  for (const [serial, count] of counts) if (count > 1) duplicates.push({ serial, count })
  const summary = {
    workflowSerialCount: workflowMachines.length,
    sheetNamesChecked: worksheetNames,
    sheetRowCount: allSheetRows.length,
    sheetSerialCount: sheetSerials.size,
    missingCount: missing.length,
    duplicateSheetSerialCount: duplicates.length,
    sheetErrors,
    missing,
    duplicateSheetSerials: duplicates.slice(0, 50),
  }
  console.log(JSON.stringify(summary, null, 2))
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
