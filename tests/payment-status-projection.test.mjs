import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeSalesOrderNumber, projectPaymentStatuses } from '../src/lib/payment-status-projection.ts'

test('empty projection has no entries', () => assert.deepEqual(projectPaymentStatuses([]), {}))
test('pending and received project to short display labels', () => {
  assert.deepEqual(projectPaymentStatuses([{ salesOrderNumber: 'SO-1', status: 'Pending' }]), { 'SO-1': 'Pending' })
  assert.deepEqual(projectPaymentStatuses([{ salesOrderNumber: 'SO-2', status: 'Payment Received' }]), { 'SO-2': 'Received' })
})
test('multiple received records remain received and pending dominates', () => {
  assert.equal(projectPaymentStatuses([{ salesOrderNumber: 'SO-1', status: 'Payment Received' }, { salesOrderNumber: ' SO - 1 ', status: 'Payment Received' }])['SO-1'], 'Received')
  assert.equal(projectPaymentStatuses([{ salesOrderNumber: 'SO-1', status: 'Payment Received' }, { salesOrderNumber: 'SO-1', status: 'Pending' }])['SO-1'], 'Pending')
})
test('normalization is conservative', () => {
  assert.equal(normalizeSalesOrderNumber('  so  -  001 / A  '), 'SO-001 / A')
  assert.notEqual(normalizeSalesOrderNumber('SO-001'), normalizeSalesOrderNumber('SO-1'))
})
test('malformed status fails safe and malformed SO is omitted', () => {
  assert.deepEqual(projectPaymentStatuses([{ salesOrderNumber: 'SO-9', status: 'received' }, { salesOrderNumber: null, status: 'Payment Received' }]), { 'SO-9': 'Pending' })
})
