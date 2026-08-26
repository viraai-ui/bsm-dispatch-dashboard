import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('payment amount and mode are persisted and validated', async () => {
  const store = await readFile(new URL('../src/lib/payments.ts', import.meta.url), 'utf8')
  const route = await readFile(new URL('../src/app/api/payments/route.ts', import.meta.url), 'utf8')
  assert.match(store, /paymentAmount\?: number/)
  assert.match(store, /paymentMode\?: PaymentMode/)
  assert.match(route, /paymentAmount <= 0/)
  assert.match(route, /PAYMENT_MODES\.includes\(paymentMode\)/)
  assert.match(route, /createPayment\(\{ customerName, salesOrderNumber, paymentAmount, paymentMode,/)
})

test('payment form follows required order and list exposes responsive details', async () => {
  const client = await readFile(new URL('../src/components/PaymentsClient.tsx', import.meta.url), 'utf8')
  const labels = ['Sales Order Number', 'Customer Name', 'Payment Amount', 'Payment Mode', 'Payment Screenshot']
  let previous = -1
  for (const label of labels) {
    const index = client.lastIndexOf(`<label>${label}`)
    assert.ok(index > previous, `${label} should follow the preceding field`)
    previous = index
  }
  assert.match(client, /readOnly value=\{customerName\}/)
  assert.match(client, /data-label="Amount"/)
  assert.match(client, /data-label="Mode"/)
  assert.match(client, /targetJson\.data\.uploadUrl/)
})