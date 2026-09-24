import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('only payment pages are locked behind the maintenance dialog', async () => {
  const layout = await read('src/app/layout.tsx')
  const payments = await read('src/app/payments/page.tsx')
  const publicPayments = await read('src/app/submit-payment/page.tsx')
  const maintenance = await read('src/lib/maintenance.ts')
  assert.match(maintenance, /MAINTENANCE_MODE = true/)
  assert.doesNotMatch(layout, /MaintenanceLock|maintenance-content|MAINTENANCE_MODE/)
  for (const source of [payments, publicPayments]) {
    assert.match(source, /<div className="maintenance-content" inert aria-hidden="true">/)
    assert.match(source, /<MaintenanceLock \/>/)
  }
})

test('maintenance notice contains the required payment warning and administration direction', async () => {
  const maintenance = await read('src/lib/maintenance.ts')
  assert.match(maintenance, /dashboard is getting upgraded/i)
  assert.match(maintenance, /Do not put any payments here\./)
  assert.match(maintenance, /Contact administration to know more about the upgrade\./)
})

test('authenticated and public payment mutations are rejected during maintenance', async () => {
  for (const path of [
    'src/app/api/payments/route.ts',
    'src/app/api/payments/upload-target/route.ts',
    'src/app/api/public/payments/route.ts',
    'src/app/api/public/payments/upload-target/route.ts',
  ]) {
    const source = await read(path)
    assert.match(source, /MAINTENANCE_MODE/)
    assert.match(source, /apiError\(MAINTENANCE_API_MESSAGE, 503\)/)
  }
})

test('lock styling prevents interaction and remains mobile responsive', async () => {
  const css = await read('src/app/globals.css')
  assert.match(css, /\.maintenance-scope \.maintenance-content[^}]*pointer-events: none/)
  assert.match(css, /\.maintenance-lock[^}]*position: fixed[^}]*z-index: 2147483647/)
  assert.match(css, /@media \(max-width: 520px\)/)
})
