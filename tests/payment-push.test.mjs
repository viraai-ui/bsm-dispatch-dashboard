import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('one to ten proofs are required while core fields remain server validated', async () => {
  const route = await read('../src/app/api/payments/route.ts')
  const client = await read('../src/components/PaymentsClient.tsx')
  const store = await read('../src/lib/payments.ts')
  assert.match(route, /if \(!salesOrderId \|\| !customerName \|\| !salesOrderNumber\)/)
  assert.match(route, /validatePaymentOrder\(salesOrderId, salesOrderNumber, customerName\)/)
  assert.match(route, /paymentAmount <= 0/)
  assert.match(route, /PAYMENT_MODES\.includes/)
  assert.match(route, /requested\.length < 1 \|\| requested\.length > 10/)
  assert.match(client, /files\.length < 1 \|\| files\.length > 10/)
  assert.match(client, /required type="file" multiple/)
  assert.match(store, /screenshotUrl\?: string/)
})

test('push supports Admin and Accounts and runs only after successful create, never PATCH', async () => {
  const route = await read('../src/app/api/payments/route.ts')
  const pushRoute = await read('../src/app/api/payments/push-subscription/route.ts')
  const client = await read('../src/components/PaymentsClient.tsx')
  assert.match(pushRoute, /requireUser\(\['Admin', 'Accounts'\]\)/)
  assert.doesNotMatch(pushRoute, /subscriptions:/)
  assert.ok(route.indexOf('notifyAccountsOfNewPayment(payment)') > route.indexOf('await createPayment'))
  const patchBody = route.slice(route.indexOf('export async function PATCH'))
  assert.doesNotMatch(patchBody, /notifyAccountsOfNewPayment/)
  assert.match(client, /<button className="notification-bell"/)
  assert.match(client, /payment-push-consent-dismissed/)
})

test('dead push endpoints are cleaned and delivery cannot fail creation', async () => {
  const push = await read('../src/lib/payment-push.ts')
  const route = await read('../src/app/api/payments/route.ts')
  assert.match(push, /status === 404 \|\| status === 410/)
  assert.match(push, /role === 'Accounts' \|\| item\.role === 'Admin'/)
  assert.match(route, /notifyAccountsOfNewPayment\(payment\)\.catch/)
})
