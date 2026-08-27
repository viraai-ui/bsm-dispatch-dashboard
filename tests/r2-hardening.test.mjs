import test from 'node:test'
import assert from 'node:assert/strict'

process.env.R2_ACCOUNT_ID = 'account'
process.env.R2_ACCESS_KEY_ID = 'access'
process.env.R2_SECRET_ACCESS_KEY = 'secret'
process.env.R2_BUCKET = 'bucket'
const r2 = await import('../src/lib/r2.ts')

test('legacy persisted media keys with spaces remain view-safe', () => {
  const legacy = 'media-proof/2026-08-01/SO-07577/Travel head cutting press 25 ton Heavy-duty-1154219000034756004.mp4'
  assert.equal(r2.isSafeR2Key(legacy, ['media-proof/']), true)
  for (const key of ['media-proof//x', 'media-proof/../x', 'media-proof/./x', 'media-proof/a\\b', 'media-proof/a\0b', 'unknown/a']) assert.equal(r2.isSafeR2Key(key), false, key)
})

test('new keys are slugged and bind stage, order, and machine', () => {
  const key = r2.buildR2Key({ salesOrderNumber: 'SO 1', machineName: 'Shipment LR Builty', machineId: 'shipment-lr-builty', originalName: 'proof copy.pdf', mimeType: 'application/pdf', stage: 'shipment' })
  assert.match(key, /^media-proof\/shipment\/\d{4}-\d{2}-\d{2}\/SO-1\/shipment-lr-builty\/Shipment-LR-Builty-/)
  assert.equal(key.includes(' '), false)
})

test('HEAD verification rejects missing, oversized, wrong type and cross-order substitution', async () => {
  const original = global.fetch
  const key = r2.buildR2Key({ salesOrderNumber: 'SO-9', machineName: 'Machine', machineId: 'M-1', originalName: 'a.mp4', mimeType: 'video/mp4', stage: 'packing' })
  try {
    global.fetch = async () => new Response(null, { status: 404 })
    await assert.rejects(() => r2.verifyR2Object(key, { prefixes: ['media-proof/'], expectedTypes: ['video/'], maxBytes: 100, order: 'SO-9', machineId: 'M-1', stage: 'packing' }), /not found/)
    global.fetch = async () => new Response(null, { status: 200, headers: { 'content-type': 'video/mp4', 'content-length': '101' } })
    await assert.rejects(() => r2.verifyR2Object(key, { prefixes: ['media-proof/'], expectedTypes: ['video/'], maxBytes: 100, order: 'SO-9', machineId: 'M-1', stage: 'packing' }), /allowed size/)
    global.fetch = async () => new Response(null, { status: 200, headers: { 'content-type': 'text/plain', 'content-length': '10' } })
    await assert.rejects(() => r2.verifyR2Object(key, { prefixes: ['media-proof/'], expectedTypes: ['video/'], maxBytes: 100, order: 'SO-9', machineId: 'M-1', stage: 'packing' }), /content type/)
    await assert.rejects(() => r2.verifyR2Object(key, { prefixes: ['media-proof/'], expectedTypes: ['video/'], maxBytes: 100, order: 'SO-10', machineId: 'M-1', stage: 'packing' }), /sales order/)
  } finally { global.fetch = original }
})

test('valid HEAD metadata is normalized server-side', async () => {
  const original = global.fetch
  const key = r2.buildR2Key({ salesOrderNumber: 'SO-9', machineName: 'Machine', machineId: 'M-1', originalName: 'a.mp4', mimeType: 'video/mp4', stage: 'loading' })
  try {
    global.fetch = async (_url, init) => { assert.equal(init.method, 'HEAD'); return new Response(null, { status: 200, headers: { 'content-type': 'Video/MP4; charset=binary', 'content-length': '99', etag: 'x' } }) }
    const metadata = await r2.verifyR2Object(key, { prefixes: ['media-proof/'], expectedTypes: ['video/'], maxBytes: 100, order: 'SO-9', machineId: 'M-1', stage: 'loading' })
    assert.deepEqual(metadata, { exists: true, contentType: 'video/mp4', contentLength: 99, etag: 'x' })
  } finally { global.fetch = original }
})
