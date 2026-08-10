const fs = require('fs')

for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/)
  if (!match) continue
  let value = match[2]
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
  process.env[match[1].trim()] = value
}

const dc = process.env.ZOHO_DC || 'in'
const accountsDomain = `https://accounts.zoho.${dc}`
const sheetDomain = process.env.ZOHO_SHEET_API_DOMAIN || `https://sheet.zoho.${dc}`
const worksheetName = process.env.ZOHO_SERIAL_SHEET_NAME || 'Sr.No.26-27'
const resourceId = process.env.ZOHO_SERIAL_SHEET_ID
const dryRun = process.argv.includes('--dry-run')
const execute = process.argv.includes('--execute')
const minRowArg = process.argv.find((arg) => arg.startsWith('--min-row='))
const minRow = minRowArg ? Number(minRowArg.split('=')[1]) : 2
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function getToken() {
  const body = new URLSearchParams({
    refresh_token: process.env.ZOHO_SERIAL_SHEET_REFRESH_TOKEN,
    client_id: process.env.ZOHO_SERIAL_SHEET_CLIENT_ID,
    client_secret: process.env.ZOHO_SERIAL_SHEET_CLIENT_SECRET,
    grant_type: 'refresh_token',
  })
  const response = await fetch(`${accountsDomain}/oauth/v2/token`, { method: 'POST', body })
  const data = await response.json()
  if (!data.access_token) throw new Error(`Token failed: ${JSON.stringify(data)}`)
  return data.access_token
}

async function post(token, params, retries = 6) {
  let last = null
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const response = await fetch(`${sheetDomain}/api/v2/${resourceId}`, {
      method: 'POST',
      headers: { Authorization: `Zoho-oauthtoken ${token}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
    })
    const text = await response.text()
    let data
    try { data = JSON.parse(text) } catch { data = { raw: text } }
    if (response.ok && data.status !== 'failure' && !data.error_code && !data.error) return data
    last = data
    const throttled = data.error === 'Access Denied' || /too many|throttle/i.test(JSON.stringify(data))
    if (!throttled || attempt === retries) break
    await sleep(15000 * attempt)
  }
  throw new Error(JSON.stringify(last))
}

function readRow(row) {
  const values = {}
  for (const cell of row.row_details || []) values[Number(cell.column_index)] = String(cell.content || '').trim()
  return {
    rowIndex: Number(row.row_index),
    sno: values[1] || '',
    company: values[2] || '',
    address: values[3] || '',
    dop: values[4] || '',
    serial: values[5] || '',
    model: values[6] || '',
    remark: values[7] || '',
    make: values[8] || '',
    nonEmpty: Object.values(values).some(Boolean),
  }
}

async function fetchRows(token) {
  const data = await post(token, { method: 'worksheet.content.get', worksheet_name: worksheetName, range: 'A1:H5000' })
  return (data.range_details || []).map(readRow).filter((row) => row.rowIndex > 1 && row.nonEmpty)
}

function duplicateRows(rows) {
  const seen = new Map()
  const duplicates = []
  for (const row of rows) {
    if (!row.serial) continue
    if (seen.has(row.serial)) duplicates.push({ original: seen.get(row.serial), duplicate: row })
    else seen.set(row.serial, row)
  }
  return duplicates
}

function rangesFromRows(indices) {
  const sorted = [...indices].sort((a, b) => a - b)
  const ranges = []
  for (const index of sorted) {
    const last = ranges[ranges.length - 1]
    if (last && index === last.end + 1) last.end = index
    else ranges.push({ start: index, end: index })
  }
  return ranges
}

async function clearRowRange(token, start, end) {
  return post(token, {
    method: 'range.clear',
    worksheet_name: worksheetName,
    start_row: String(start),
    start_column: '1',
    end_row: String(end),
    end_column: '8',
  })
}

async function main() {
  if (!dryRun && !execute) throw new Error('Pass --dry-run or --execute')
  const token = await getToken()
  const beforeRows = await fetchRows(token)
  const duplicates = duplicateRows(beforeRows)
  const duplicateIndices = duplicates.map((item) => item.duplicate.rowIndex).filter((rowIndex) => rowIndex >= minRow)
  const ranges = rangesFromRows(duplicateIndices)
  console.log(JSON.stringify({ mode: dryRun ? 'dry-run' : 'execute', minRow, beforeRows: beforeRows.length, duplicateRows: duplicates.length, selectedDuplicateRows: duplicateIndices.length, ranges: ranges.length, firstSelectedDuplicate: duplicates.find((item) => item.duplicate.rowIndex >= minRow) || null, lastRange: ranges.at(-1) }, null, 2))
  if (dryRun) return
  for (const range of ranges.reverse()) {
    await clearRowRange(token, range.start, range.end)
    console.log(`cleared rows ${range.start}-${range.end}`)
    await sleep(1800)
  }
  await sleep(2000)
  const afterRows = await fetchRows(token)
  const afterDuplicates = duplicateRows(afterRows)
  console.log(JSON.stringify({ afterRows: afterRows.length, remainingDuplicates: afterDuplicates.length, sample: afterDuplicates[0] || null }, null, 2))
}

main().catch((error) => { console.error(error.message); process.exit(1) })
