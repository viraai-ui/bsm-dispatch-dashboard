import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { issueSubmissionToken, verifySubmissionToken, sameOrigin } from '../src/lib/public-payment-security.ts'
import { paymentScreenshotType, PUBLIC_PAYMENT_SCREENSHOT_MAX_BYTES } from '../src/lib/payment-screenshot.ts'

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
  assert.match(route, /paymentScreenshotType/); assert.match(route, /PUBLIC_PAYMENT_SCREENSHOT_MAX_BYTES/)
  assert.match(route, /payments\/public\//); assert.match(route, /createR2UploadTarget\(key, image\.mimeType, 300/)
  assert.match(route, /sameOrigin/); assert.match(route, /verifySubmissionToken/); assert.match(route, /checkRateLimit/)
})

test('mobile screenshots with blank File.type get a canonical signed PUT content type', () => {
  assert.deepEqual(paymentScreenshotType('iphone screenshot.HEIC', ''), { mimeType: 'image/heic', extension: 'heic' })
  assert.deepEqual(paymentScreenshotType('proof.jpeg', 'image/jpg'), { mimeType: 'image/jpeg', extension: 'jpg' })
  assert.deepEqual(paymentScreenshotType('proof', 'image/webp; charset=binary'), { mimeType: 'image/webp', extension: 'webp' })
  assert.equal(paymentScreenshotType('fake.png', 'image/jpeg'), null)
  assert.equal(paymentScreenshotType('proof.pdf', ''), null)
  assert.equal(PUBLIC_PAYMENT_SCREENSHOT_MAX_BYTES, 10 * 1024 * 1024)
})

test('public dashboard has list, read-only statuses, add form, polling and responsive cards', async () => {
  const [client, css] = await Promise.all([read('../src/app/submit-payment/PublicPaymentForm.tsx'), read('../src/app/submit-payment/submit-payment.module.css')])
  assert.match(client, /type="text" inputMode="decimal"/)
  assert.doesNotMatch(client, /type="number"/)
  assert.match(client, /Date.*Sales Order.*Customer Name.*Mode.*Amount.*Screenshot.*Status/s)
  assert.match(client, /setInterval\(.*5000/s); assert.match(client, /addEventListener\('focus'/)
  assert.doesNotMatch(client, /method: 'PATCH'|notification|syncOpenOrders/)
  assert.match(css, /min-height:48px/); assert.match(css, /@media\(max-width:340px\)/); assert.match(css, /\.mobileList/)
})

test('public list exposes presentation fields only and proof lookup never accepts a caller key', async () => {
  const [route, proof] = await Promise.all([read('../src/app/api/public/payments/route.ts'), read('../src/app/api/public/payments/[id]/proof/route.ts')])
  assert.match(route, /export async function GET/)
  for (const field of ['date', 'salesOrderNumber', 'customerName', 'paymentMode', 'paymentAmount', 'status', 'hasScreenshot', 'proofUrl']) assert.match(route, new RegExp(field))
  const getBlock = route.slice(route.indexOf('export async function GET'), route.indexOf('export async function POST'))
  for (const privateField of ['createdBy', 'idempotencyKey', 'screenshotKey:', 'screenshotUrl']) assert.doesNotMatch(getBlock, new RegExp(privateField))
  assert.match(proof, /find\(\(item\) => item\.id === id\)/)
  assert.doesNotMatch(proof, /searchParams|get\('key'\)/)
  assert.match(proof, /safePublicPaymentKey/)
})
