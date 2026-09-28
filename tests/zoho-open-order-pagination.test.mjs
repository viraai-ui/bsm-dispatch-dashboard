import assert from 'node:assert/strict'
import test from 'node:test'
import { fetchCompleteZohoSalesOrderFeed, isOpenZohoSalesOrderSummary } from '../src/lib/zoho-sales-order-feed.ts'

const row = (id, fields = {}) => ({ salesorder_id: id, status: 'confirmed', ...fields })

test('complete feed follows pagination metadata, preserves old pages, and deduplicates IDs', async () => {
  const requested = []
  const pages = {
    1: { salesorders: [row('new'), row('duplicate')], page_context: { page: 1, has_more_page: true } },
    2: { salesorders: [row('duplicate'), row('old')], page_context: { page: 2, has_more_page: false } },
  }
  const result = await fetchCompleteZohoSalesOrderFeed(async (page) => {
    requested.push(page)
    return pages[page]
  })
  assert.deepEqual(requested, [1, 2])
  assert.deepEqual(result.map((item) => item.salesorder_id), ['new', 'duplicate', 'old'])
})

test('complete feed fails closed on partial, malformed, or mismatched pagination', async () => {
  await assert.rejects(() => fetchCompleteZohoSalesOrderFeed(async () => ({ salesorders: [], page_context: { page: 1, has_more_page: true } })), /stopped early/)
  await assert.rejects(() => fetchCompleteZohoSalesOrderFeed(async () => ({ salesorders: null, page_context: { page: 1, has_more_page: false } })), /Invalid Zoho/)
  await assert.rejects(() => fetchCompleteZohoSalesOrderFeed(async () => ({ salesorders: [row('x')], page_context: { page: 9, has_more_page: false } })), /Unexpected Zoho pagination/)
  await assert.rejects(() => fetchCompleteZohoSalesOrderFeed(async (page) => ({ salesorders: [row(String(page))], page_context: { page, has_more_page: true } }), 2), /limit reached/)
})

test('status reconciliation keeps genuine old open orders and removes every terminal variant', () => {
  for (const status of ['confirmed', 'open', 'partially_fulfilled']) assert.equal(isOpenZohoSalesOrderSummary(row('x', { status })), true, status)
  for (const status of ['closed', 'void', 'cancelled', 'canceled', 'rejected', 'deleted']) assert.equal(isOpenZohoSalesOrderSummary(row('x', { status })), false, status)
  assert.equal(isOpenZohoSalesOrderSummary(row('x', { shipment_status: 'shipped' })), false)
  assert.equal(isOpenZohoSalesOrderSummary(row('x', { shipment_status: 'delivered' })), false)
  assert.equal(isOpenZohoSalesOrderSummary(row('x', { invoiced_status: 'invoiced' })), false)
  assert.equal(isOpenZohoSalesOrderSummary(row('x', { shipment_status: 'partially_shipped', invoiced_status: 'partially_invoiced' })), true)
  assert.equal(isOpenZohoSalesOrderSummary({ salesorder_id: 'x', status: '', current_sub_status: 'closed' }), false)
})
