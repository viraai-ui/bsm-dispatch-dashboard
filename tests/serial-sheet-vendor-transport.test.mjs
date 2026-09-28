import test from 'node:test'
import assert from 'node:assert/strict'
import { Pool } from 'pg'
import { reconcileVendorRanges, reserveSheetCall, coolDownSheet, isSheetQuota, SHEET_INTERVAL_MS, SHEET_COOLDOWN_MS } from '../src/lib/serial-sheet-vendor-transport.ts'
const header = {row_index:1,row_details:[{column_index:5,content:'Serial No.'},{column_index:8,content:'Make'}]}
const row = (n,v='') => ({row_index:n,row_details:[{column_index:5,content:String(n)},{column_index:8,content:v}]})
function harness(rows) {
 const calls=[]; const data=structuredClone(rows)
 return {calls,post:async p=>{
  calls.push(p)
  if(p.method==='worksheet.csvdata.set') { const values=p.data.split('\n').map(x=>x.slice(1,-1).replaceAll('""','"'));values.forEach((v,i)=>data.find(r=>r.row_index===Number(p.row)+i).row_details[1].content=v);return {} }
  assert.equal(p.method,'range.content.get');assert.equal(p.start_column,'5');assert.equal(p.end_column,'8');assert.equal(p.range,undefined)
  return {range_details:structuredClone(data.filter(r=>r.row_index>=Number(p.start_row)&&r.row_index<=Number(p.end_row)))}
 }}
}
test('documented bounded range/CSV/readback shapes, escaping and idempotency',async()=>{
 const rows=[header,row(2),row(3)];const sources=[{serial:'2',vendor:'A "B"'},{serial:'3',vendor:'C'}]; const h=harness(rows)
 const result=await reconcileVendorRanges(rows,sources,'Tab',h.post)
 assert.equal(result.updated,2);assert.equal(h.calls.length,3)
 assert.deepEqual(h.calls[1],{method:'worksheet.csvdata.set',worksheet_name:'Tab',row:'2',column:'8',ignore_empty:'true',data:'"A ""B"""\n"C"'})
 const done=[header,row(2,'A "B"'),row(3,'C')];const repeat=harness(done);await reconcileVendorRanges(done,sources,'Tab',repeat.post);assert.equal(repeat.calls.length,0)
})
test('four groups max and twenty cells max; manual values preserved',async()=>{
 const rows=[header,...Array.from({length:30},(_,i)=>row(2+i*2))];const sources=rows.slice(1).map(r=>({serial:String(r.row_index),vendor:'V'}));const h=harness(rows)
 assert.equal((await reconcileVendorRanges(rows,sources,'Tab',h.post)).updated,4);assert.equal(h.calls.length,12)
 const contiguous=[header,...Array.from({length:30},(_,i)=>row(i+2))];const hc=harness(contiguous);assert.equal((await reconcileVendorRanges(contiguous,contiguous.slice(1).map(r=>({serial:String(r.row_index),vendor:'V'})),'Tab',hc.post)).updated,20)
 const manual=harness([header,row(2,'MANUAL')]);const result=await reconcileVendorRanges([header,row(2)],[{serial:'2',vendor:'V'}],'Tab',manual.post);assert.equal(manual.calls.length,1);assert.equal(result.outcomes[0].status,'conflict')
})
test('quota stops immediately, keeps verified unrelated rows, no blind write replay',async()=>{
 let calls=0;const result=await reconcileVendorRanges([header,row(2),row(4,'V')],[{serial:'2',vendor:'V'},{serial:'4',vendor:'V'}],'Tab',async()=>{calls++;throw Object.assign(Error('limit'),{code:2950})})
 assert.equal(calls,1);assert.equal(result.outcomes[1].status,'verified');assert.equal(result.errors.length,1)
 assert.ok(isSheetQuota({code:'2950'}));assert.ok(isSheetQuota({status:429}));assert.equal(SHEET_INTERVAL_MS,1200);assert.equal(SHEET_COOLDOWN_MS,310000)
})
test('durable reservations pace calls and cooldown rejects without sleep/retry',async()=>{
 const original=Pool.prototype.query;const now=Date.now;const timer=global.setTimeout;let clock=10000,next=0,cool=0;const waits=[]
 process.env.DATABASE_URL='postgres://unused'
 Date.now=()=>clock;global.setTimeout=(fn,ms)=>{waits.push(ms);clock+=ms;fn();return 0}
 Pool.prototype.query=async function(sql,args){
  if(sql.startsWith('CREATE'))return {rows:[]}
  if(sql.includes('RETURNING')) {if(cool>clock)return {rows:[]};next=Math.max(next,clock)+args[2];return {rows:[{next_at:next}]}}
  cool=args[1];return {rows:[]}
 }
 try {await reserveSheetCall('doc');await reserveSheetCall('doc');await reserveSheetCall('doc');assert.deepEqual(waits,[1200,1200]);await coolDownSheet('doc');await assert.rejects(reserveSheetCall('doc'),/cooldown/);assert.equal(cool,clock+310000)}
 finally{Pool.prototype.query=original;Date.now=now;global.setTimeout=timer}
})
