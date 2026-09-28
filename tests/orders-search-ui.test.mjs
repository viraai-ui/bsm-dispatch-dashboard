import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)

test('Orders exposes an accessible client-side search across order and machine fields', async () => {
  const source = await readFile(new URL('src/components/OrdersClient.tsx', root), 'utf8')

  assert.match(source, /const \[searchQuery, setSearchQuery\] = useState\(''\)/)
  assert.match(source, /aria-label="Search orders"/)
  assert.match(source, /placeholder="Search orders, customers, machines…"/)
  assert.match(source, /aria-label="Clear order search"/)
  assert.match(source, /order\.salesOrderNumber/)
  assert.match(source, /order\.customerName/)
  assert.match(source, /order\.salesperson/)
  assert.match(source, /order\.lineItems\.flatMap\(\(item\) => \[item\.itemName, item\.sku\]\)/)
  assert.match(source, /order\.machines\.flatMap\(\(machine\) => \[machine\.itemName, machine\.sku, machine\.serialNumber\]\)/)
  assert.match(source, /normalizeOrderSearchText/)
  assert.match(source, /No orders match/)
  assert.match(source, /Clear search/)
})

test('Orders search is responsive and keeps touch controls accessible', async () => {
  const css = await readFile(new URL('src/app/globals.css', root), 'utf8')

  assert.match(css, /\.orders-search\s*\{[^}]*min-width:\s*0[^}]*min-height:\s*44px/s)
  assert.match(css, /\.orders-search-clear\s*\{[^}]*width:\s*44px[^}]*min-height:\s*44px/s)
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*?\.orders-search\s*\{[^}]*width:\s*100%[^}]*max-width:\s*none/s)
  assert.match(css, /\.orders-list-controls\s*\{[^}]*min-width:\s*0/s)
})
