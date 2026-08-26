import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { isOpenZohoSalesOrder } from '../src/lib/open-sales-orders.ts'

const order = (status) => ({ id: 'zoho-1', salesOrderNumber: 'SO-1', status })

test('payment suggestions include open Zoho orders and reject terminal statuses', () => {
  assert.equal(isOpenZohoSalesOrder(order('open')), true)
  assert.equal(isOpenZohoSalesOrder(order('draft')), true)
  for (const status of ['closed', 'void', 'cancelled', 'canceled', 'shipped', 'partially_shipped', 'invoiced']) {
    assert.equal(isOpenZohoSalesOrder(order(status)), false, status)
  }
  assert.equal(isOpenZohoSalesOrder({ ...order('open'), id: 'manual-serial-1' }), false)
})

test('payment screenshot upload target persists directly to Cloudflare R2', async () => {
  const route = await readFile(new URL('../src/app/api/payments/upload-target/route.ts', import.meta.url), 'utf8')
  const client = await readFile(new URL('../src/components/PaymentsClient.tsx', import.meta.url), 'utf8')
  assert.match(route, /from '@\/lib\/r2'/)
  assert.match(route, /createR2UploadTarget/)
  assert.match(route, /`payments\//)
  assert.match(client, /targetJson\.data\.uploadUrl/)
  assert.match(client, /screenshotKey: targetJson\.data\.key/)
})

test('payment state cannot feed operational Orders and generated workflow is durable before success', async () => {
  const ordersRoute = await readFile(new URL('../src/app/api/orders/route.ts', import.meta.url), 'utf8')
  const paymentsRoute = await readFile(new URL('../src/app/api/payments/route.ts', import.meta.url), 'utf8')
  const client = await readFile(new URL('../src/components/OrdersClient.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(ordersRoute, /payment/i)
  assert.doesNotMatch(paymentsRoute, /workflow|order-stage|media-proof|syncConfirmedOrders/)
  const save = client.indexOf("await saveWorkflow(order.id, { action: 'generate'")
  const success = client.indexOf("setMessage('Serial and workflow saved;")
  assert.ok(save >= 0 && success > save, 'generation workflow must persist before success')
  assert.doesNotMatch(client.slice(save, success), /void saveWorkflow/)
})