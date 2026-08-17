import assert from 'node:assert/strict'
import { allocateInTransaction, findUnexplainedSerials, SERIAL_FLOOR } from '../src/lib/serial-ledger.ts'

class MemoryLedger {
  counter = SERIAL_FLOOR
  rows = new Map()
  identities = new Map()
  tail = Promise.resolve()
  async transaction(fn, { failInsertAt = -1 } = {}) {
    const previous = this.tail; let release; this.tail = new Promise(r => { release = r }); await previous
    const snapshot = { counter:this.counter, rows:new Map(this.rows), identities:new Map(this.identities) }; let inserts=0
    const tx = {
      maximum: async () => [...this.rows.keys()].reduce((m,n)=>n>m?n:m,this.counter),
      find: async identity => this.identities.get(identity),
      insert: async row => { if (++inserts === failInsertAt) throw new Error('injected insert failure'); if(this.rows.has(row.serial)) throw new Error('duplicate serial'); this.rows.set(row.serial,row); this.identities.set(row.identity,row.serial) },
      setCounter: async value => { if(value>this.counter)this.counter=value },
    }
    try { return await fn(tx) } catch(error){ this.counter=snapshot.counter;this.rows=snapshot.rows;this.identities=snapshot.identities;throw error } finally { release() }
  }
}
const ledger=new MemoryLedger()
const allocate=(order,ids,options)=>ledger.transaction(tx=>allocateInTransaction(tx,order,ids),options)

// 25 truly competing batches, three ordered units each.
const batches=await Promise.all(Array.from({length:25},(_,i)=>allocate(`order-${i}`,[`u${i}-1`,`u${i}-2`,`u${i}-3`])))
const values=batches.flatMap(Object.values).map(BigInt)
assert.equal(values.length,75); assert.equal(new Set(values.map(String)).size,75)
assert.deepEqual([...values].sort((a,b)=>a<b?-1:1),Array.from({length:75},(_,i)=>SERIAL_FLOOR+BigInt(i+1)))
for(const batch of batches) assert.deepEqual(Object.values(batch).map(BigInt),Object.values(batch).map(BigInt).sort((a,b)=>a<b?-1:1),'batch order')

// Failed transaction rolls every row and counter back: no consumed number.
const before=ledger.counter
await assert.rejects(allocate('rollback',['one','two','three'],{failInsertAt:2}),/injected/)
assert.equal(ledger.counter,before); assert.equal(ledger.identities.has('rollback:one'),false)
const afterRollback=await allocate('after-rollback',['one']); assert.equal(BigInt(afterRollback.one),before+BigInt(1))

// Retry/idempotency and simulated response timeout after commit both recover existing serial.
const first=await allocate('retry',['unit']); const count=ledger.rows.size
const retry=await allocate('retry',['unit']); assert.deepEqual(retry,first); assert.equal(ledger.rows.size,count)
let timeoutObserved=false; try { await allocate('timeout',['unit']); throw new Error('socket timeout after commit') } catch(error){timeoutObserved=true}
assert.equal(timeoutObserved,true); const timeoutRetry=await allocate('timeout',['unit']); assert.equal(ledger.identities.get('timeout:unit').toString(),timeoutRetry.unit)

// Downstream Zoho failure occurs after commit and cannot alter the allocation.
const zoho=await allocate('zoho',['unit']); await assert.rejects(Promise.reject(new Error('Zoho unavailable')),/Zoho/)
assert.equal((await allocate('zoho',['unit'])).unit,zoho.unit)

// Counter repair uses ledger maximum, preserving deleted order/history records.
ledger.counter=SERIAL_FLOOR
const repaired=await allocate('repair',['unit']); assert.equal(BigInt(repaired.unit),[...ledger.rows.keys()].sort((a,b)=>a<b?-1:1).at(-1))
ledger.identities.delete('retry:unit') // workflow/order deletion, ledger row remains immutable
assert.equal(ledger.rows.has(BigInt(first.unit)),true)

// Gap detector starts at floor+1 and treats a void row exactly like any reservation.
const floor=BigInt(100), coverage=[101,102,104].map(n=>({serial_number:String(n)}))
assert.deepEqual(findUnexplainedSerials(coverage,floor),{unexplained:['103'],max:'104'})
coverage.push({serial_number:'103'})
assert.deepEqual(findUnexplainedSerials(coverage,floor).unexplained,[])

console.log(`Serial ledger tests passed: 25 concurrent batches / 75 allocations, rollback, idempotency, timeout recovery, downstream failure isolation, counter repair, history preservation, ordering, gap detection`)
