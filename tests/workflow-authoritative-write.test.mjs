import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
const initialCwd = process.cwd()
const dir = await mkdtemp(join(tmpdir(), 'dispatch-workflow-test-'))
process.chdir(dir)
process.env.GITHUB_TOKEN = 'isolated-test-token'
const module = await import('../src/lib/workflow-store.ts')
const realFetch = globalThis.fetch
function blob(data) { const bytes = Buffer.from(JSON.stringify(data)); return { sha: createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'), content: bytes.toString('base64'), size: bytes.length } }
const store = { orders: { existing: { salesOrderId: 'existing', salesOrderNumber: 'SO-kept', status: 'open', machines: {} } } }
const metadata = blob(store)
let puts = 0
try {
  await test('transient read continuity must never become a missing-SHA write base', async () => {
    globalThis.fetch = async () => { throw new Error('fetch failed') }
    await module.githubReadJson('data/unrelated.json', {}) // opens the legacy global read circuit
    globalThis.fetch = async (_url, init) => {
      if (init?.method === 'PUT') { puts++; const payload = JSON.parse(init.body); assert.equal(payload.sha, metadata.sha); assert.ok(JSON.parse(Buffer.from(payload.content, 'base64')).orders.existing); return Response.json({}) }
      return Response.json(metadata)
    }
    await module.upsertOrderWorkflow('new', () => ({ salesOrderId: 'new', salesOrderNumber: 'SO-new', status: 'open', machines: {} }))
    assert.equal(puts, 1)
  })
  await test('unavailable authoritative store fails before any PUT', async () => {
    puts = 0
    globalThis.fetch = async (_url, init) => { if (init?.method === 'PUT') puts++; return Response.json({ message: 'API rate limit exceeded' }, { status: 403 }) }
    await assert.rejects(module.upsertOrderWorkflow('new', () => ({ salesOrderId: 'new', status: 'open', machines: {} })))
    assert.equal(puts, 0)
  })
  await test('revision bytes mismatching SHA are rejected before any PUT', async () => {
    puts = 0
    globalThis.fetch = async (_url, init) => { if (init?.method === 'PUT') puts++; return Response.json({ ...metadata, content: Buffer.from('{}').toString('base64') }) }
    await assert.rejects(module.upsertOrderWorkflow('new', () => ({ salesOrderId: 'new', status: 'open', machines: {} })), /integrity|SHA|size/i)
    assert.equal(puts, 0)
  })
  await test('missing workflow store fails closed rather than recreating it from bundled data', async () => {
    puts = 0
    globalThis.fetch = async (_url, init) => { if (init?.method === 'PUT') puts++; return Response.json({ message: 'Not Found' }, { status: 404 }) }
    await assert.rejects(module.upsertOrderWorkflow('new', () => ({ salesOrderId: 'new', status: 'open', machines: {} })))
    assert.equal(puts, 0)
  })
} finally { globalThis.fetch = realFetch; process.chdir(initialCwd); await rm(dir, { recursive: true, force: true }) }
