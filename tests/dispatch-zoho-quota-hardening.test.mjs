import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const zoho = fs.readFileSync(new URL('../src/lib/zoho.ts', import.meta.url), 'utf8')
const synced = fs.readFileSync(new URL('../src/lib/synced-orders.ts', import.meta.url), 'utf8')
const guard = fs.readFileSync(new URL('../src/lib/dispatch-sync-guard.ts', import.meta.url), 'utf8')
const ordersUi = fs.readFileSync(new URL('../src/components/OrdersClient.tsx', import.meta.url), 'utf8')
const woodenUi = fs.readFileSync(new URL('../src/components/WoodenPackingClient.tsx', import.meta.url), 'utf8')
const readyUi = fs.readFileSync(new URL('../src/components/ReadyToShipClient.tsx', import.meta.url), 'utf8')

test('routine Dispatch sync is one bounded page with bounded selective details', () => {
  const routine = zoho.slice(zoho.indexOf('export async function fetchZohoConfirmedOrders'), zoho.indexOf('async function fetchZohoOrderDetailsInBatches'))
  assert.match(routine, /page=1/)
  assert.match(routine, /Math\.min\(15/)
  assert.doesNotMatch(routine, /for\s*\(let page|has_more_page|fetchCompleteZohoSalesOrderFeed/)
  assert.match(routine, /previous\.zohoLastModifiedTime !== revision/)
})

test('provider business calls reserve budget and 429 opens circuit without retry', () => {
  const get = zoho.slice(zoho.indexOf('async function zohoGet('), zoho.indexOf('function isOpenOrder'))
  assert.match(get, /await consumeDispatchCall\(\)/)
  assert.match(get, /response\.status === 429/)
  assert.match(get, /await openDispatchCircuit/)
  assert.doesNotMatch(get, /setTimeout|for\s*\(/)
  assert.match(guard, /if \(current\.used >= current\.limit\) return current/)
  assert.match(guard, /DISPATCH_ZOHO_DAILY_BUDGET_EXHAUSTED/)
  assert.match(guard, /now \+ raw \* 1000/)
})

test('global durable lease covers routine and per-order manual sync', () => {
  assert.equal((synced.match(/await acquireDispatchLease\(\)/g) || []).length, 2)
  assert.equal((synced.match(/await releaseDispatchLease\(lease\.owner\)/g) || []).length, 2)
  assert.match(guard, /githubWriteJson\(DISPATCH_GUARD_PATH/)
})

test('browser polling reads mirrors and makes zero sync POSTs', () => {
  assert.match(ordersUi, /setInterval\(\(\) => \{ void loadOrders\(false\) \}/)
  assert.doesNotMatch(ordersUi, /setInterval\(\(\) => \{ void syncOrders/)
  assert.match(woodenUi, /setInterval\(\(\) => \{ void loadSaved\(\) \}/)
  assert.doesNotMatch(woodenUi, /setInterval\(\(\) => \{ void syncZoho/)
  assert.doesNotMatch(readyUi, /setInterval\(\(\) => \{ void refresh\(\{ sync: true/)
})

test('incremental sync preserves last-known-good mirror and excludes historical path', () => {
  assert.match(synced, /\.\.\.previous\.orders/)
  assert.match(synced, /fetched: merged/)
  const routine = zoho.slice(zoho.indexOf('export async function fetchZohoConfirmedOrders'), zoho.indexOf('async function fetchZohoOrderDetailsInBatches'))
  assert.doesNotMatch(routine, /500|per_page=200|fetchCompleteZohoSalesOrderFeed/)
})
