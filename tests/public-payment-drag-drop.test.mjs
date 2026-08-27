import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const read = (path) => fs.readFile(new URL(path, import.meta.url), 'utf8')

test('public Add Payment modal owns viewport file drag listeners only while open', async () => {
  const ui = await read('../src/app/submit-payment/PublicPaymentForm.tsx')
  assert.match(ui, /if \(!open \|\| receipt\) return/)
  for (const event of ['dragenter', 'dragover', 'dragleave', 'drop']) {
    assert.match(ui, new RegExp(`window\\.addEventListener\\('${event}'`))
    assert.match(ui, new RegExp(`window\\.removeEventListener\\('${event}'`))
  }
  assert.match(ui, /event\.preventDefault\(\); event\.stopPropagation\(\)/)
  assert.match(ui, /dragDepth\.current \+= 1/)
  assert.match(ui, /Math\.max\(0, dragDepth\.current - 1\)/)
  assert.match(ui, /if \(!dragDepth\.current\) setDragActive\(false\)/)
})

test('drop overlay is full-screen, accessible, premium, and non-intercepting', async () => {
  const [ui, css] = await Promise.all([read('../src/app/submit-payment/PublicPaymentForm.tsx'), read('../src/app/submit-payment/submit-payment.module.css')])
  assert.match(ui, /Drop payment proof/)
  assert.match(ui, /Image or PDF • Max 10 MB/)
  assert.match(ui, /role="status" aria-live="assertive"/)
  assert.match(css, /\.dropOverlay\{position:fixed;inset:0/)
  assert.match(css, /pointer-events:none/)
})

test('native picker and drop share normalization, state, ref, and submit path', async () => {
  const ui = await read('../src/app/submit-payment/PublicPaymentForm.tsx')
  assert.match(ui, /onChange=\{\(e\) => attachPaymentProof\(e\.target\.files\?\.\[0\] \|\| null\)\}/)
  assert.match(ui, /attachPaymentProof\(supported\)/)
  assert.match(ui, /setFile\(normalized\)/)
  assert.match(ui, /fileInputRef\.current\.files = transfer\.files/)
  assert.match(ui, /if \(file\) \{/)
  assert.match(ui, /body: file/)
  assert.match(ui, /setFile\(null\)/)
  assert.match(ui, /fileInputRef\.current\.value = ''/)
  assert.match(ui, /file\.name/)
})

test('proof normalization enforces allowlist, empty files, 10 MB, and blank Android MIME', async () => {
  const proof = await read('../src/lib/payment-screenshot.ts')
  assert.match(proof, /normalizePaymentScreenshotFile/)
  assert.match(proof, /if \(!file\.size\)/)
  assert.match(proof, /file\.size > PUBLIC_PAYMENT_SCREENSHOT_MAX_BYTES/)
  assert.match(proof, /paymentScreenshotType\(file\.name, file\.type\)/)
  assert.match(proof, /pdf: 'application\/pdf'/)
  assert.match(proof, /new File\(\[file\], file\.name, \{ type: normalized\.mimeType/)
  assert.doesNotMatch(proof, /@\/lib\/(?:payments|r2|auth|db)/)
})

test('drop queues proof but never uploads or submits before explicit form submit', async () => {
  const ui = await read('../src/app/submit-payment/PublicPaymentForm.tsx')
  const effect = ui.slice(ui.indexOf("window.addEventListener('dragenter'"), ui.indexOf('async function loadForm'))
  assert.doesNotMatch(effect, /fetch\(/)
  assert.match(ui, /<form onSubmit=\{submit\}/)
})
