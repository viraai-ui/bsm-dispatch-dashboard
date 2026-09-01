import assert from 'node:assert/strict'
import test from 'node:test'
import { isAuthorizedCron } from '../src/lib/cron-auth.ts'
import { isLegalSerialTransition } from '../src/lib/serial-ledger.ts'
import { githubWriteRetryDelay, isGitHubWriteConflict } from '../src/lib/workflow-store.ts'

test('cron auth fails closed when secret is missing or weak', () => {
  const previous = process.env.CRON_SECRET
  delete process.env.CRON_SECRET
  assert.equal(isAuthorizedCron(new Request('http://local', { headers: { 'x-vercel-cron': '1' } })), false)
  process.env.CRON_SECRET = 'short'
  assert.equal(isAuthorizedCron(new Request('http://local', { headers: { authorization: 'Bearer short' } })), false)
  if (previous === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = previous
})

test('cron auth accepts only exact strong bearer secret', () => {
  const previous = process.env.CRON_SECRET
  process.env.CRON_SECRET = '0123456789abcdef0123456789abcdef'
  assert.equal(isAuthorizedCron(new Request('http://local', { headers: { authorization: 'Bearer 0123456789abcdef0123456789abcdef' } })), true)
  assert.equal(isAuthorizedCron(new Request('http://local', { headers: { authorization: 'Bearer wrong', 'x-vercel-cron': '1' } })), false)
  if (previous === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = previous
})

test('serial state machine is idempotent and rejects backwards transitions', () => {
  assert.equal(isLegalSerialTransition('allocated_pending', 'processed'), true) // no-QR path
  assert.equal(isLegalSerialTransition('generated', 'processed'), true)
  assert.equal(isLegalSerialTransition('processed', 'dispatched'), true)
  assert.equal(isLegalSerialTransition('processed', 'processed'), true)
  assert.equal(isLegalSerialTransition('dispatched', 'processed'), false)
  assert.equal(isLegalSerialTransition('voided', 'generated'), false)
})

test('workflow mirror retries GitHub SHA races with bounded backoff', () => {
  assert.equal(isGitHubWriteConflict(new Error('is at 200f5036eecae8079798d973d3a3aaffa30f22c1 but expected 10d48ce5ec6033382ca6a2d1bed98a41c8f6a663')), true)
  assert.equal(isGitHubWriteConflict(new Error('Conflict (409): sha does not match')), true)
  assert.equal(isGitHubWriteConflict(new Error('Bad credentials')), false)
  assert.deepEqual([0, 1, 2, 20].map(githubWriteRetryDelay), [100, 200, 400, 1000])
})
