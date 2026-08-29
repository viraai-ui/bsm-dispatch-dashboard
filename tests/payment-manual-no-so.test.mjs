import test from 'node:test'
import assert from 'node:assert/strict'
import { cleanPaymentCustomerName, issuePaymentUploadScope, verifyPaymentUploadScope } from '../src/lib/payment-manual.ts'
import { projectPaymentStatuses } from '../src/lib/payment-status-projection.ts'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('manual customer validation trims valid text and rejects blank, markup, controls, and overlength', () => {
  assert.equal(cleanPaymentCustomerName('  Acme   Industries  '), 'Acme Industries')
  for (const invalid of ['', '   ', '<script>', 'Bad\u0000Name', 'x'.repeat(121), null]) assert.equal(cleanPaymentCustomerName(invalid), null)
})

test('manual upload scope is opaque, signed, stable, and rejects cross-context tampering', () => {
  const first = issuePaymentUploadScope()
  const second = issuePaymentUploadScope()
  assert.equal(verifyPaymentUploadScope(first.token), first.scope)
  assert.notEqual(first.scope, second.scope)
  assert.equal(verifyPaymentUploadScope(first.token + 'x'), null)
  assert.notEqual(verifyPaymentUploadScope(second.token), first.scope)
})

test('manual payments are excluded from sales-order status projection', () => {
  assert.deepEqual(projectPaymentStatuses([{ customerName: 'Manual', status: 'Payment Received' }, { salesOrderNumber: '', status: 'Pending' }]), {})
})

test('both forms support manual mode and suggestions start closed until interaction', async () => {
  const [publicUi, internalUi] = await Promise.all([read('src/app/submit-payment/PublicPaymentForm.tsx'), read('src/components/PaymentsClient.tsx')])
  for (const ui of [publicUi, internalUi]) {
    assert.match(ui, /Sales Order \(optional\)/)
    assert.match(ui, /Search by SO number or customer/)
    assert.match(ui, /Enter customer name/)
    assert.match(ui, /No Sales Order/)
    assert.match(ui, /uploadScope/)
    assert.match(ui, /setOrderInteracted\(true\)/)
  }
  assert.match(publicUi, /function openPaymentForm\(\) \{ resetPaymentForm\(\); setOpen\(true\); modalHistory/)
  assert.match(internalUi, /function openPaymentForm\(\) \{ resetPaymentForm\(\); setOpen\(true\) \}/)
  assert.doesNotMatch(internalUi, /setOpen\(true\); setSuggestionsOpen\(true\)/)
})

test('manual routes reject partial SO identity and bind every proof to signed manual scope', async () => {
  const [pub, internal, pubUpload, internalUpload] = await Promise.all([
    read('src/app/api/public/payments/route.ts'), read('src/app/api/payments/route.ts'),
    read('src/app/api/public/payments/upload-target/route.ts'), read('src/app/api/payments/upload-target/route.ts'),
  ])
  for (const route of [pub, internal]) {
    assert.match(route, /Boolean\(.*Id\) !== Boolean\(salesOrderNumber\)/)
    assert.match(route, /cleanPaymentCustomerName/)
    assert.match(route, /manual\/\$\{manualScope\}/)
    assert.match(route, /linked \? await validatePaymentOrder/)
  }
  for (const route of [pubUpload, internalUpload]) {
    assert.match(route, /issuePaymentUploadScope/)
    assert.match(route, /manual\/\$\{issued\.scope\}/)
    assert.match(route, /uploadScope: issued\.token/)
  }
})
