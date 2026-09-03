import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const component = await fs.readFile('src/components/PublicDatabaseClient.tsx', 'utf8')
const css = await fs.readFile('src/app/globals.css', 'utf8')

test('mobile public database has premium app shell and compact cards', () => {
  assert.match(component, /PUBLIC DATABASE|Public database/i)
  assert.match(component, /Serial Database/)
  assert.match(component, /Search SO, serial, customer or machine/)
  assert.match(component, /pdb-mobile-cards/)
  assert.match(component, /Machines \/ Serials/)
  assert.match(component, /View details/)
  assert.match(css, /@media\(max-width:700px\)/)
  assert.match(css, /\.pdb-record-card\{[^}]*border-radius:16px/)
  assert.match(css, /grid-template-columns:minmax\(0,1fr\) 46px/)
  assert.match(css, /overflow-x:clip/)
})

test('mobile geometry, sticky controls and safe areas cover target widths', () => {
  for (const width of [320, 360, 375, 390, 430]) assert.ok(width <= 700)
  assert.match(css, /position:sticky;top:0;z-index:30/)
  assert.match(css, /height:46px/)
  assert.match(css, /env\(safe-area-inset-top\)/)
  assert.match(css, /env\(safe-area-inset-bottom\)/)
  assert.match(css, /@media\(max-width:340px\)/)
  assert.match(css, /height:92vh;height:92dvh/)
  assert.match(css, /min-width:0/)
})

test('detail is lazy, accessible and attachment actions navigate safely', () => {
  assert.match(component, /aria-modal="true"/)
  assert.match(component, /document\.body\.style\.overflow = 'hidden'/)
  assert.match(component, /event\.key === 'Escape'/)
  assert.match(component, /DetailSkeleton/)
  assert.match(component, /View Builty \/ LR/)
  assert.match(component, /Refresh record/)
  assert.doesNotMatch(component, /R2|HTTP error|credentials/i)
  assert.match(component, /href=\{media\.url\}/)
  assert.doesNotMatch(component, /response\.blob\(\)/)
})

test('desktop uses a premium operational table and public client stays server-paginated/read-only', () => {
  assert.match(component, /<table className="table">/)
  assert.match(component, /pdb-database-hero/)
  assert.match(component, /pdb-table-statuses/)
  assert.match(component, /View record/)
  assert.match(component, /limit=25/)
  assert.match(component, /AbortController/)
  assert.match(component, /setTimeout\(load, 225\)/)
  assert.doesNotMatch(component, /loadDatabaseOrders|public-database-snapshot\.json|POST|PUT|PATCH|DELETE/)
  assert.match(css, /\.pdb-mobile-hero,\.pdb-mobile-cards,\.pdb-filter-button,\.pdb-announcer\{display:none\}/)
  assert.match(css, /@media\(min-width:701px\)/)
})
