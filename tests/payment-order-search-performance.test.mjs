import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { performance } from 'node:perf_hooks'

const root = new URL('../', import.meta.url)

test('payment order index covers 7,500+, newest endpoint is compact, and search reaches beyond ten', async () => {
  const snapshot = JSON.parse(await readFile(new URL('data/payment-order-index.json', root), 'utf8'))
  assert.ok(snapshot.orders.length >= 7500)
  const initial = snapshot.orders.slice(0, 10)
  assert.equal(initial.length, 10)
  assert.ok(Buffer.byteLength(JSON.stringify({ orders: initial })) < 5000)
  const target = snapshot.orders[1000]
  const needle = `${target[1]} ${target[2]}`.toLowerCase().replace(/\s+/g, '')
  const samples = []
  for (let run = 0; run < 100; run++) {
    const start = performance.now()
    const found = snapshot.orders.filter((row) => `${row[1]} ${row[2]}`.toLowerCase().replace(/\s+/g, '').includes(needle)).slice(0, 25)
    samples.push(performance.now() - start); assert.ok(found.some((row) => row[0] === target[0]))
  }
  samples.sort((a, b) => a - b)
  assert.ok(samples[94] < 50, `p95 ${samples[94].toFixed(2)}ms`)
})

test('API and clients use bounded indexed server search, debounce, cancellation, cache and single-flight refresh', async () => {
  const [service, api, publicUi, internalUi] = await Promise.all(['src/lib/payment-order-search.ts', 'src/app/api/public/payments/orders/route.ts', 'src/app/submit-payment/PublicPaymentForm.tsx', 'src/components/PaymentsClient.tsx'].map((path) => readFile(new URL(path, root), 'utf8')))
  assert.match(service, /refreshFlight/); assert.match(service, /githubWriteJson\(STORE_PATH/); assert.match(service, /filter\(\(order\) => order\.search\.includes/)
  assert.match(api, /limit.*10/); assert.match(api, /Server-Timing/)
  for (const ui of [publicUi, internalUi]) { assert.match(ui, /225/); assert.match(ui, /AbortController/); assert.match(ui, /8_000/); assert.match(ui, /Map</) }
  assert.doesNotMatch(`${publicUi}\n${internalUi}`, /setOrders\([^)]*7568/)
})