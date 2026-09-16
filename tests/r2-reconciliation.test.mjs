import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyRetention } from '../src/lib/r2-reconciliation.ts'
import { readFile } from 'node:fs/promises'

const now = Date.parse('2026-09-16T12:00:00Z')
const object = (key, days, size = 100) => ({ key, size, etag: 'etag', lastModified: new Date(now - days * 86400000).toISOString() })

test('orphan packing/loading video is eligible at 21 days', () => {
  assert.equal(classifyRetention(object('media-proof/2026-08-01/SO-1/video.mp4', 21), now), 'video')
  assert.equal(classifyRetention(object('media-proof/2026-08-01/SO-1/Loading Video-loading-order.mov', 40), now), 'video')
})
test('photos and young videos fail closed', () => {
  assert.equal(classifyRetention(object('media-proof/old/photo.jpg', 100), now), null)
  assert.equal(classifyRetention(object('media-proof/new/video.mp4', 20), now), null)
})
test('aged payment documents are eligible but unknown documents are not', () => {
  assert.equal(classifyRetention(object('payments/2026/proof.pdf', 30), now), 'document')
  assert.equal(classifyRetention(object('unknown/old.pdf', 300), now), null)
})
test('delete requires post-delete HEAD verification and metadata cleanup preserves failures', async () => {
  const r2 = await readFile(new URL('../src/lib/r2.ts', import.meta.url), 'utf8')
  const retention = await readFile(new URL('../src/lib/attachment-retention.ts', import.meta.url), 'utf8')
  assert.match(r2, /verification = await headR2Object\(key\)/)
  assert.match(r2, /if \(verification\.exists\) throw/)
  assert.match(retention, /else \{ kept\.push\(file\)/)
})
