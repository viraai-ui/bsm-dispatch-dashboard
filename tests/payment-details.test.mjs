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
  const labels = ['Sales Order Number', 'Customer Name', 'Payment Amount', 'Payment Mode']
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

test('payment amount has no number controls and screenshot optional marker stays inline', async () => {
  const client = await readFile(new URL('../src/components/PaymentsClient.tsx', import.meta.url), 'utf8')
  const css = await readFile(new URL('../src/app/globals.css', import.meta.url), 'utf8')
  const amountInput = client.match(/<input required type="text" inputMode="decimal"[^>]+value=\{paymentAmount\}/)?.[0] || ''

  assert.ok(amountInput, 'payment amount should use a decimal text input')
  assert.doesNotMatch(amountInput, /type="number"/)
  assert.match(client, /<span className="payment-field-label">Payment Screenshot <span className="field-help">\(optional\)<\/span><\/span><input type="file"/)
  assert.match(css, /\.payment-field-label,\.payment-field-label \.field-help\{display:inline\}/)
})