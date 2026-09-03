import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('draft search only commits on Enter, Search click, or suggestion selection', async () => {
  const client = await read('src/components/PublicDatabaseClient.tsx')
  assert.match(client, /const \[draftQ, setDraftQ\]/)
  assert.match(client, /\[q, filter, page\]/)
  assert.match(client, /onChange=\{event => setDraftQ\(event\.target\.value\)\}/)
  assert.match(client, /event\.key==='Enter'/)
  assert.match(client, /className="pdb-search-button" onClick=\{\(\) => commitSearch\(\)\}/)
  assert.match(client, /onClick=\{\(\)=>commitSearch\(item\.value\)\}/)
})

test('suggestions are debounced, abortable, capped server-side and accessible', async () => {
  const [client, route] = await Promise.all([read('src/components/PublicDatabaseClient.tsx'), read('src/app/api/public/database/search/route.ts')])
  assert.match(client, /setTimeout\(async\(\)=>.*180/s)
  assert.match(client, /suggestionAbort\.current\?\.abort/)
  assert.match(client, /role="combobox"/)
  assert.match(client, /role="listbox"/)
  assert.match(client, /ArrowDown/)
  assert.match(client, /Escape/)
  assert.match(route, /mode'\)==='suggest'/)
  assert.match(route, /slice\(0,7\)/)
  assert.doesNotMatch(route, /details:/)
})

test('clear returns to unfiltered all-record home list', async () => {
  const client = await read('src/components/PublicDatabaseClient.tsx')
  assert.match(client, /const clearSearch = useCallback\(\(\) => \{ setDraftQ\(''\); setQ\(''\); setFilter\('all'\); setPage\(1\)/)
  assert.match(client, /Clear search and return to all records/)
})

test('desktop blocks do not overlap and popup media controls stay compact', async () => {
  const css = await read('src/app/globals.css')
  assert.match(css, /\.public-database-view\{gap:22px\}/)
  assert.match(css, /database-search-panel\{[^}]*margin:0/)
  assert.match(css, /\.pdb-attachment \.btn\{width:auto;min-height:32px/)
  assert.match(css, /@media\(max-width:700px\).*pdb-suggestions>button\{min-height:44px/s)
})

test('desktop search/filter alignment and premium outer radius remain stable', async () => {
  const css = await read('src/app/globals.css')
  assert.match(css, /grid-template-columns:minmax\(280px,620px\) auto minmax\(24px,1fr\) 170px/)
  assert.match(css, /database-search-panel>select\{grid-column:4\}/)
  assert.match(css, /border-radius:18px;isolation:isolate;background-clip:padding-box/)
})

test('salesman precedes warranty and open-record actions are centered', async () => {
  const [client, css, snapshot] = await Promise.all([read('src/components/PublicDatabaseClient.tsx'), read('src/app/globals.css'), read('src/lib/public-database-snapshot.ts')])
  assert.match(client, /<th>Machines<\/th><th>Salesman<\/th><th>Warranty Status<\/th>/)
  assert.match(client, /row\.salesperson \|\| '—'/)
  assert.match(client, /className="pdb-open-record-head">Open record/)
  assert.match(css, /pdb-open-record-head\{text-align:center!important\}/)
  assert.match(css, /pdb-desktop-table td:last-child\{text-align:center\}/)
  assert.match(snapshot, /salesperson:o\.salesperson\|\|''/)
})
