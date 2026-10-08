import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const mediaProof = await readFile(new URL('../src/lib/media-proof.ts', import.meta.url), 'utf8')
const database = await readFile(new URL('../src/lib/media-proof-database.ts', import.meta.url), 'utf8')
const client = await readFile(new URL('../src/components/MediaProofClient.tsx', import.meta.url), 'utf8')
const packingRoute = await readFile(new URL('../src/app/api/media-proof/route.ts', import.meta.url), 'utf8')
const loadingRoute = await readFile(new URL('../src/app/api/loading-video/route.ts', import.meta.url), 'utf8')
const uploadTarget = await readFile(new URL('../src/app/api/r2/upload-target/route.ts', import.meta.url), 'utf8')
const cleanupRoute = await readFile(new URL('../src/app/api/media-proof/cleanup/route.ts', import.meta.url), 'utf8')

 test('R2 registration and submission persist metadata in Postgres, never GitHub', () => {
  assert.match(mediaProof, /return readMediaProofDatabase\(stage\)/)
  assert.match(mediaProof, /await writeMediaProofRecord\(stage, current\)/)
  assert.match(mediaProof, /await writeMediaProofRecord\(stage, record\)/)
  assert.doesNotMatch(mediaProof, /githubWriteJson\(path, store/)
  assert.match(database, /CREATE TABLE IF NOT EXISTS media_proof_records/)
  assert.match(database, /ON CONFLICT \(stage, order_id\) DO UPDATE/)
})

test('existing bundled media is seeded non-destructively', () => {
  assert.match(database, /bundledPacking/)
  assert.match(database, /bundledLoading/)
  assert.match(database, /ON CONFLICT \(stage, order_id\) DO NOTHING/)
})

test('registration uses a server-signed, upload-bound order capability and skips GitHub resolution', () => {
  assert.match(uploadTarget, /issueMediaRegistrationCapability/)
  assert.match(client, /registrationToken: target\.registrationToken/)
  assert.match(packingRoute, /verifyMediaRegistrationCapability/)
  assert.match(loadingRoute, /verifyMediaRegistrationCapability/)
  assert.doesNotMatch(client, /orderSnapshot/)
})

test('replacement and cleanup remove expired database rows without GitHub writes', () => {
  assert.match(database, /DELETE FROM media_proof_records/)
  assert.match(cleanupRoute, /replaceMediaProofDatabase\('packing'/)
  assert.doesNotMatch(cleanupRoute, /githubWriteJson/)
})
