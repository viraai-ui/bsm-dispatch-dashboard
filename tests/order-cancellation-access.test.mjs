import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('cancellation endpoint permits only Admin and Operations', async () => {
  const route = await read('../src/app/api/orders/[id]/cancel/route.ts')
  assert.match(route, /requireUser\(\['Admin', 'Operations'\]\)/)
  for (const denied of ['Accounts', 'Database', 'Media', 'Salesman', 'Public', 'Dispatch']) {
    assert.doesNotMatch(route, new RegExp(`requireUser\\([^)]*'${denied}'`))
  }
  assert.match(route, /if \(!auth\.ok\) return auth\.response/)
  assert.match(route, /cancelOrderFromDashboard\([^,]+,[^,]+, safeUser\(auth\.user\)\)/)
})

test('menu visibility follows the same exact role allowlist and label is exactly Cancel', async () => {
  const client = await read('../src/components/OrdersClient.tsx')
  assert.match(client, /setCanCancel\(\['Admin', 'Operations'\]\.includes\(json\?\.user\?\.role\)\)/)
  assert.match(client, /\{canCancel && <button[^>]+className="cancel-order-menu-item"[\s\S]*?<span[^>]*>⊘<\/span> Cancel<\/button>/)
  assert.doesNotMatch(client, /cancel-order-menu-item[\s\S]{0,250}Cancel Order<\/button>/)
})

test('confirmation remains explicit and mobile-safe', async () => {
  const [client, css] = await Promise.all([
    read('../src/components/OrdersClient.tsx'),
    read('../src/app/globals.css'),
  ])
  assert.match(client, /Cancel \{order\.salesOrderNumber\}\?/)
  assert.match(client, /removes it from the active dashboard and operational queues/)
  assert.match(client, /does not cancel the order in Zoho/)
  assert.match(client, /Workflow, serial, media, shipment, payment, and database history are preserved/)
  assert.match(css, /\.cancel-order-confirm \{ width: min\(440px, 100%\)/)
  assert.match(css, /@media \(max-width: 390px\)[^{]*\{[^}]*\.cancel-order-confirm \.modal-actions/)
})

test('cancellation retains verified readback and lifecycle protections', async () => {
  const [client, cancellation, lifecycle] = await Promise.all([
    read('../src/components/OrdersClient.tsx'),
    read('../src/lib/order-cancellation.ts'),
    read('../src/lib/operational-orders.ts'),
  ])
  assert.match(client, /!json\.data\?\.cancelled/)
  assert.match(cancellation, /for \(let attempt = 0; attempt < 3/)
  assert.match(cancellation, /tombstones/)
  assert.match(cancellation, /cancelled_from_dashboard/)
  assert.match(lifecycle, /isOrderTombstoned/)
})
