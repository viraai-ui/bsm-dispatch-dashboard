import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { checkR2BrowserCors, ensureR2BrowserCors, ensureR2Cors } from '../src/lib/r2.ts'

const route = await readFile(new URL('../src/app/api/r2/upload-target/route.ts', import.meta.url), 'utf8')
const client = await readFile(new URL('../src/components/MediaProofClient.tsx', import.meta.url), 'utf8')
const audit = await readFile(new URL('../src/app/api/cron/daily-audit/route.ts', import.meta.url), 'utf8')

const goodHeaders = { 'access-control-allow-origin': 'https://dispatch.bsmindia.com', 'access-control-allow-methods': 'GET, PUT, HEAD' }
const env = { R2_ACCOUNT_ID: 'account', R2_ACCESS_KEY_ID: 'key', R2_SECRET_ACCESS_KEY: 'secret', R2_BUCKET: 'bucket' }

async function withFetch(mock, fn) {
  const originalFetch = globalThis.fetch
  const originalEnv = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]))
  Object.assign(process.env, env)
  globalThis.fetch = mock
  try { return await fn() } finally {
    globalThis.fetch = originalFetch
    for (const [key, value] of Object.entries(originalEnv)) value === undefined ? delete process.env[key] : process.env[key] = value
  }
}

test('preflight requires browser-visible origin and PUT headers, not just HTTP 2xx', async () => {
  await withFetch(async () => new Response(null, { status: 204 }), async () => {
    const result = await checkR2BrowserCors('https://example.test/upload')
    assert.equal(result.corsReady, false)
    assert.match(result.corsError, /origin=missing/)
  })
  await withFetch(async () => new Response(null, { status: 204, headers: goodHeaders }), async () => {
    assert.deepEqual(await checkR2BrowserCors('https://example.test/upload'), { corsReady: true })
  })
})

test('missing CORS is repaired and rechecked before a target is returned', async () => {
  const calls = []
  await withFetch(async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method })
    if (init.method === 'PUT') return new Response('', { status: 200 })
    if (calls.filter((call) => call.method === 'OPTIONS').length === 1) return new Response('', { status: 403 })
    return new Response(null, { status: 204, headers: goodHeaders })
  }, async () => assert.deepEqual(await ensureR2BrowserCors('https://example.test/upload'), { corsReady: true }))
  assert.deepEqual(calls.map((call) => call.method), ['OPTIONS', 'PUT', 'OPTIONS'])
})

test('concurrent CORS repairs collapse to one policy write and failures can retry', async () => {
  let writes = 0
  await withFetch(async (_url, init = {}) => {
    writes++
    await new Promise((resolve) => setTimeout(resolve, 10))
    return new Response('', { status: writes === 1 ? 500 : 200 })
  }, async () => {
    const first = await Promise.allSettled([ensureR2Cors(), ensureR2Cors()])
    assert.equal(writes, 1)
    assert.ok(first.every((result) => result.status === 'rejected'))
    await ensureR2Cors()
    assert.equal(writes, 2)
  })
})

test('both packing and loading use the guarded direct-R2 path and audit monitors it', () => {
  assert.match(route, /ensureR2BrowserCors\(target\.uploadUrl\)/)
  assert.match(route, /if \(!cors\.corsReady\) return apiError\(cors\.corsError, 503\)/)
  assert.match(client, /stage: mode/)
  assert.match(client, /mode === 'packing'/)
  assert.match(client, /mode === 'loading'/)
  assert.match(audit, /uploadBrowserCorsReady: r2Cors\.corsReady/)
  assert.match(audit, /ensureR2BrowserCors/)
  assert.doesNotMatch(audit, /R2_BUCKET_NAME/)
})
