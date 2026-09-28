// Pure, shared safety rules for the cron and the operator's dry-run/backfill tool.
export type SheetCell = { column_index: number; content?: unknown }
export type SheetRow = { row_index: number; row_details?: SheetCell[] }
export type VendorSource = { serial: string; vendor: string }
export const cleanVendor = (value: unknown) => String(value ?? '').trim()
export const vendorEqual = (a: unknown, b: unknown) => cleanVendor(a).toLowerCase() === cleanVendor(b).toLowerCase()
export const normalizeHeader = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')

export function exactSheetHeaders(rows: SheetRow[]) {
  const headers = new Map<string, { raw: string; column: number }>()
  for (const cell of rows.find(row => Number(row.row_index) === 1)?.row_details || []) {
    const raw = String(cell.content ?? '')
    if (!raw.trim()) continue
    const key = normalizeHeader(raw)
    if (headers.has(key)) throw new Error(`Ambiguous Sheet header: ${raw}`)
    headers.set(key, { raw, column: Number(cell.column_index) })
  }
  return headers
}

export function exactAppendRows(rows: Record<string, unknown>[], content: SheetRow[]) {
  const headers = exactSheetHeaders(content)
  return rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => {
    const header = headers.get(normalizeHeader(key))
    if (!header) throw new Error(`Missing Sheet header: ${key}`)
    return [header.raw, value]
  })))
}

// Only an explicit workflow choice or its processed snapshot is authoritative.
// An explicitly empty workflow value is intentional/unknown; Inventory is never a fallback.
export function workflowVendor(workflow: { vendor?: string }, processed?: { vendor?: string }) {
  return cleanVendor(workflow.vendor !== undefined ? workflow.vendor : processed?.vendor)
}

export function planVendorUpdates(rows: SheetRow[], sources: VendorSource[], limit = 20) {
  const headers = exactSheetHeaders(rows)
  const serialColumn = headers.get(normalizeHeader('Serial No.'))?.column
  const makeColumn = headers.get(normalizeHeader('Make'))?.column
  if (!serialColumn || !makeColumn) throw new Error('Serial No. or Make column not found in serial sheet')
  const bySerial = new Map<string, SheetRow[]>()
  for (const row of rows) {
    if (Number(row.row_index) <= 1) continue
    const serial = cleanVendor(row.row_details?.find(cell => Number(cell.column_index) === serialColumn)?.content)
    if (serial) bySerial.set(serial, [...(bySerial.get(serial) || []), row])
  }
  const sourceCounts = new Map<string, number>()
  for (const source of sources) sourceCounts.set(source.serial, (sourceCounts.get(source.serial) || 0) + 1)
  const updates: { serial: string; vendor: string; row: number; column: number }[] = []
  const outcomes: { serial: string; status: 'verified' | 'unknown' | 'conflict' | 'missing' | 'pending'; error?: string }[] = []
  for (const source of sources) {
    const vendor = cleanVendor(source.vendor)
    const physical = bySerial.get(source.serial) || []
    if (sourceCounts.get(source.serial)! > 1 || physical.length > 1) {
      outcomes.push({ serial: source.serial, status: 'conflict', error: `${source.serial}: duplicate source or physical Sheet rows; no write` }); continue
    }
    if (!vendor) { outcomes.push({ serial: source.serial, status: 'unknown' }); continue }
    if (!physical.length) { outcomes.push({ serial: source.serial, status: 'missing' }); continue }
    const row = physical[0]
    const actual = cleanVendor(row.row_details?.find(cell => Number(cell.column_index) === makeColumn)?.content)
    if (actual) {
      outcomes.push(vendorEqual(actual, vendor) ? { serial: source.serial, status: 'verified' } : { serial: source.serial, status: 'conflict', error: `${source.serial}: nonblank manual Make differs from workflow; preserved` })
    } else {
      outcomes.push({ serial: source.serial, status: 'pending' })
      if (updates.length < limit) updates.push({ serial: source.serial, vendor, row: Number(row.row_index), column: makeColumn })
    }
  }
  return { updates, outcomes }
}
