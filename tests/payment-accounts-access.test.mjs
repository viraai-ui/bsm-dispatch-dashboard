import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('Accounts user is idempotently migrated with a bcrypt password and restricted role', async () => {
  const auth = await read('../src/lib/auth.ts')
  assert.match(auth, /'Accounts'/)
  assert.match(auth, /username: 'account'/)
  assert.match(auth, /bcrypt\.hash\('account', 10\)/)
  assert.match(auth, /const accounts = store\.users\.find/)
  assert.doesNotMatch(auth, /passwordHash:\s*'account'/)
})

test('payment API permits Admin and Accounts status updates while creation remains Admin-only', async () => {
  const route = await read('../src/app/api/payments/route.ts')
  const upload = await read('../src/app/api/payments/upload-target/route.ts')
  assert.match(route, /GET\(\)[\s\S]*requireUser\(\['Admin', 'Accounts'\]\)/)
  assert.match(route, /POST\(request: Request\)[\s\S]*requireUser\(\['Admin'\]\)/)
  assert.match(route, /PATCH\(request: Request\)[\s\S]*requireUser\(\['Admin', 'Accounts'\]\)/)
  assert.match(route, /\['Pending', 'Payment Received'\]/)
  assert.match(upload, /requireUser\(\['Admin'\]\)/)
})

test('Accounts route and navigation are Payments-only', async () => {
  const gate = await read('../src/components/AuthGate.tsx')
  const shell = await read('../src/components/DashboardShell.tsx')
  const proxy = await read('../src/proxy.ts')
  assert.match(gate, /role === 'Accounts' \? accountsOnlyPath/)
  assert.match(gate, /user\.role === 'Accounts' && pathname !== accountsOnlyPath/)
  assert.match(shell, /accountsOnly \? nav\.filter\(\(item\) => item\.href === '\/payments'\)/)
  assert.match(proxy, /payload\.role === 'Accounts' && pathname !== accountsOnly/)
})

test('Payments uses its dedicated read-only sales-order API', async () => {
  const client = await read('../src/components/PaymentsClient.tsx')
  const orders = await read('../src/app/api/orders/route.ts')
  const paymentOrders = await read('../src/app/api/payments/open-sales-orders/route.ts')
  assert.match(client, /fetch\('\/api\/payments\/open-sales-orders\?refresh=1'/)
  assert.doesNotMatch(client, /fetch\('\/api\/orders'/)
  assert.match(client, /payment-sync-icon spinning/)
  assert.match(client, /setOrders\(\[\]\); setOrdersLoaded\(true\)/)
  assert.match(client, /isAdmin && open/)
  assert.match(client, /disabled=\{updatingPaymentId === payment\.id\}/)
  assert.match(client, /if \(!isAdmin && !isAccounts\) return/)
  assert.doesNotMatch(orders, /paymentOrderSuggestions|isOpenZohoSalesOrder|payments/)
  assert.match(paymentOrders, /export async function GET/)
  assert.doesNotMatch(paymentOrders, /export async function POST|syncConfirmedOrders|workflow/)
})

test('authenticated object viewer segregates payment and media-proof access', async () => {
  const view = await read('../src/app/api/r2/view/route.ts')
  assert.match(view, /requireUser\(\['Admin', 'Operations', 'Media', 'Accounts'\]\)/)
  assert.match(view, /canViewPayment = \['Admin', 'Accounts'\]/)
  assert.match(view, /canViewMediaProof = \['Admin', 'Operations', 'Media'\]/)
  assert.match(view, /safeObjectKey\(key, 'payments\/'\)/)
  assert.match(view, /segment !== '\.\.'/)
  assert.match(view, /if \(!allowed\) return new NextResponse\('Invalid media key'/)
})
