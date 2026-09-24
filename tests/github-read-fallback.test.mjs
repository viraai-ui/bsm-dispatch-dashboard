import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = await readFile(new URL('../src/lib/workflow-store.ts', import.meta.url), 'utf8')

test('GitHub-backed dashboard reads fall back to bundled snapshots on transient provider failures', () => {
  assert.match(source, /async function readBundledJson/)
  assert.match(source, /rate limit\|api request limit\|too many requests\|quota\|fetch failed\|econnreset\|etimedout\|network/i)
  assert.match(source, /return \{ data: await readBundledJson\(path, fallback\) \}/)
})

test('a transient GitHub failure opens a short read circuit breaker', () => {
  assert.match(source, /GITHUB_READ_COOLDOWN_MS = 2 \* 60 \* 1000/)
  assert.match(source, /githubReadUnavailableUntil > Date\.now\(\)/)
  assert.match(source, /githubReadUnavailableUntil = Date\.now\(\) \+ GITHUB_READ_COOLDOWN_MS/)
})
