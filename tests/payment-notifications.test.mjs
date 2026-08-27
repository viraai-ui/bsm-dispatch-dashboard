import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('in-app notification creation follows successful POST and never PATCH', async () => {
  const route = await read('../src/app/api/payments/route.ts')
  assert.ok(route.indexOf('createPaymentNotifications(payment') > route.indexOf('await createPayment('))
  const patchBody = route.slice(route.indexOf('export async function PATCH'))
  assert.doesNotMatch(patchBody, /createPaymentNotifications/)
})

test('notification API is role protected and scoped to authenticated user', async () => {
  const route = await read('../src/app/api/payments/notifications/route.ts')
  const store = await read('../src/lib/payment-notifications.ts')
  assert.match(route, /requireUser\(\['Admin', 'Accounts'\]\)/g)
  assert.match(route, /listPaymentNotifications\(auth\.user\.id\)/)
  assert.match(route, /markPaymentNotificationsRead\(auth\.user\.id/)
  assert.match(store, /recipientUserId === userId/g)
  assert.match(store, /role === 'Accounts'/)
  assert.match(store, /user\.id !== creatorUserId/)
})

test('bell inbox stays right-aligned and opens a viewport-safe panel below the bell', async () => {
  const client = await read('../src/components/PaymentsClient.tsx')
  const css = await read('../src/app/globals.css')
  assert.match(client, /unreadCount > 99 \? '99\+' : unreadCount/)
  assert.match(client, /Payment notifications, \$\{unreadCount\} unread/)
  assert.match(client, /Mark all read/)
  assert.match(client, /data-payment-id/)
  assert.match(css, /\.notification-bell\{[^}]*width:44px;height:44px/)
  assert.match(css, /\.notification-panel\{[^}]*position:absolute;[^}]*top:calc\(100% \+ 8px\);right:0;width:min\(340px,calc\(100vw - 24px\)\);[^}]*max-height:/)
  const mobileNotificationRules = css.slice(css.lastIndexOf('@media(max-width:700px){.payments-header-actions{display:flex'))
  assert.match(mobileNotificationRules, /^@media\(max-width:700px\)\{\.payments-header-actions\{display:flex;width:100%\}/)
  assert.match(mobileNotificationRules, /\.payments-header-actions \.notification-center\{order:3;margin-left:auto\}/)
  assert.match(css, /\.notification-list\{[^}]*overflow-y:auto/)
  const panelRules = [...css.matchAll(/\.notification-panel\{([^}]*)\}/g)].map((match) => match[1]).join(';')
  assert.doesNotMatch(panelRules, /(?:^|;)bottom:/)
  assert.doesNotMatch(panelRules, /transform:/)
})

test('payments poll every five seconds with no-store and refresh on focus and visibility', async () => {
  const client = await read('../src/components/PaymentsClient.tsx')
  const route = await read('../src/app/api/payments/route.ts')
  assert.match(client, /document\.visibilityState === 'visible' \? 5000 : 30000/)
  assert.match(client, /visibilitychange/)
  assert.match(client, /window\.addEventListener\('focus'/)
  assert.match(client, /fetch\('\/api\/payments', \{ cache: 'no-store' \}\)/)
  assert.match(client, /pollingRef\.current/)
  assert.match(route, /Cache-Control', 'no-store, max-age=0'/)
})
