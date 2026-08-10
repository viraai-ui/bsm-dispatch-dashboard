const fs = require('fs')
const { Client } = require('pg')

for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([^#=]+)=(.*)$/)
  if (!match) continue
  let value = match[2]
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
  process.env[match[1].trim()] = value
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL missing from .env.local')

const dc = process.env.ZOHO_DC || 'in'
const accountsDomain = `https://accounts.zoho.${dc}`
const sheetDomain = process.env.ZOHO_SHEET_API_DOMAIN || `https://sheet.zoho.${dc}`
const worksheetName = process.env.ZOHO_SERIAL_SHEET_NAME || 'Sr.No.26-27'

async function token() {
  const body = new URLSearchParams({ refresh_token: process.env.ZOHO_SERIAL_SHEET_REFRESH_TOKEN, client_id: process.env.ZOHO_SERIAL_SHEET_CLIENT_ID, client_secret: process.env.ZOHO_SERIAL_SHEET_CLIENT_SECRET, grant_type: 'refresh_token' })
  const response = await fetch(`${accountsDomain}/oauth/v2/token`, { method: 'POST', body })
  const data = await response.json()
  if (!data.access_token) throw new Error(`Zoho token failed: ${JSON.stringify(data)}`)
  return data.access_token
}

async function sheetPost(accessToken, params) {
  const response = await fetch(`${sheetDomain}/api/v2/${process.env.ZOHO_SERIAL_SHEET_ID}`, { method: 'POST', headers: { Authorization: `Zoho-oauthtoken ${accessToken}`, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) })
  const text = await response.text()
  let data
  try { data = JSON.parse(text) } catch { data = { raw: text } }
  if (!response.ok || data.status === 'failure' || data.error_code) throw new Error(JSON.stringify(data))
  return data
}

function parseDate(value) {
  const clean = String(value || '').replace(/^'/, '').trim()
  const m = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/)
  if (!m) return null
  const year = m[3].length === 2 ? `20${m[3]}` : m[3]
  return `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

function warrantyEnd(date) {
  if (!date) return null
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + 13)
  return d.toISOString().slice(0, 10)
}

function readRows(rangeDetails) {
  const rows = []
  const seen = new Set()
  for (const row of rangeDetails || []) {
    if (Number(row.row_index) <= 1) continue
    const c = {}
    for (const cell of row.row_details || []) c[Number(cell.column_index)] = String(cell.content || '').trim()
    const serial = c[5]
    if (!serial || seen.has(serial)) continue
    seen.add(serial)
    const dop = parseDate(c[4])
    rows.push({ serial, salesOrderNumber: `SERIAL-${serial}`, customerName: c[2] || 'Legacy customer', address: c[3] || '', model: c[6] || '', make: c[8] || '', dop, warrantyEnd: warrantyEnd(dop) })
  }
  return rows
}

async function main() {
  const accessToken = await token()
  const sheet = await sheetPost(accessToken, { method: 'worksheet.content.get', worksheet_name: worksheetName, range: 'A1:H5000' })
  const rows = readRows(sheet.range_details)
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  let inserted = 0
  for (const row of rows) {
    const result = await client.query(`
      insert into machines (serial_number, sales_order_number, customer_name, shipping_address, model_no, make, date_of_purchase, warranty_start, warranty_end, source)
      values ($1,$2,$3,$4,$5,$6,$7,$7,$8,'zoho_sheet_import')
      on conflict (serial_number) do update set
        customer_name = excluded.customer_name,
        shipping_address = excluded.shipping_address,
        model_no = excluded.model_no,
        make = excluded.make,
        date_of_purchase = excluded.date_of_purchase,
        warranty_start = excluded.warranty_start,
        warranty_end = excluded.warranty_end,
        updated_at = now()
      returning (xmax = 0) as inserted
    `, [row.serial, row.salesOrderNumber, row.customerName, row.address, row.model, row.make, row.dop, row.warrantyEnd])
    if (result.rows[0]?.inserted) inserted += 1
  }
  const count = await client.query('select count(*)::int as count from machines')
  await client.end()
  console.log(JSON.stringify({ importedRows: rows.length, inserted, machineCount: count.rows[0].count }, null, 2))
}

main().catch((error) => { console.error(error.message); process.exit(1) })
