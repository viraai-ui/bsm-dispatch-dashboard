import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { issueSubmissionToken, verifySubmissionToken, sameOrigin } from '../src/lib/public-payment-security.ts'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('public payment page and only dedicated facade are unauthenticated', async () => {
  const [proxy, lookup, submit, internal] = await Promise.all([read('../src/proxy.ts'), read('../src/app/api/public/payments/orders/route.ts'), read('../src/app/api/public/payments/route.ts'), read('../src/app/api/payments/route.ts')])
  assert.match(proxy, /explicitlyPublicRoutes = \['\/submit-payment'\]/)
  assert.doesNotMatch(lookup, /requireUser/)
  assert.doesNotMatch(submit, /requireUser/)
  assert.match(internal, /requireUser\(\['Admin', 'Accounts'\]\)/)
  assert.match(internal, /requireUser\(\['Admin'\]\)/)
})

test('lookup is minimum-field, read-only and never touches operational APIs/stores', async () => {
  const route = await read('../src/app/api/public/payments/orders/route.ts')
  assert.match(route, /listPaymentOpenSalesOrders\(false\)/)
  assert.match(route, /id, salesOrderNumber, customerName/)
  assert.doesNotMatch(route, /api\/orders|syncConfirmed|workflow|writeSynced|githubRequest/)
})

test('submission enforces open SO, server-owned identity/status, anti-abuse and notifications', async () => {
  const [route, store] = await Promise.all([read('../src/app/api/public/payments/route.ts'), read('../src/lib/payments.ts')])
  for (const contract of [/sameOrigin/, /checkRateLimit/, /verifySubmissionToken/, /website/, /idempotency-key/, /MAX_BODY/, /listPaymentOpenSalesOrders\(false\)/, /item\.id === orderId/, /createPaymentNotifications/, /notifyAccountsOfNewPayment/]) assert.match(route, contract)
  assert.match(store, /createdBy: 'public-salesman'/)
  assert.match(store, /status: 'Pending'/)
  assert.match(store, /idempotencyKey === idempotencyKey/)
  assert.doesNotMatch(route, /customerName = value\(body/)
  assert.doesNotMatch(route, /api\/orders|workflow|serial|packaging|dispatch/)
})

test('signed token validates and origin rejects foreign sites', () => {
  const token = issueSubmissionToken()
  assert.equal(verifySubmissionToken(token), true)
  assert.equal(verifySubmissionToken(`${token}x`), false)
  assert.equal(sameOrigin(new Request('https://dispatch.bsmindia.com/api/public/payments', { headers: { origin: 'https://evil.example' } })), false)
  assert.equal(sameOrigin(new Request('https://dispatch.bsmindia.com/api/public/payments', { headers: { origin: 'https://dispatch.bsmindia.com' } })), true)
})

test('public screenshot target is image-only, bounded, short-lived and isolated prefix', async () => {
  const route = await read('../src/app/api/public/payments/upload-target/route.ts')
  assert.match(route, /image\/jpeg/); assert.match(route, /10 \* 1024 \* 1024/)
  assert.match(route, /payments\/public\//); assert.match(route, /createR2UploadTarget\(key, type, 300/)
  assert.match(route, /sameOrigin/); assert.match(route, /verifySubmissionToken/); assert.match(route, /checkRateLimit/)
})

test('mobile UI contract has decimal text input, 44px targets and narrow breakpoint', async () => {
  const [client, css] = await Promise.all([read('../src/app/submit-payment/PublicPaymentForm.tsx'), read('../src/app/submit-payment/submit-payment.module.css')])
  assert.match(client, /type="text" inputMode="decimal"/)
  assert.doesNotMatch(client, /type="number"/)
  assert.match(css, /min-height:48px/); assert.match(css, /@media\(max-width:340px\)/)
  assert.doesNotMatch(client, /payment history|notification|status history/i)
})
