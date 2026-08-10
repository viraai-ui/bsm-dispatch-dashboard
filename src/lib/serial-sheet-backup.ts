import type { MachineUnit, Order } from '@/types/domain'
import { githubReadJson, listWorkflows } from './workflow-store'

const DEFAULT_SERIAL_SHEET_ID = 'ryxg17eef99a9ae0441b4bf62c69db2b5640c'
const DEFAULT_SERIAL_WORKSHEET = 'Sr.No.26-27'
const DEFAULT_DATABASE_WORKSHEETS = ['Sr.No.26-27', 'Sr. No.25-26', 'Sr.No.25-26']

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
export type SerialSheetDatabaseResult = { orders: Order[]; warrantyDates: Record<string, string>; configured: boolean; errors: string[] }

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

async function sheetPostWithRetry(params: Record<string, string>, retries = 3) {
  let lastError: unknown
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try { return await sheetPost(params) } catch (error) {
      lastError = error
      if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, attempt * 1200))
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Zoho Sheet request failed')
}

async function fetchSerialRecords(worksheetName = sheetConfig().worksheetName) {
  // Use raw worksheet content instead of tabular records. Zoho's records.fetch can stop
  // around blank rows/manual gaps, which made duplicate protection miss existing serials.
  return fetchSerialContentRecords(worksheetName)
}

async function fetchSerialContentRecords(worksheetName: string) {
  const data = await sheetPostWithRetry({ method: 'worksheet.content.get', worksheet_name: worksheetName, range: 'A1:Z5000' })
  const rows = Array.isArray(data.range_details) ? data.range_details : []
  const headers = new Map<number, string>()
  const records: Record<string, unknown>[] = []
  for (const row of rows) {
    const rowDetails = Array.isArray(row.row_details) ? row.row_details : []
    if (Number(row.row_index) === 1) {
      for (const cell of rowDetails) {
        const header = String(cell.content || '').trim()
        if (header) headers.set(Number(cell.column_index), header)
      }
      continue
    }
    const record: Record<string, unknown> = { row_index: row.row_index }
    for (const cell of rowDetails) {
      const header = headers.get(Number(cell.column_index))
      if (header) record[header] = cell.content
    }
    records.push(record)
  }
  return records
}

async function fetchDatabaseSerialRecords() {
  const configured = process.env.ZOHO_SERIAL_DATABASE_SHEET_NAMES
    ? process.env.ZOHO_SERIAL_DATABASE_SHEET_NAMES.split(',').map((name) => name.trim()).filter(Boolean)
    : DEFAULT_DATABASE_WORKSHEETS
  const records = await Promise.all([...new Set(configured)].map(async (worksheetName) => {
    try { return (await fetchSerialRecords(worksheetName)).map((row: Record<string, unknown>) => ({ ...row, __worksheetName: worksheetName })) } catch { return [] }
  }))
  return records.flat()
}

