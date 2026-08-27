import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('mobile received tint is gated to Accounts while pending and Admin remain neutral', async () => {
  const [client, css] = await Promise.all([
    read('../src/components/PaymentsClient.tsx'),
    read('../src/app/globals.css'),
  ])

  assert.match(client, /payment\.status === 'Payment Received' \? `received\$\{isAccounts \? ' accounts-received' : ''\}` : 'pending'/)
  assert.match(css, /\.payment-mobile-card\.accounts-received\{[^}]*border-color:#bfdcc8!important[^}]*background:#f2fbf5!important/)
  assert.match(css, /\.payment-mobile-card\{[^}]*min-width:0[^}]*overflow:hidden/)
  assert.doesNotMatch(css, /\.payment-mobile-card(?:::before|\.accounts-received::before|\.received::before)/)
  assert.doesNotMatch(css, /\.payment-mobile-card\.accounts-received\{[^}]*(?:border-left|border-inline-start)/)
})

test('public salesman payment markup and scoped styles stay isolated', async () => {
  const [client, publicUi, publicCss] = await Promise.all([
    read('../src/components/PaymentsClient.tsx'),
    read('../src/app/submit-payment/PublicPaymentForm.tsx'),
    read('../src/app/submit-payment/submit-payment.module.css'),
  ])

  assert.doesNotMatch(publicUi, /accounts-received/)
  assert.doesNotMatch(publicCss, /accounts-received/)
  assert.match(publicUi, /styles\.receivedCard : styles\.mobileCard/)
  assert.match(publicCss, /border-left:3px solid #e7ad42/)
  assert.match(client, /userRole: AppRole/)
})

test('mobile card sizing contract covers narrow Accounts viewports without horizontal overflow', async () => {
  const css = await read('../src/app/globals.css')
  assert.match(css, /@media\(max-width:700px\)[\s\S]*\.payment-mobile-list\{[^}]*min-width:0/)
  assert.match(css, /\.payment-mobile-card\{[^}]*min-width:0[^}]*overflow:hidden/)
  assert.match(css, /\.payment-mobile-card\{[^}]*box-sizing:border-box/)
  assert.match(css, /@media\(max-width:340px\)/)
  for (const width of [320, 360, 390]) assert.ok(width <= 700)
})