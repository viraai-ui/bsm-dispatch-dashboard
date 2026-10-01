import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('Spare Part Sales is a known authenticated role with a durable Sonia seed', async () => {
  const [auth, users] = await Promise.all([read('src/lib/auth.ts'), read('data/auth-users-store.json')])
  assert.match(auth, /export type AppRole = .*'Spare Part Sales'/)
  assert.match(auth, /roles: AppRole\[\] = \[.*'Spare Part Sales'/)
  const sonia = JSON.parse(users).users.find((user) => user.username === 'sonia')
  assert.ok(sonia)
  assert.equal(sonia.name, 'Sonia')
  assert.equal(sonia.role, 'Spare Part Sales')
  assert.equal(sonia.active, true)
  assert.ok(sonia.passwordHash.startsWith('$2'))
})

test('Spare Part Sales is confined to payments and receives payment-create API access only', async () => {
  const [proxy, gate, shell, payments, upload, search] = await Promise.all([
    read('src/proxy.ts'), read('src/components/AuthGate.tsx'), read('src/components/DashboardShell.tsx'),
    read('src/app/api/payments/route.ts'), read('src/app/api/payments/upload-target/route.ts'),
    read('src/app/api/payments/open-sales-orders/route.ts'),
  ])
  for (const source of [proxy, gate, shell]) assert.match(source, /Spare Part Sales/)
  assert.match(payments, /POST[\s\S]*requireUser\(\['Admin', 'Spare Part Sales'\]\)/)
  assert.match(payments, /PATCH[\s\S]*requireUser\(\['Admin', 'Accounts'\]\)/)
  assert.match(upload, /requireUser\(\['Admin', 'Spare Part Sales'\]\)/)
  assert.match(search, /requireUser\(\['Admin', 'Accounts', 'Spare Part Sales'\]\)/)
})

test('manual spare-part payments require and persist an arbitrary reference without treating it as a sales order', async () => {
  const [api, ui, model] = await Promise.all([
    read('src/app/api/payments/route.ts'), read('src/components/PaymentsClient.tsx'), read('src/lib/payments.ts'),
  ])
  assert.match(model, /manualReference\?: string/)
  assert.match(api, /auth\.user\.role === 'Spare Part Sales'/)
  assert.match(api, /manualReference/)
  assert.match(api, /Enter a valid reference\/name/)
  assert.match(ui, /Reference \/ Name/)
  assert.match(ui, /manualReference/)
  assert.match(ui, /canAddPayment/)
  assert.match(ui, /canUpdateStatus/)
})
