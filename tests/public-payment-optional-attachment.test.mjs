import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { normalizePaymentScreenshotFile } from '../src/lib/payment-screenshot.ts'

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('salesman form submits zero attachments and native validity does not require a file', async () => {
  const ui = await read('../src/app/submit-payment/PublicPaymentForm.tsx')
  assert.match(ui, /Attachment \(optional\)/)
  assert.doesNotMatch(ui, /Payment Proof<span>\*<\/span>/)
  assert.doesNotMatch(ui, /id="shot" type="file" required/)
  assert.doesNotMatch(ui, /files\.length < 1/)
  assert.match(ui, /attachments: uploaded/)
  assert.match(ui, /for \(const file of files\) await uploadOne\(file\)/)
})

test('public API accepts an empty proof list without an upload scope and serializes no fake proof', async () => {
  const route = await read('../src/app/api/public/payments/route.ts')
  assert.match(route, /requested\.length > 10/)
  assert.doesNotMatch(route, /requested\.length < 1/)
  assert.match(route, /linked \|\| requested\.length === 0 \? null : verifyPaymentUploadScope/)
  assert.match(route, /requested\.length > 0 && !manualScope/)
  assert.match(route, /\.\.\.\(attachments\.length \? \{ attachments, screenshotKey:/)
  assert.match(route, /: \{\}\), publicDeleteTokenHash/)
})

test('a supplied valid attachment remains accepted by client validation', () => {
  const file = new File([new Uint8Array([1, 2, 3])], 'receipt.pdf', { type: 'application/pdf' })
  const normalized = normalizePaymentScreenshotFile(file)
  assert.equal(normalized.name, 'receipt.pdf')
  assert.equal(normalized.type, 'application/pdf')
})

test('a supplied invalid attachment is still rejected', () => {
  const file = new File([new Uint8Array([1])], 'malware.exe', { type: 'application/octet-stream' })
  assert.throws(() => normalizePaymentScreenshotFile(file), /JPEG, PNG, WebP, HEIC, HEIF or PDF/i)
})

test('optional payment attachment change remains isolated from Orders and RTS', async () => {
  const [route, ui] = await Promise.all([read('../src/app/api/public/payments/route.ts'), read('../src/app/submit-payment/PublicPaymentForm.tsx')])
  for (const source of [route, ui]) assert.doesNotMatch(source, /api\/orders|ready-to-ship|workflow-store|media-proof-store/)
})