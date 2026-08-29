import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const users = ['Anuj', 'Deepak', 'Ram', 'Karan', 'Shivani', 'Manisha', 'Sonia']
const payments = read('src/lib/payments.ts')
const publicForm = read('src/app/submit-payment/PublicPaymentForm.tsx')
const internalForm = read('src/components/PaymentsClient.tsx')
const publicRoute = read('src/app/api/public/payments/route.ts')
const internalRoute = read('src/app/api/payments/route.ts')
const publicCss = read('src/app/submit-payment/submit-payment.module.css')

function validate(value) {
  return typeof value === 'string' && users.includes(value)
}

test('canonical fixed allowlist has exactly seven users in required order', () => {
  const literal = payments.match(/PAYMENT_ADDED_BY_USERS = \[([^\]]+)\]/)?.[1]
  assert.ok(literal)
  assert.deepEqual([...literal.matchAll(/'([^']+)'/g)].map((match) => match[1]), users)
})

test('both creation forms require a blank-first Added by selector and submit it', () => {
  for (const source of [publicForm, internalForm]) {
    assert.match(source, />Added by(?:<|\s)/)
    assert.match(source, /<select[^>]*required[^>]*value=\{addedBy\}/)
    assert.match(source, /<option value="">Select user<\/option>\{PAYMENT_ADDED_BY_USERS\.map/)
    assert.match(source, /setAddedBy\(''\)/)
    assert.match(source, /JSON\.stringify\(\{[^}]*addedBy/)
  }
})

test('server validator accepts every canonical user and rejects blank, unknown, case, whitespace and overlong input', () => {
  for (const user of users) assert.equal(validate(user), true)
  for (const invalid of ['', 'Unknown', 'anuj', 'ANUJ', ' Anuj', 'Anuj ', 'Anuj\n', 'A'.repeat(500), null, undefined, 1]) assert.equal(validate(invalid), false)
  assert.match(payments, /typeof value === 'string' && PAYMENT_ADDED_BY_USERS\.includes/)
  assert.match(publicRoute, /const addedBy = body\.addedBy[\s\S]*!isPaymentAddedBy\(addedBy\)/)
  assert.match(internalRoute, /const addedBy = body\.addedBy[\s\S]*!isPaymentAddedBy\(addedBy\)/)
})

test('addedBy persists separately from createdBy and legacy rows remain optional', () => {
  assert.match(payments, /addedBy\?: PaymentAddedBy/)
  assert.match(payments, /createdBy: string/)
  assert.match(publicRoute, /addedBy: payment\.addedBy \|\| null/)
  assert.match(publicForm, /payment\.addedBy \|\| '—'/)
  assert.match(internalForm, /payment\.addedBy \|\| '—'/)
})

test('public facade adds only addedBy and still explicitly projects safe fields', () => {
  const projection = publicRoute.slice(publicRoute.indexOf('const payments ='), publicRoute.indexOf('const response ='))
  assert.match(projection, /addedBy: payment\.addedBy \|\| null/)
  for (const privateField of ['createdBy', 'idempotencyKey', 'publicDeleteTokenHash', 'screenshotKey']) assert.doesNotMatch(projection, new RegExp(privateField))
})

test('selector and metadata retain compact 320/360/390-safe contracts', () => {
  assert.match(publicCss, /\.selectWrap select\{[^}]*height:44px/)
  assert.match(publicCss, /\.addedBy\{[^}]*font-size:10px/)
  for (const width of ['320', '360', '390']) assert.match(publicCss, new RegExp(`max-width:${width}px`))
})

test('payment addedBy does not enter operational projections', () => {
  for (const path of ['src/lib/payment-status-projection.ts', 'src/lib/payment-open-sales-orders.ts']) assert.doesNotMatch(read(path), /addedBy|PAYMENT_ADDED_BY_USERS/)
})
