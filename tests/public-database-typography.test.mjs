import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const css = await readFile(new URL('../src/app/globals.css', import.meta.url), 'utf8')
const typography = css.slice(css.indexOf('/* Public database typography tokens'))

test('public database owns a scoped, restrained typography scale', () => {
  assert.match(typography, /\.public-database-shell\{[\s\S]*--pdb-type-caption:11px;[\s\S]*--pdb-type-body:13px;[\s\S]*--pdb-type-control:14px;[\s\S]*--pdb-type-section:17px;[\s\S]*--pdb-type-title:30px;/)
  assert.doesNotMatch(typography, /font-weight:(?:800|850|900)/)
})

test('pagination is compact, readable and touch accessible', () => {
  assert.match(typography, /\.public-database-shell \.database-pagination \.btn\{min-height:44px;font-size:var\(--pdb-type-body\);font-weight:600/)
  assert.match(typography, /\.public-database-shell \.database-pagination span\{font-size:var\(--pdb-type-label\);font-weight:400/)
})

test('warranty and record detail typography remain prominent without shouting', () => {
  assert.match(typography, /\.public-database-shell \.pdb-warranty-box>div>strong\{font-size:18px;font-weight:600/)
  assert.match(typography, /\.public-database-shell \.pdb-warranty-box dd\{font-size:var\(--pdb-type-control\);font-weight:600/)
  assert.match(typography, /\.public-database-shell \.pdb-section-title h2\{font-size:var\(--pdb-type-section\);font-weight:600/)
})

test('mobile retains readable labels and 44px controls', () => {
  assert.match(typography, /@media\(max-width:700px\)[\s\S]*\.pdb-card-top>div>span\{font-size:var\(--pdb-type-meta\)/)
  assert.match(typography, /\.pdb-card-foot button\{min-height:44px;font-size:var\(--pdb-type-label\)/)
  assert.match(typography, /\.pdb-warranty-box>div>strong\{font-size:17px\}/)
})