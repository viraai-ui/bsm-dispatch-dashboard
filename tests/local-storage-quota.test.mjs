import assert from 'node:assert/strict'

const { safeLocalStorageSet, safeLocalStorageRemove } = await import('../src/lib/safe-local-storage.ts')

let removed = []
const quotaStorage = {
  setItem() { throw Object.assign(new Error('quota full'), { name: 'QuotaExceededError' }) },
  removeItem(key) { removed.push(key) },
}
assert.equal(safeLocalStorageSet('bsm.machine.database.v1', 'oversized', quotaStorage), false, 'quota errors must never escape or block durable workflows')
assert.equal(safeLocalStorageRemove('bsm.machine.database.v1', quotaStorage), true)
assert.deepEqual(removed, ['bsm.machine.database.v1'])

let value = ''
const storage = { setItem(_key, next) { value = next }, removeItem() {} }
assert.equal(safeLocalStorageSet('small', '{"serial":"26270759"}', storage), true)
assert.equal(value, '{"serial":"26270759"}')
console.log('Local-storage quota regression passed')
