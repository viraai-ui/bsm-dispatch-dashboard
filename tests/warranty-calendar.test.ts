import test from 'node:test'
import assert from 'node:assert/strict'
import { addCalendarMonthsClamped, publicWarrantyInfo } from '../src/lib/warranty.js'

test('13 calendar months clamps month-end rather than overflowing', () => {
  const end = addCalendarMonthsClamped(new Date(2025, 0, 31), 13)
  assert.deepEqual([end.getFullYear(), end.getMonth() + 1, end.getDate()], [2026, 2, 28])
  const leap = addCalendarMonthsClamped(new Date(2023, 0, 31), 13)
  assert.deepEqual([leap.getFullYear(), leap.getMonth() + 1, leap.getDate()], [2024, 2, 29])
})

test('warranty is valid through expiry day and void immediately after', () => {
  assert.equal(publicWarrantyInfo('2025-01-31', new Date(2026, 1, 28, 23, 59, 59)).valid, true)
  assert.equal(publicWarrantyInfo('2025-01-31', new Date(2026, 2, 1, 0, 0, 0)).valid, false)
})