import { Pool } from 'pg'
import { exactSheetHeaders, planVendorUpdates, type SheetRow, type VendorSource } from './serial-sheet-vendors'

export const SHEET_INTERVAL_MS = 1200
export const SHEET_COOLDOWN_MS = 310_000
export function isSheetQuota(error: any) {
  return Number(error?.code) === 2950 || error?.status === 429 || /quota|request limit|usage limit|rate limit|too many requests|cooldown/i.test(error?.message || '')
}
let pool: Pool | undefined
let ready: Promise<unknown> | undefined
// Autocommit connection: reservations/cooldowns survive the writer lock's rollback
// and coordinate serverless instances, including participating database readers.
async function ratePool() {
  const connectionString = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL
  if (!connectionString) throw new Error('Sheet rate budget requires database')
  pool ||= new Pool({ connectionString, max: 2, connectionTimeoutMillis: 10000, idleTimeoutMillis: 10000 })
  ready ||= pool.query('CREATE TABLE IF NOT EXISTS serial_sheet_rate_budget (document text PRIMARY KEY, next_at bigint NOT NULL DEFAULT 0, cooldown_until bigint NOT NULL DEFAULT 0)').catch(error => { ready = undefined; throw error })
  await ready
  return pool
}
export async function reserveSheetCall(document: string) {
  const db = await ratePool()
  const now = Date.now()
  const result = await db.query(`INSERT INTO serial_sheet_rate_budget(document,next_at) VALUES($1,$2::bigint + $3::bigint)
    ON CONFLICT(document) DO UPDATE SET next_at = GREATEST(serial_sheet_rate_budget.next_at,$2::bigint) + $3::bigint
    WHERE serial_sheet_rate_budget.cooldown_until <= $2::bigint
    RETURNING next_at`, [document, now, SHEET_INTERVAL_MS])
  if (!result.rows.length) throw new Error('Zoho Sheet quota cooldown active; retry next cron')
  const wait = Number(result.rows[0].next_at) - SHEET_INTERVAL_MS - Date.now()
  if (wait > 10000) throw new Error('Zoho Sheet rate budget busy; retry next cron')
  if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait))
}
export async function coolDownSheet(document: string) {
  const db = await ratePool()
  await db.query(`INSERT INTO serial_sheet_rate_budget(document,cooldown_until) VALUES($1,$2)
    ON CONFLICT(document) DO UPDATE SET cooldown_until = GREATEST(serial_sheet_rate_budget.cooldown_until,$2)`, [document, Date.now() + SHEET_COOLDOWN_MS])
}

export async function reconcileVendorRanges(before: SheetRow[], sources: VendorSource[], worksheet: string, post: (params: Record<string,string>) => Promise<any>) {
  // At most four groups / twenty cells per tick: <=12 targeted API calls.
  const plan = planVendorUpdates(before, sources, 20)
  const headers = exactSheetHeaders(before)
  const serialColumn = headers.get('serialno')!.column
  const groups: typeof plan.updates[] = []
  for (const update of [...plan.updates].sort((a,b) => a.row-b.row)) {
    const previous = groups.at(-1)
    if (previous && previous.at(-1)!.row + 1 === update.row) previous.push(update)
    else groups.push([update])
  }
  const observed = new Map(before.map(row => [Number(row.row_index), row]))
  let updated = 0
  const errors: string[] = []
  for (const group of groups.slice(0,4)) {
    const params = { method: 'range.content.get', worksheet_name: worksheet, start_row: String(group[0].row), end_row: String(group.at(-1)!.row), start_column: String(Math.min(serialColumn,group[0].column)), end_column: String(Math.max(serialColumn,group[0].column)) }
    try {
      const fresh = await post(params)
      if (!Array.isArray(fresh.range_details)) throw new Error('Vendor range response missing rows')
      for (const row of fresh.range_details) observed.set(Number(row.row_index), row)
      const current = planVendorUpdates([before.find(row => Number(row.row_index) === 1)!, ...fresh.range_details], group)
      // Do not split a raced group into unbounded calls. Rediscover next tick.
      if (current.updates.length !== group.length || current.updates.some((item,i) => item.row !== group[i].row)) continue
      await post({ method: 'worksheet.csvdata.set', worksheet_name: worksheet, row: String(group[0].row), column: String(group[0].column), ignore_empty: 'true', data: group.map(item => '"' + item.vendor.replaceAll('"','""') + '"').join('\n') })
      const readback = await post(params)
      if (!Array.isArray(readback.range_details)) throw new Error('Vendor verification response missing rows')
      // Missing readback cells must not inherit pre-write verified state.
      for (const item of group) observed.delete(item.row)
      for (const row of readback.range_details) observed.set(Number(row.row_index), row)
      const verified = planVendorUpdates([before.find(row => Number(row.row_index) === 1)!, ...readback.range_details], group)
      updated += verified.outcomes.filter(item => item.status === 'verified').length
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Vendor reconciliation failed')
      break // no blind write retry, preserve successful groups and untouched outcomes
    }
  }
  return { outcomes: planVendorUpdates([...observed.values()], sources).outcomes, updated, errors }
}
