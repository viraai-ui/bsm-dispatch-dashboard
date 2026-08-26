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
  assert.match(client, /<select className=\{`payment-status-select[\s\S]*disabled=\{updatingPaymentId === payment\.id\}[\s\S]*<option value="Pending">Pending<\/option><option value="Payment Received">Payment Received<\/option>/)
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