export async function listSerialSheetDatabaseOrders(existingSerials = new Set<string>()): Promise<SerialSheetDatabaseResult> {
  const result: SerialSheetDatabaseResult = { orders: [], warrantyDates: {}, configured: serialSheetConfigured(), errors: [] }
  if (!result.configured) return result
  try {
    const records = await fetchDatabaseSerialRecords()
    const usedIds = new Set<string>()
    const seenSerials = new Set(existingSerials)
    for (const row of records) {
      const sNo = String(sheetValue(row, ['S.No.', 'S.No', 'S No', 'SNo', 's_no']) ?? '').trim()
      const serialNumber = String(sheetValue(row, ['Serial No.', 'Serial No', 'Serial']) || legacySerialFromRow(row, sNo)).trim()
      if (!serialNumber || seenSerials.has(serialNumber)) continue
      seenSerials.add(serialNumber)
      const id = uniqueId(`serial-sheet-${safeId(serialNumber || sNo)}`, usedIds)
      const customerName = String(sheetValue(row, ['Company Name', 'Company', 'Customer']) || '').trim() || 'Legacy customer'
      const address = String(sheetValue(row, ['Address']) || '').trim()
      const dispatchDate = parseSheetDate(String(sheetValue(row, ['D.O.P.', 'D.O.P', 'DOP', 'D.O.P ', 'Date', 'Delivery Date']) || '').trim())
      const itemName = String(sheetValue(row, ['Model No.', 'Model', 'Machine Name']) || '').trim() || 'Machine'
      const vendor = titleCaseVendor(String(sheetValue(row, ['Make', 'Vendor']) || '').trim())
      const machine: MachineUnit = {
        id: `${id}-unit`,
        unitNumber: 1,
        serialNumber,
        qrToken: serialNumber,
        orderId: id,
        lineItemId: `${id}-line`,
        itemName,
        sku: '',
        customerName,
        salesOrderNumber: `SERIAL-${serialNumber}`,
        deliveryDate: dispatchDate,
        status: 'Dispatched',
        selectedForBatch: false,
        woodenPacking: 'Not Required',
        qrPasted: true,
        qcDone: true,
        mediaPhotos: 0,
        mediaVideos: 0,
        warrantyStart: dispatchDate,
        vendor,
      }
      result.orders.push({
        id,
        zohoSalesOrderId: id,
        salesOrderNumber: `SERIAL-${serialNumber}`,
        status: 'open',
        customerName,
        shippingAddress: address,
        deliveryDate: dispatchDate,
        dashboardStatus: 'Dispatched',
        reviewRequired: false,
        lineItems: [{ id: `${id}-line`, itemName, sku: '', quantity: 1, pendingQuantity: 0, woodenPackingRequired: false, dispatchCategory: 'machine', description: String(sheetValue(row, ['Remark']) || '').trim() }],
        machines: [machine],
      })
      result.warrantyDates[id] = dispatchDate
    }
    result.orders.sort((a, b) => serialValue(b) - serialValue(a))
    return result
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : 'Zoho Sheet database import failed')
    return result
  }
}

function sheetValue(row: Record<string, unknown>, names: string[]) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== null) return row[name]
    const normalized = normalizeSheetKey(name)
    const match = Object.keys(row).find((key) => normalizeSheetKey(key) === normalized)
    if (match && row[match] !== undefined && row[match] !== null) return row[match]
  }
  return ''
}

function normalizeSheetKey(value: string) { return value.toLowerCase().replace(/[^a-z0-9]/g, '') }
function legacySerialFromRow(row: Record<string, unknown>, sNo: string) {
  const worksheetName = String(row.__worksheetName || '')
  const serial = Number(String(sNo || '').replace(/[^0-9]/g, ''))
  if (!serial || !/25\s*-\s*26/.test(worksheetName)) return ''
  return `2526${String(serial).padStart(4, '0')}`
}
function serialValue(order: Order) { return Number(String(order.machines[0]?.serialNumber || order.salesOrderNumber || '').replace(/[^0-9]/g, '')) || 0 }

function parseSheetDate(value: string) {
  const clean = value.replace(/^'/, '').trim()
  if (/^\d{4,6}$/.test(clean)) return excelSerialDate(Number(clean))
  const monthMatch = clean.match(/^(\d{1,2})[-\s/]([a-z]{3,9})[-\s/](\d{2,4})$/i)
  if (monthMatch) {
    const [, dd, mon, yy] = monthMatch
    const month = monthNumber(mon)
    const year = yy.length === 2 ? `20${yy}` : yy
    if (month) return `${year}-${String(month).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
  }
  const match = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (!match) return clean
  const [, mm, dd, yy] = match
  const year = yy.length === 2 ? `20${yy}` : yy
  return `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
}

function excelSerialDate(serial: number) {
  const epoch = Date.UTC(1899, 11, 30)
  const date = new Date(epoch + serial * 24 * 60 * 60 * 1000)
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function monthNumber(value: string) {
  const key = value.slice(0, 3).toLowerCase()
  return ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(key) + 1
}

function titleCaseVendor(value: string) {
  return value.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
}

function safeId(value: string) { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'row' }
function uniqueId(base: string, used: Set<string>) { let id = base; let count = 2; while (used.has(id)) id = `${base}-${count++}`; used.add(id); return id }

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
  return `'${String(safe.getDate()).padStart(2, '0')}-${String(safe.getMonth() + 1).padStart(2, '0')}-${String(safe.getFullYear()).slice(-2)}`
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
    Make: titleCaseVendor(machine.vendor || ''),
  }))
}

