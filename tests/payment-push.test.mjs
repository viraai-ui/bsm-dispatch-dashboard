import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('screenshot is optional while core fields remain server validated', async () => {
  const route = await read('../src/app/api/payments/route.ts')
  const client = await read('../src/components/PaymentsClient.tsx')
  const store = await read('../src/lib/payments.ts')
  assert.match(route, /if \(!customerName \|\| !salesOrderNumber\)/)
  assert.match(route, /paymentAmount <= 0/)
  assert.match(route, /PAYMENT_MODES\.includes/)
  assert.doesNotMatch(route, /!screenshotUrl \|\| !screenshotKey/)
  assert.match(client, /if \(file\) \{/)
  assert.doesNotMatch(client, /<input required type="file"/)
  assert.match(store, /screenshotUrl\?: string/)
})

test('push is Accounts-only and runs only after successful create', async () => {
  const route = await read('../src/app/api/payments/route.ts')
  const pushRoute = await read('../src/app/api/payments/push-subscription/route.ts')
  const client = await read('../src/components/PaymentsClient.tsx')
  assert.match(pushRoute, /requireUser\(\['Accounts'\]\)/)
  assert.doesNotMatch(pushRoute, /subscriptions:/)
  assert.ok(route.indexOf('notifyAccountsOfNewPayment(payment)') > route.indexOf('await createPayment'))
  const patchBody = route.slice(route.indexOf('export async function PATCH'))
  assert.doesNotMatch(patchBody, /notifyAccountsOfNewPayment/)
  assert.match(client, /isAccounts && <button className="notification-bell"/)
  assert.match(client, /payment-push-consent-dismissed/)
})

test('dead push endpoints are cleaned and delivery cannot fail creation', async () => {
  const push = await read('../src/lib/payment-push.ts')
  const route = await read('../src/app/api/payments/route.ts')
  assert.match(push, /status === 404 \|\| status === 410/)
  assert.match(push, /role === 'Accounts'/)
  assert.match(route, /notifyAccountsOfNewPayment\(payment\)\.catch/)
})
