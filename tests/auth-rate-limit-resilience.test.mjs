import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('login has a bundled durable user fallback when GitHub is rate limited', async () => {
  const auth = await read('src/lib/auth.ts')
  const users = JSON.parse(await read('data/auth-users-store.json'))
  assert.ok(users.users.length > 0)
  assert.match(auth, /import bundledUserStore from '\.\.\/\.\.\/data\/auth-users-store\.json'/)
  assert.match(auth, /rate limit\|api request limit\|too many requests\|quota/i)
  assert.match(auth, /data = fallback/)
})

test('user-store reads are cached instead of calling GitHub on every session check', async () => {
  const auth = await read('src/lib/auth.ts')
  assert.match(auth, /USER_STORE_CACHE_MS = 5 \* 60 \* 1000/)
  assert.match(auth, /userStoreCache\.expiresAt > Date\.now\(\)/)
  assert.match(auth, /userStoreCache = \{ store: copyUserStore\(store\)/)
})