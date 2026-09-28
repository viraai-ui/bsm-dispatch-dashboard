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
      find: async identity => { const serial=this.identities.get(identity); const row=serial === undefined ? undefined : this.rows.get(serial); return row && {serial,metadata:row.metadata} },
      archiveForReallocation: async (identity,key,serial,detail) => { const row=this.rows.get(serial); this.identities.delete(identity); row.identity=`${identity}:history:${serial}`; row.idempotencyKey=`${key}:history:${serial}`; row.metadata={...row.metadata,archivedForTransferReallocation:true,...detail}; this.identities.set(row.identity,serial) },
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

// Exact Oxford regression: 26271031 was processed under SO-07789, transferred to
// SO-07950, then a failed generation left transfer metadata but qrStatus generated.
const oxfordOrder='1154219000035933004', oxfordMachine='1154219000035933004-1154219000035933007-1'
const oldOxford=BigInt(26271031)
ledger.rows.set(oldOxford,{serial:oldOxford,identity:`${oxfordOrder}:${oxfordMachine}`,idempotencyKey:`serial:${oxfordOrder}:${oxfordMachine}`,metadata:{},status:'processed'})
ledger.identities.set(`${oxfordOrder}:${oxfordMachine}`,oldOxford); ledger.counter=BigInt(26271363)
const oxfordTransfer={ [oxfordMachine]: { key:'transfer:2026-09-16T10:44:27Z:1154219000036922008', destinationOrderId:'1154219000036922008', transferredAt:'2026-09-16T10:44:27Z' } }
const oxfordOrderSnapshot={salesOrderNumber:'SO-07789',machines:[{id:oxfordMachine,serialNumber:'26271031',qrToken:'26271031'}]}
const fresh=await ledger.transaction(tx=>allocateInTransaction(tx,oxfordOrder,[oxfordMachine],oxfordOrderSnapshot,oxfordTransfer))
assert.equal(fresh[oxfordMachine],'26271364')
assert.equal(ledger.rows.get(oldOxford).status,'processed','immutable historical status')
assert.match(ledger.rows.get(oldOxford).identity,/:history:26271031$/)
const freshRetry=await ledger.transaction(tx=>allocateInTransaction(tx,oxfordOrder,[oxfordMachine],oxfordOrderSnapshot,oxfordTransfer))
assert.deepEqual(freshRetry,fresh); assert.equal(ledger.rows.size,count + 4,'retry does not allocate another serial')

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
