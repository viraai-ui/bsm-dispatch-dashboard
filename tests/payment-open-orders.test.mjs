import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { isOpenZohoSalesOrder } from '../src/lib/open-sales-orders.ts'
import { filterPaymentOrderSuggestions, paymentOrderStatus } from '../src/lib/payment-order-lookup.ts'

const order = (status) => ({ id: 'zoho-1', salesOrderNumber: 'SO-1', status })

test('payment suggestions include open Zoho orders and reject terminal statuses', () => {
  assert.equal(isOpenZohoSalesOrder(order('open')), true)
  assert.equal(isOpenZohoSalesOrder(order('draft')), true)
  for (const status of ['closed', 'void', 'cancelled', 'canceled', 'shipped', 'partially_shipped', 'invoiced']) {
    assert.equal(isOpenZohoSalesOrder(order(status)), false, status)
  }
  assert.equal(isOpenZohoSalesOrder({ ...order('open'), id: 'manual-serial-1' }), false)
})

test('payment display maps every terminal variant and keeps unknown neutral', () => {
  for (const status of ['closed', 'void', 'cancelled', 'canceled', 'shipped', 'invoiced', 'Partially_Shipped and invoiced']) assert.equal(paymentOrderStatus(status), 'Closed', status)
  for (const status of ['open', 'draft', 'confirmed']) assert.equal(paymentOrderStatus(status), 'Open', status)
  assert.equal(paymentOrderStatus('unexpected-future-state'), 'Status unknown')
  assert.equal(paymentOrderStatus('not_invoiced'), 'Status unknown')
  assert.equal(paymentOrderStatus('not_shipped'), 'Status unknown')
  assert.equal(paymentOrderStatus(''), 'Status unknown')
})

test('blank lookup renders newest first 10 while full set is space/case tolerant searchable', () => {
  const orders = Array.from({ length: 15 }, (_, index) => ({ id: String(index), salesOrderNumber: `SO ${index}`, customerName: index === 14 ? 'Acme Industries' : `Customer ${index}`, status: 'Open', rawStatus: 'confirmed' }))
  assert.deepEqual(filterPaymentOrderSuggestions(orders, '').map((item) => item.id), orders.slice(0, 10).map((item) => item.id))
  assert.equal(filterPaymentOrderSuggestions(orders, '  aCmE   indUstries ')[0].id, '14')
  assert.equal(filterPaymentOrderSuggestions(orders, ' s o 1 4 ')[0].id, '14')
})

test('payment screenshot upload target persists directly to Cloudflare R2', async () => {
  const route = await readFile(new URL('../src/app/api/payments/upload-target/route.ts', import.meta.url), 'utf8')
  const client = await readFile(new URL('../src/components/PaymentsClient.tsx', import.meta.url), 'utf8')
  assert.match(route, /from '@\/lib\/r2'/)
  assert.match(route, /createR2UploadTarget/)
  assert.match(route, /`payments\//)
  assert.match(route, /manual\/\$\{issued\.scope\}/)
  assert.doesNotMatch(route, /customerName/)
  assert.match(client, /targetJson\.data\.uploadUrl/)
  assert.match(client, /targetJson\.data\.uploadContentType/)
  assert.match(client, /uploadScope = targetJson\.data\.uploadScope;[\s\S]{0,500}attachments\.push\(\{ key: targetJson\.data\.key, name: file\.name \}\)/)
  assert.match(client, /for \(const file of files\) await uploadOne\(file\)/)
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