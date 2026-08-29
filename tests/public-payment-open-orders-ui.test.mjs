import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('public Payments header and sync are compact and accessible', async () => {
  const [ui, css] = await Promise.all([read('../src/app/submit-payment/PublicPaymentForm.tsx'), read('../src/app/submit-payment/submit-payment.module.css')])
  assert.match(ui, /<p className=\{styles\.eyebrow\}>Finance<\/p><h1>Payments<\/h1>/)
  assert.match(ui, /Submit customer payments and wait for approval\./)
  assert.doesNotMatch(ui, />BSM<|>India</)
  assert.match(ui, /title="Sync sales orders" aria-label="Sync sales orders"/)
  assert.match(css, /\.sync\{width:44px;height:44px/)
})

test('public sales-order suggestions load without typing and refresh safely', async () => {
  const [ui, api, service, zoho] = await Promise.all([
    read('../src/app/submit-payment/PublicPaymentForm.tsx'),
    read('../src/app/api/public/payments/orders/route.ts'),
    read('../src/lib/payment-open-sales-orders.ts'),
    read('../src/lib/zoho.ts'),
  ])
  assert.match(ui, /function openPaymentForm\(\) \{ resetPaymentForm\(\); setOpen\(true\); modalHistory[\s\S]*void loadForm\(\)/)
  assert.doesNotMatch(ui, /function openPaymentForm\(\)[^{]*\{[^}]*setSuggestionsOpen\(true\)/)
  assert.match(ui, /new AbortController\(\)/)
  assert.match(ui, /generation !== requestGeneration\.current/)
  assert.match(ui, /controller\.abort\('timeout'\)/)
  assert.match(ui, /addEventListener\('popstate'/)
  assert.match(ui, /onFocus=\{showSuggestions\} onClick=\{showSuggestions\}/)
  assert.match(ui, /suggestionsOpen && !selected/)
  assert.match(ui, /setTimeout\(\(\) => void loadForm\(false, search\), search \? 225 : 0\)/)
  assert.match(ui, /params\.set\('refresh', '1'\)/)
  assert.match(ui, /cache: 'no-store'/)
  assert.match(api, /searchPaymentOrders\(q, limit\)/)
  assert.match(service, /fetchZohoPaymentOpenOrders/)
  assert.doesNotMatch(`${ui}\n${api}\n${service}`, /fetch\(['"]\/api\/orders|writeSyncedOrdersStore|syncConfirmedOrders|packaging|dispatch/)
  assert.match(zoho, /page <= 500[\s\S]*per_page=200[\s\S]*has_more_page/)
})