async function fetchWorksheetContent(worksheetName: string) {
  const data = await sheetPostWithRetry({ method: 'worksheet.content.get', worksheet_name: worksheetName, range: 'A1:Z5000' })
  return Array.isArray(data.range_details) ? data.range_details : []
}

function headerMapFromContent(rows: any[]) {
  const headers = new Map<string, number>()
  const first = rows.find((row) => Number(row.row_index) === 1)
  for (const cell of first?.row_details || []) {
    const header = String(cell.content || '').trim()
    if (header) headers.set(normalizeSheetKey(header), Number(cell.column_index))
  }
  return headers
}

async function setCellContent(worksheetName: string, row: number, column: number, content: string) {
  await sheetPostWithRetry({ method: 'cell.content.set', worksheet_name: worksheetName, row: String(row), column: String(column), content })
}

export async function updateSerialVendorsInZohoSheet(machines: MachineUnit[]): Promise<BackupResult> {
  const result: BackupResult = { synced: 0, skipped: 0, configured: serialSheetConfigured(), errors: [] }
  if (!result.configured) return result
  const updates = machines.map((machine) => ({ serial: String(machine.serialNumber || '').trim(), vendor: titleCaseVendor(machine.vendor || '') })).filter((item) => item.serial && item.vendor)
  if (!updates.length) return result
  try {
    const { worksheetName } = sheetConfig()
    const rows = await fetchWorksheetContent(worksheetName)
    const headers = headerMapFromContent(rows)
    const serialColumn = headers.get(normalizeSheetKey('Serial No.')) || headers.get(normalizeSheetKey('Serial No'))
    const makeColumn = headers.get(normalizeSheetKey('Make'))
    if (!serialColumn || !makeColumn) throw new Error('Serial No. or Make column not found in serial sheet')
    const bySerial = new Map(updates.map((item) => [item.serial, item.vendor]))
    for (const row of rows) {
      const rowIndex = Number(row.row_index)
      if (rowIndex <= 1) continue
      const serialCell = (row.row_details || []).find((cell: any) => Number(cell.column_index) === serialColumn)
      const serial = String(serialCell?.content || '').trim()
      const vendor = bySerial.get(serial)
      if (!vendor) continue
      await setCellContent(worksheetName, rowIndex, makeColumn, vendor)
      result.synced += 1
      bySerial.delete(serial)
    }
    result.skipped = bySerial.size
    return result
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : 'Zoho Sheet vendor update failed')
    return result
  }
}

async function appendSerialRows(rows: SerialSheetRecord[]) {
  if (!rows.length) return
  const { worksheetName } = sheetConfig()
  await sheetPostWithRetry({
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

export async function syncMissingGeneratedSerialsToZohoSheet(minSerial = 26270758): Promise<BackupResult> {
  const result: BackupResult = { synced: 0, skipped: 0, configured: serialSheetConfigured(), errors: [] }
  if (!result.configured) return result
  try {
    const workflows = await listWorkflows()
    const synced = await githubReadJson<{ orders: Record<string, Order> }>('data/synced-confirmed-orders-store.json', { orders: {} })
    for (const workflow of Object.values(workflows)) {
      const order = workflow.processedOrder || synced.data.orders?.[workflow.salesOrderId]
      if (!order) continue
      const orderMachinesById = new Map((order.machines || []).map((machine) => [machine.id, machine]))
      const machines: MachineUnit[] = []
      let generatedAt = new Date().toISOString().slice(0, 10)
      for (const machineWorkflow of Object.values(workflow.machines || {})) {
        const serial = Number(machineWorkflow.serialNumber || 0)
        if (!serial || serial <= minSerial) continue
        const orderMachine = orderMachinesById.get(machineWorkflow.machineUnitId)
        if (!orderMachine) continue
        generatedAt = machineWorkflow.qrGeneratedAt || generatedAt
        machines.push({ ...orderMachine, serialNumber: String(machineWorkflow.serialNumber), qrToken: machineWorkflow.qrToken || String(machineWorkflow.serialNumber) })
      }
      if (!machines.length) continue
      const backup = await backupGeneratedSerialsToZohoSheet(order, machines, generatedAt)
      result.synced += backup.synced
      result.skipped += backup.skipped
      result.errors.push(...backup.errors)
    }
    return result
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : 'Zoho Sheet serial sync failed')
    return result
  }
}
