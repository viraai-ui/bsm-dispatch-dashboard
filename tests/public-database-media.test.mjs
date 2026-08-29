import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const read = (path) => fs.readFile(new URL(path, root), 'utf8')

test('public database replaces persisted media URLs with record-scoped capabilities', async () => {
  const page = await read('src/app/crm-serial-database/page.tsx')
  assert.match(page, /transformPublicMediaRecords\(packingMediaRecords, 'packing'\)/)
  assert.match(page, /transformPublicMediaRecords\(loadingMediaRecords, 'loading'\)/)
  assert.match(page, /transformPublicShipments\(shipmentRecords\)/)
  assert.doesNotMatch(page, /packingMediaRecords=\{packingMediaRecords\}/)
})

test('capabilities are short lived, HMAC signed, exact-record bound, and validate legacy spaces', async () => {
  const source = await read('src/lib/public-database-media.ts')
  assert.match(source, /createHmac\('sha256'/)
  assert.match(source, /timingSafeEqual/)
  assert.match(source, /orderId: string/)
  assert.match(source, /CAPABILITY_TTL_SECONDS = 10 \* 60/)
  assert.match(source, /capabilityIsReferenced/)
  assert.match(source, /isSafeR2Key\(value, \['media-proof\/'\]\)/)
  assert.match(source, /Invalid public media reference/)
})

test('public resolver is read-only, rate limited and private; authenticated R2 route remains unchanged', async () => {
  const route = await read('src/app/api/public/database/media/route.ts')
  const authenticated = await read('src/app/api/r2/view/route.ts')
  assert.match(route, /export async function GET/)
  assert.match(route, /export async function HEAD/)
  assert.doesNotMatch(route, /export async function (POST|PUT|PATCH|DELETE)/)
  assert.match(route, /private, no-store/)
  assert.match(route, /status: 429/)
  assert.match(route, /createR2ViewUrl\(capability.value, 120\)/)
  assert.match(route, /createR2HeadUrl\(capability.value, 120\)/)
  assert.match(route, /capabilityIsReferenced/)
  assert.match(route, /request.headers.get\('range'\)/)
  assert.match(authenticated, /requireUser\(\['Admin', 'Operations', 'Media', 'Accounts', 'Database'\]\)/)
})
