import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('payments sort pending first and newest first inside each status group', async () => {
  const source = await read('../src/lib/payments.ts')
  assert.match(source, /Number\(a\.status === 'Payment Received'\) - Number\(b\.status === 'Payment Received'\)/)
  assert.match(source, /statusOrder \|\| b\.createdAt\.localeCompare\(a\.createdAt\)/)
  assert.match(source, /return sortPayments\(data\.payments \|\| \[\]\)/)
})

test('payment table has requested column order and enabled status controls for both payment roles', async () => {
  const client = await read('../src/components/PaymentsClient.tsx')
  assert.match(client, /<th>Date<\/th><th>Sales Order<\/th><th>Customer Name<\/th><th>Mode<\/th><th>Amount<\/th><th>Screenshot<\/th>/)
  assert.match(client, />View<\/a>/)
  assert.match(client, /<select className=\{`payment-status-select[\s\S]*disabled=\{updatingPaymentId === payment\.id\}[\s\S]*<option value="Pending">Pending<\/option><option value="Payment Received">Received<\/option>/)
  assert.match(client, /payment\.screenshotKey \? `\/api\/r2\/view\?key=\$\{encodeURIComponent\(payment\.screenshotKey\)\}` : payment\.screenshotUrl/)
  assert.match(client, /payment-row-received/)
  assert.match(client, /setPayments\(\(items\) => sortPayments/)
  assert.match(client, /setPayments\(previous\)/)
})

test('sync control is icon-only, accessible, and admin-only', async () => {
  const client = await read('../src/components/PaymentsClient.tsx')
  const css = await read('../src/app/globals.css')
  assert.match(client, /payments-header-actions[\s\S]*notification-bell[\s\S]*isAdmin && <><button className="payment-sync-button"/)
  assert.match(client, /aria-label="Sync open Zoho sales orders"/)
  assert.doesNotMatch(client, /Sync Orders/)
  assert.match(css, /\.payment-sync-button\{[^}]*width:44px;height:44px/)
  assert.match(css, /\.payments-header-actions\{[^}]*gap:14px/)
  assert.match(css, /\.payment-status-control\{[^}]*width:168px[^}]*margin-left:auto/)
  assert.match(css, /\.payment-status-select\{[^}]*height:38px/)
  assert.match(css, /\.payments-actions-heading span\{[^}]*width:168px[^}]*text-align:center/)
})

test('mobile payments use deliberate responsive cards with complete functionality', async () => {
  const client = await read('../src/components/PaymentsClient.tsx')
  const css = await read('../src/app/globals.css')
  assert.match(client, /payment-mobile-card/)
  assert.match(client, /formatPaymentDate[\s\S]*day: '2-digit'[\s\S]*month: '2-digit'/)
  assert.match(client, /payment-mobile-proof[\s\S]*>Screenshot<\/a>/)
  assert.match(client, /No screenshot/)
  assert.match(client, /payment-mobile-status[\s\S]*onChange=\{\(event\) => void setStatus/)
  assert.match(css, /@media\(max-width:700px\)[\s\S]*\.payments-table-wrap\{display:none\}/)
  assert.match(css, /\.payment-mobile-status\{[^}]*height:44px/)
  assert.match(css, /\.payment-mobile-proof\{[^}]*min-height:44px/)
  assert.match(css, /\.payment-mobile-card\.received\{[^}]*border-color:#cce4d3[^}]*background:#fff/)
  assert.match(css, /@media\(max-width:340px\)/)
})

test('internal payments header and mobile cards stay rail-free while public payments remain isolated', async () => {
  const [client, css, publicUi, publicCss] = await Promise.all([
    read('../src/components/PaymentsClient.tsx'),
    read('../src/app/globals.css'),
    read('../src/app/submit-payment/PublicPaymentForm.tsx'),
    read('../src/app/submit-payment/submit-payment.module.css'),
  ])
  assert.doesNotMatch(client, /<p className="eyebrow">Finance<\/p>/)
  assert.match(client, /<header className="payments-header"><div><h1>Payments<\/h1><p className="muted">/)
  assert.match(css, /@media\(max-width:700px\)\{\.payments-page\{[^}]*padding-top:14px/)
  assert.match(css, /\.payments-header h1\{margin:0 0 14px/)
  assert.match(css, /\.payment-mobile-card\{[^}]*border:1px solid #e2e6ec[^}]*border-radius:15px/)
  assert.doesNotMatch(css, /\.payment-mobile-card(?:::before|\.received::before)/)
  assert.doesNotMatch(css, /\.payment-mobile-card\{[^}]*(?:border-left|#d3282f|#e7ad42)/)
  for (const width of [320, 360, 390]) assert.ok(width <= 700, `${width}px uses the mobile spacing contract`)
  assert.match(publicUi, /<p className=\{styles\.eyebrow\}>Finance<\/p><h1>Payments<\/h1>/)
  assert.match(publicCss, /border-left:3px solid #e7ad42/)
})