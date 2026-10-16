import assert from 'node:assert/strict'
import test from 'node:test'

type Guard = { version: 1; dayIst: string; used: number; limit: number; circuitUntil: string | null; circuitReason: string | null; lease: { owner: string; until: string } | null; lastCallAt?: string }

test('authoritative CAS preserves usage and lease when the display snapshot is stale', async () => {
  process.env.GITHUB_TOKEN = 'test-token'
  let state: Guard = { version: 1, dayIst: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()), used: 16, limit: 1200, circuitUntil: null, circuitReason: null, lease: null, lastCallAt: 'kept' }
  let sha = 'a'.repeat(40)
  let puts = 0
  let rawReads = 0
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    if (url.includes('raw.githubusercontent.com')) {
      rawReads++
      return Response.json({ ...state, used: 0, lastCallAt: undefined })
    }
    if (init?.method === 'PUT') {
      const body = JSON.parse(String(init.body))
      assert.equal(body.sha, sha)
      state = JSON.parse(Buffer.from(body.content, 'base64').toString())
      puts++
      sha = String(puts + 1).repeat(40)
      return Response.json({ content: { sha } })
    }
    const bytes = Buffer.from(JSON.stringify(state, null, 2))
    const { createHash } = await import('node:crypto')
    sha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
    return Response.json({ sha, size: bytes.length, content: bytes.toString('base64') })
  }) as typeof fetch

  const { acquireDispatchLease, releaseDispatchLease, reserveDispatchCalls } = await import('../src/lib/dispatch-sync-guard')
  const first = await acquireDispatchLease('cron')
  assert.equal(first.acquired, true)
  const overlapping = await acquireDispatchLease('manual')
  assert.equal(overlapping.acquired, false)
  assert.equal(overlapping.state.lease?.owner, 'cron')
  assert.equal(puts, 1, 'busy acquisition is a no-op and must not commit')
  await reserveDispatchCalls(1)
  assert.equal(state.used, 17, 'stale used=0 snapshot must not reset usage')
  assert.equal(state.lease?.owner, 'cron', 'reservation must preserve active lease')
  await releaseDispatchLease('not-the-owner')
  assert.equal(puts, 2, 'wrong-owner release is a no-op')
  await releaseDispatchLease('cron')
  assert.equal(state.lease, null)
  assert.equal(state.used, 17)
  assert.equal(state.lastCallAt === 'kept', false)
  assert.equal(rawReads, 0, 'mutations must never use cached display reads')
})