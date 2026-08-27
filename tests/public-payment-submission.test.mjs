import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { issuePaymentDeleteCapability, issueSubmissionToken, verifyPaymentDeleteCapability, verifySubmissionToken, sameOrigin, strictSameOrigin } from '../src/lib/public-payment-security.ts'
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
  assert.match(route, /listPaymentOpenSalesOrders\(refresh\)/)
  assert.match(route, /searchParams\.get\('refresh'\) === '1'/)
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
  assert.equal(strictSameOrigin(new Request('https://dispatch.bsmindia.com/api/public/payments')), false)
  assert.equal(strictSameOrigin(new Request('https://dispatch.bsmindia.com/api/public/payments', { headers: { origin: 'https://evil.example' } })), false)
  assert.equal(verifySubmissionToken(issueSubmissionToken(-1)), false)
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
  assert.deepEqual(paymentScreenshotType('proof.pdf', ''), { mimeType: 'application/pdf', extension: 'pdf' })
  assert.deepEqual(paymentScreenshotType('proof', 'application/pdf'), { mimeType: 'application/pdf', extension: 'pdf' })
  assert.equal(paymentScreenshotType('fake.pdf', 'image/jpeg'), null)
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

test('public deletion capability is random, hashed and constant-time verified', () => {
  const first = issuePaymentDeleteCapability()
  const second = issuePaymentDeleteCapability()
  assert.notEqual(first.token, second.token)
  assert.equal(first.hash.length, 64)
  assert.doesNotMatch(first.hash, new RegExp(first.token))
  assert.equal(verifyPaymentDeleteCapability(first.token, first.hash), true)
  assert.equal(verifyPaymentDeleteCapability(second.token, first.hash), false)
  assert.equal(verifyPaymentDeleteCapability('', first.hash), false)
})

test('public create returns capability once, persists only hash and list stays private', async () => {
  const [route, store] = await Promise.all([read('../src/app/api/public/payments/route.ts'), read('../src/lib/payments.ts')])
  assert.match(route, /issuePaymentDeleteCapability/)
  assert.match(route, /deleteToken: result\.duplicate \? undefined : deleteCapability\.token/)
  assert.match(route, /publicDeleteTokenHash: deleteCapability\.hash/)
  assert.match(store, /publicDeleteTokenHash\?: string/)
  const getBlock = route.slice(route.indexOf('export async function GET'), route.indexOf('export async function POST'))
  assert.doesNotMatch(getBlock, /deleteToken|publicDeleteTokenHash|createdBy|idempotencyKey/)
})

test('dedicated public DELETE accepts signed public session for legacy rows, remains pending-only and cleans dependencies', async () => {
  const route = await read('../src/app/api/public/payments/[id]/route.ts')
  for (const contract of [/export async function DELETE/, /x-payment-delete-token/, /x-public-submission-token/, /verifyPaymentDeleteCapability/, /verifySubmissionToken/, /status !== 'Pending'/, /deleteR2Object/, /removePaymentNotifications/, /deletePendingPublicPayment/, /strictSameOrigin/, /checkRateLimit/, /Invalid payment ID/]) assert.match(route, contract)
  assert.match(route, /session expired.*403/s)
  assert.match(route, /Payment Received records cannot be deleted.*409/s)
  assert.match(route, /Nothing was deleted; please retry.*503/s)
  assert.doesNotMatch(route, /requireUser/)
})

test('three legacy pending rows without capability hashes all render SVG action menus and use a real confirmation modal', async () => {
  const [client, css, internal] = await Promise.all([read('../src/app/submit-payment/PublicPaymentForm.tsx'), read('../src/app/submit-payment/submit-payment.module.css'), read('../src/components/PaymentsClient.tsx')])
  assert.match(client, /localStorage\.setItem\(CAPABILITY_KEY/)
  const legacyRows = Array.from({ length: 3 }, (_, index) => ({ id: `legacy-${index}`, status: 'Pending' }))
  assert.equal(legacyRows.filter((payment) => payment.status === 'Pending').length, 3)
  assert.match(client, /payment\.status === 'Pending' \? <div className=\{styles\.menuWrap\}/)
  assert.doesNotMatch(client, /capabilities\[payment\.id\] && payment\.status/)
  assert.match(client, /<svg viewBox="0 0 24 24"/)
  assert.match(client, /x-public-submission-token/)
  assert.match(client, /Delete Payment/); assert.match(client, /aria-modal="true"/)
  assert.match(client, /Sales Order.*Customer.*Amount/s)
  assert.match(client, /removeEventListener\('pointerdown'/); assert.match(client, /event\.key === 'Escape'/)
  assert.doesNotMatch(client, /confirm\(/)
  assert.doesNotMatch(client, /method: 'PATCH'|updatePaymentStatus|status.*onChange/)
  assert.match(internal, /updateStatus|status-select/)
  assert.match(css, /width:44px/)
  for (const width of ['320', '360', '390']) assert.match(css, new RegExp(`max-width:${width}px`))
})
