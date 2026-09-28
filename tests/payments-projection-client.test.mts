import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createPaymentProjectionReader, validProjection } from '../src/lib/payments-projection-client'
const snapshot = (version: number, status = 'Pending') => ({ version, generatedAt: '2026-09-28T00:00:00Z', bySalesOrder: { 'SO-001': status } })
test('single-flight, retry backoff, last-known-good, absent entries and old versions', async () => {
  process.env.DISPATCH_PAYMENT_PROJECTION_SECRET = 'x'.repeat(64)
  let calls = 0, now = 1, body = snapshot(2), offline = false
  const read = createPaymentProjectionReader((async (_url, options) => {
    calls++; assert.equal(options?.redirect, 'error'); assert.ok((options?.headers as any).authorization)
    if (offline) throw new Error('offline')
    return Response.json(body)
  }) as typeof fetch, () => now)
  const all = await Promise.all(Array.from({ length: 25 }, read)); assert.equal(calls, 1); assert.equal(all[0].version, 2)
  offline = true; now += 15_001
  assert.equal((await read()).version, 2); await read(); assert.equal(calls, 2)
  offline = false; now += 15_001; body = snapshot(1, 'Received')
  assert.equal((await read()).bySalesOrder['SO-001'], 'Pending')
  now += 15_001; body = snapshot(3, 'Partial'); assert.equal((await read()).bySalesOrder['SO-001'], 'Partial')
  now += 15_001; body = { ...snapshot(4), bySalesOrder: {} } as any
  assert.equal((await read()).bySalesOrder['SO-001'], 'Partial')
})
test('unconfigured and cold offline fail unavailable; malformed statuses rejected', async () => {
  delete process.env.DISPATCH_PAYMENT_PROJECTION_SECRET
  let calls = 0; const read = createPaymentProjectionReader((async () => { calls++; throw new Error('offline') }) as any)
  await assert.rejects(read(), /unavailable/); await assert.rejects(read(), /unavailable/); assert.equal(calls, 0)
  assert.equal(validProjection(snapshot(1, 'Paid')), false); assert.equal(validProjection(snapshot(1, 'Void')), true)
})
test('projection route is display-only, authenticated and never loads old ledger', () => {
  const route = readFileSync('src/app/api/payment-status-projection/route.ts', 'utf8')
  assert.match(route, /requireUser\(\['Admin', 'Operations'\]\)/)
  assert.doesNotMatch(route, /listPayments|workflow|update|write|payout|notification/)
  const ui = readFileSync('src/components/OrdersClient.tsx', 'utf8')
  assert.match(ui, /json.version > paymentProjectionVersion.current/)
  assert.match(ui, /setInterval\(focus, 15_000\)/)
  assert.match(ui, /setPaymentBySalesOrder\(previous => \(\{ \.\.\.previous, \.\.\.json.bySalesOrder \}\)\)/)
})
