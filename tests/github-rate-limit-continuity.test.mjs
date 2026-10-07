import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const initialCwd = process.cwd()
const dir = await mkdtemp(join(tmpdir(), 'dispatch-github-read-'))
await mkdir(join(dir, 'data'))
await writeFile(join(dir, 'data', 'orders.json'), JSON.stringify({ orders: ['SO-08089'] }))
process.chdir(dir)
process.env.GITHUB_TOKEN = 'isolated-test-token'
const store = await import(`../src/lib/workflow-store.ts?rate-limit-test=${Date.now()}`)
const realFetch = globalThis.fetch

try {
  await test('concurrent reads share one GitHub request and return isolated copies', async () => {
    let requests = 0
    globalThis.fetch = async (url) => {
      requests++
      assert.match(String(url), /^https:\/\/raw\.githubusercontent\.com\//)
      await new Promise(resolve => setTimeout(resolve, 10))
      return Response.json({ orders: ['remote'] })
    }
    const [left, right] = await Promise.all([
      store.githubReadJson('data/orders.json', { orders: [] }),
      store.githubReadJson('data/orders.json', { orders: [] }),
    ])
    left.data.orders.push('mutated')
    assert.deepEqual(right.data.orders, ['remote'])
    assert.equal(requests, 1)
    await store.githubReadJson('data/orders.json', { orders: [] })
    assert.equal(requests, 1)
  })

  await test('snapshot-provider failure serves the bundled snapshot and opens the circuit', async () => {
    let requests = 0
    globalThis.fetch = async () => {
      requests++
      return new Response('upstream unavailable', { status: 429 })
    }
    const limited = await store.githubReadJson('data/limited.json', { missing: true })
    assert.deepEqual(limited.data, { missing: true })
    const bundled = await store.githubReadJson('data/orders.json', { orders: [] })
    assert.deepEqual(bundled.data.orders, ['SO-08089'])
    assert.equal(requests, 1)
  })
} finally {
  globalThis.fetch = realFetch
  process.chdir(initialCwd)
  await rm(dir, { recursive: true, force: true })
}