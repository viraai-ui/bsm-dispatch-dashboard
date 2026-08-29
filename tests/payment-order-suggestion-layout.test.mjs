import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)

test('public and internal sales-order suggestions use the compact left-aligned hierarchy', async () => {
  const [publicCss, internalCss] = await Promise.all([
    readFile(new URL('src/app/submit-payment/submit-payment.module.css', root), 'utf8'),
    readFile(new URL('src/app/globals.css', root), 'utf8'),
  ])

  for (const [surface, css, prefix] of [
    ['public', publicCss, 'suggestions'],
    ['internal', internalCss, 'payment-order-options'],
  ]) {
    assert.match(css, new RegExp(`\\.${prefix} button\\{[^}]*grid-template-columns:minmax\\(0,1fr\\) auto[^}]*align-items:start`), `${surface} uses the SO/status top-line grid`)
    assert.match(css, new RegExp(`\\.${prefix} button\\{[^}]*display:grid`), `${surface} rows use grid layout`)
    assert.match(css, new RegExp(`\\.${prefix} button\\{[^}]*min-width:0[^}]*min-height:60px`), `${surface} rows remain compact and safe at 320–390px`)
    assert.match(css, new RegExp(`\\.${prefix} button\\{[^}]*padding:10px 12px`), `${surface} rows use compact horizontal padding`)
    assert.match(css, new RegExp(`\\.${prefix} button>span\\{[^}]*min-width:0[^}]*text-align:left`), `${surface} copy is flush left`)
    assert.match(css, new RegExp(`\\.${prefix} button small\\{[^}]*text-overflow:ellipsis[^}]*white-space:nowrap`), `${surface} customer names stay on one line`)
  }

  assert.match(publicCss, /\.orderStatus\{[^}]*min-height:20px[^}]*padding:2px 7px[^}]*font-size:10\.5px/)
  assert.match(internalCss, /\.payment-order-chip\{[^}]*min-height:20px[^}]*padding:2px 7px[^}]*font-size:10\.5px/)
  assert.match(publicCss, /\.suggestions\{[^}]*max-height:min\(240px,calc\(100dvh - 180px\)\)[^}]*overflow-y:auto/)
  assert.match(internalCss, /\.payment-order-options\{[^}]*max-height:min\(240px,calc\(100dvh - 180px\)\)[^}]*overflow-y:auto/)
})