import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('ordinary reads use quota-free raw snapshots; mutations retain authoritative SHA CAS', async () => {
  const source = await readFile(new URL('../src/lib/workflow-store.ts', import.meta.url), 'utf8')
  const readBody = source.slice(source.indexOf('export async function githubReadJson<T>'), source.indexOf('export async function githubWriteJson<T>'))
  assert.match(readBody, /raw\.githubusercontent\.com/)
  assert.doesNotMatch(readBody, /githubRequest\(`\/contents/)
  assert.match(source, /githubReadJsonAuthoritative<T>\(path\)/)
  assert.match(source, /body\.sha = current\.sha/)
})

test('staff-facing order API sanitizes provider quota errors', async () => {
  const source = await readFile(new URL('../src/app/api/orders/route.ts', import.meta.url), 'utf8')
  assert.match(source, /safeOrderSyncError/)
  assert.doesNotMatch(source, /`\$\{error\.message\}/)
})