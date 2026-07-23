import type { MachineUnit, Order } from '@/types/domain'

const DEFAULT_SERIAL_SHEET_ID = 'ryxg17eef99a9ae0441b4bf62c69db2b5640c'
const DEFAULT_SERIAL_WORKSHEET = 'Sr.No.26-27'

type SerialSheetRecord = {
  'S.No.': string
  'Company Name': string
  Address: string
  'D.O.P.': string
  'Serial No.': string
  'Model No.': string
  Remark: string
  Make: string
}

type BackupResult = { synced: number; skipped: number; configured: boolean; errors: string[] }

let cachedSheetAccessToken: { token: string; expiresAt: number } | null = null
let pendingSheetAccessToken: Promise<string> | null = null

function sheetDomain() {
  const dc = process.env.ZOHO_DC || 'in'
  return process.env.ZOHO_SHEET_API_DOMAIN || `https://sheet.zoho.${dc}`
}

function sheetConfig() {
  return {
    resourceId: process.env.ZOHO_SERIAL_SHEET_ID || DEFAULT_SERIAL_SHEET_ID,
    worksheetName: process.env.ZOHO_SERIAL_SHEET_NAME || DEFAULT_SERIAL_WORKSHEET,
  }
}

function serialSheetConfigured() {
  return process.env.ZOHO_SERIAL_SHEET_ENABLED === 'true' && Boolean(sheetClientId() && sheetClientSecret() && sheetRefreshToken())
}

function accountsDomain() {
  const dc = process.env.ZOHO_DC || 'in'
  return `https://accounts.zoho.${dc}`
}

function sheetClientId() { return process.env.ZOHO_SERIAL_SHEET_CLIENT_ID || process.env.ZOHO_CLIENT_ID || '' }
function sheetClientSecret() { return process.env.ZOHO_SERIAL_SHEET_CLIENT_SECRET || process.env.ZOHO_CLIENT_SECRET || '' }
function sheetRefreshToken() { return process.env.ZOHO_SERIAL_SHEET_REFRESH_TOKEN || '' }

async function getSheetAccessToken() {
  if (cachedSheetAccessToken && cachedSheetAccessToken.expiresAt > Date.now() + 60_000) return cachedSheetAccessToken.token
  if (pendingSheetAccessToken) return pendingSheetAccessToken
  pendingSheetAccessToken = refreshSheetAccessToken().finally(() => { pendingSheetAccessToken = null })
  return pendingSheetAccessToken
}

async function refreshSheetAccessToken() {
  const body = new URLSearchParams({
    refresh_token: sheetRefreshToken(),
    client_id: sheetClientId(),
    client_secret: sheetClientSecret(),
    grant_type: 'refresh_token',
  })
  const response = await fetch(`${accountsDomain()}/oauth/v2/token`, { method: 'POST', body, cache: 'no-store' })
  const data = await response.json()
  if (!response.ok || !data.access_token) throw new Error(data.error || 'Unable to refresh Zoho Sheet token')
  cachedSheetAccessToken = { token: data.access_token as string, expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000 }
  return cachedSheetAccessToken.token
}

async function sheetPost(params: Record<string, string>) {
  const { resourceId } = sheetConfig()
  const token = await getSheetAccessToken()
  const response = await fetch(`${sheetDomain()}/api/v2/${resourceId}`, {
    method: 'POST',
    headers: { Authorization: `Zoho-oauthtoken ${token}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
    cache: 'no-store',
  })
  const text = await response.text()
  let data: any = {}
  try { data = JSON.parse(text) } catch { data = { raw: text } }
  if (!response.ok || data.status === 'failure' || data.error_code) throw new Error(data.error_message || data.message || `Zoho Sheet request failed (${response.status})`)
  return data
}

async function fetchSerialRecords() {
  const { worksheetName } = sheetConfig()
  const data = await sheetPost({ method: 'worksheet.records.fetch', worksheet_name: worksheetName })
  return Array.isArray(data.records) ? data.records : Array.isArray(data.data) ? data.data : []
}

function nextSerialSheetNumber(records: any[]) {
  const max = records.reduce((highest, row) => {
    const raw = row['S.No.'] ?? row['S.No'] ?? row['S No'] ?? row.SNo ?? row.s_no
    const value = Number(String(raw || '').replace(/[^0-9]/g, ''))
    return Number.isFinite(value) ? Math.max(highest, value) : highest
  }, 0)
  return String(max + 1)
}

function rowDate(value: string) {
  const date = value ? new Date(value) : new Date()
  const safe = Number.isNaN(date.getTime()) ? new Date() : date
  return `${String(safe.getDate()).padStart(2, '0')}-${String(safe.getMonth() + 1).padStart(2, '0')}-${String(safe.getFullYear()).slice(-2)}`
}

function buildRows(order: Order, machines: MachineUnit[], date: string, firstSNo: string): SerialSheetRecord[] {
  let counter = Number(firstSNo)
  return machines.filter((machine) => machine.serialNumber).map((machine) => ({
    'S.No.': String(counter++),
    'Company Name': order.customerName || machine.customerName || '',
    Address: order.shippingAddress || '',
    'D.O.P.': rowDate(date),
    'Serial No.': machine.serialNumber,
    'Model No.': machine.itemName || '',
    Remark: '',
    Make: '',
  }))
}

async function appendSerialRows(rows: SerialSheetRecord[]) {
  if (!rows.length) return
  const { worksheetName } = sheetConfig()
  await sheetPost({
    method: 'worksheet.jsondata.append',
    worksheet_name: worksheetName,
    json_data: JSON.stringify(rows),
  })
}

export async function backupGeneratedSerialsToZohoSheet(order: Order, machines: MachineUnit[], date: string): Promise<BackupResult> {
  const result: BackupResult = { synced: 0, skipped: 0, configured: serialSheetConfigured(), errors: [] }
  if (!result.configured) return result
  const serialMachines = machines.filter((machine) => machine.serialNumber)
  if (!serialMachines.length) return result
  try {
    const records = await fetchSerialRecords()
    const existingSerials = new Set(records.map((row: any) => String(row['Serial No.'] || row['Serial No'] || row.Serial || '').trim()).filter(Boolean))
    const newMachines = serialMachines.filter((machine) => !existingSerials.has(String(machine.serialNumber).trim()))
    result.skipped = serialMachines.length - newMachines.length
    const rows = buildRows(order, newMachines, date, nextSerialSheetNumber(records))
    await appendSerialRows(rows)
    result.synced = rows.length
    return result
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : 'Zoho Sheet backup failed')
    return result
  }
}
