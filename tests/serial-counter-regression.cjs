const assert = require('node:assert/strict')

function highestSerialCounter(store, initial = 26270758) {
  let highest = Math.max(Number(store.serialCounter || initial), initial)
  for (const order of Object.values(store.orders || {})) {
    for (const machine of Object.values(order.machines || {})) {
      const serial = Number(String(machine.serialNumber || '').trim())
      if (Number.isFinite(serial) && serial > highest) highest = serial
    }
  }
  return highest
}

const staleCounterStore = {
  serialCounter: 26270821,
  orders: {
    old: { machines: { a: { serialNumber: '26270822' }, b: { serialNumber: '26270823' } } },
  },
}

assert.equal(highestSerialCounter(staleCounterStore), 26270823)
assert.equal(String(highestSerialCounter(staleCounterStore) + 1), '26270824')
console.log('Serial counter regression passed: stale counter advances after highest saved serial')
