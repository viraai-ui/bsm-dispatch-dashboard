// Operator-only, blank Make contiguous CSV repair. No append or workflow writes.
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { withSerialSheetLock } from '../src/lib/serial-sheet-lock'
const require = createRequire(import.meta.url)
const v = require('./verify-serial-vendors.cjs')
const dir = process.argv[2]
if (!dir || process.argv[3] !== '--apply') throw Error('Requires baseline directory --apply')
const root = path.dirname(dir), e = process.env
const log = (x: unknown) => { const line = JSON.stringify({ at: new Date().toISOString(), ...x as any }); console.log(line); fs.appendFileSync(path.join(root, 'quota-run.jsonl'), line + '\n', { mode: 0o600 }) }
const save = (name: string, x: unknown) => fs.writeFileSync(path.join(root, name), JSON.stringify(x, null, 2), { mode: 0o600 })
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
let token = '', last = 0
const deadline = Date.now() + 30 * 60_000
async function post(params: Record<string,string>) {
  if (Date.now() > deadline) throw Error('Bounded 30 minute deadline exceeded')
  await sleep(Math.max(0, 1200 - (Date.now() - last)))
  last = Date.now()
  const response = await fetch(`${e.ZOHO_SHEET_API_DOMAIN || `https://sheet.zoho.${e.ZOHO_DC || 'in'}`}/api/v2/${e.ZOHO_SERIAL_SHEET_ID}`, { method: 'POST', headers: { Authorization: `Zoho-oauthtoken ${token}` }, body: new URLSearchParams({ worksheet_name: e.ZOHO_SERIAL_SHEET_NAME || 'Sr.No.26-27', ...params }), signal: AbortSignal.timeout(45000) })
  const data = await response.json()
  if (!response.ok || data.error_code || data.status === 'failure') { const error: any = Error(data.error_message || `HTTP ${response.status}`); error.quota = Number(data.error_code) === 2950 || response.status === 429 || /quota|request limit|usage limit/i.test(error.message); throw error }
  return data
}
async function main() {
 const result = await withSerialSheetLock(async () => {
  const original = JSON.parse(fs.readFileSync(path.join(dir,'sheet-raw.json'),'utf8'))
  const report = JSON.parse(fs.readFileSync(path.join(dir,'vendor-report.json'),'utf8'))
  const approved = report.diff
  const fresh = await v.readSnapshot()
  assert.deepEqual(v.cells(fresh),v.cells(original),'Baseline changed; no write')
  assert.deepEqual(v.inspect(fresh,v.workflowSources(v.readWorkflow())).diff,approved,'Authority changed')
  save('quota-locked-before.json',fresh)
  const auth = await fetch(`https://accounts.zoho.${e.ZOHO_DC || 'in'}/oauth/v2/token`, { method:'POST', body:new URLSearchParams({grant_type:'refresh_token',client_id:e.ZOHO_SERIAL_SHEET_CLIENT_ID || e.ZOHO_CLIENT_ID || '',client_secret:e.ZOHO_SERIAL_SHEET_CLIENT_SECRET || e.ZOHO_CLIENT_SECRET || '',refresh_token:e.ZOHO_SERIAL_SHEET_REFRESH_TOKEN || ''}) }).then(r=>r.json())
  assert.ok(auth.access_token); token=auth.access_token
  const priority = ['26271344','26271349','26271358']
  const batches: any[][] = priority.map(serial=>approved.filter((x:any)=>x.serial===serial)).filter(x=>x.length)
  for(const item of approved.filter((x:any)=>!priority.includes(x.serial)).sort((a:any,b:any)=>a.row-b.row)) {
   const prev=batches[batches.length-1]
   if(prev && !priority.includes(prev[0].serial) && prev.length<50 && prev.at(-1).row+1===item.row && prev[0].column===item.column) prev.push(item)
   else batches.push([item])
  }
  log({event:'locked-plan',approved:approved.length,batches:batches.length})
  const serialColumn = Number(report.headers.find((h:any)=>String(h.content).replace(/[^a-z]/gi,'').toLowerCase()==='serialno').column_index)
  for(let i=0;i<batches.length;i++) {
   const batch=batches[i]
   for(let attempt=0;attempt<3;attempt++) {
    try {
     const sources=v.workflowSources(v.readWorkflow())
     for(const item of batch) assert.equal(sources.filter((s:any)=>s.serial===item.serial&&s.vendor===item.after).length,1,'Authority changed')
     const params={method:'range.content.get',start_row:String(batch[0].row),end_row:String(batch.at(-1).row),start_column:String(Math.min(serialColumn,batch[0].column)),end_column:String(Math.max(serialColumn,batch[0].column))}
     const pre=await post(params)
     assert.ok(Array.isArray(pre.range_details))
     const pending=[]
     for(const item of batch) {
      const row=pre.range_details.find((r:any)=>Number(r.row_index)===item.row)
      const value=(col:number)=>String(row?.row_details?.find((c:any)=>Number(c.column_index)===col)?.content ?? '').trim()
      assert.equal(value(serialColumn),item.serial,'Physical serial moved')
      const make=value(item.column)
      if(make==='') pending.push(item)
      else assert.equal(make,item.after,'Nonblank changed; stop without overwrite')
     }
     // Split again after fresh reread: never overwrite an already-filled cell.
     const chunks:any[][]=[]
     for(const item of pending) {const p=chunks.at(-1);if(p&&p.at(-1).row+1===item.row)p.push(item);else chunks.push([item])}
     for(const chunk of chunks) {
      await post({method:'worksheet.csvdata.set',row:String(chunk[0].row),column:String(chunk[0].column),ignore_empty:'true',data:chunk.map(x=>'"'+x.after.replaceAll('"','""')+'"').join('\n')})
     }
     const readback=await post(params)
     for(const item of batch) {
      const row=readback.range_details.find((r:any)=>Number(r.row_index)===item.row)
      const value=(col:number)=>String(row?.row_details?.find((c:any)=>Number(c.column_index)===col)?.content ?? '').trim()
      assert.equal(value(serialColumn),item.serial);assert.equal(value(item.column),item.after)
     }
     log({event:'verified-batch',index:i,changed:pending.length,serials:batch.map(x=>x.serial),rows:batch.map(x=>x.row)})
     break
    } catch(error:any) {
     log({event:'batch-error',index:i,attempt,error:error.message,quota:!!error.quota})
     if(!error.quota||attempt===2) throw error
     // Documented workbook lockout is five minutes. Never replay a write blindly.
     await sleep(310000)
    }
   }
  }
  execFileSync(process.execPath,['--env-file=.env.production.local','scripts/verify-serial-vendors.cjs',path.join(root,'quota-after'),path.join(dir,'sheet-raw.json')],{stdio:'inherit',timeout:120000})
  const final=JSON.parse(fs.readFileSync(path.join(root,'quota-after/vendor-report.json'),'utf8'))
  assert.equal(final.diff.length,0);assert.equal(final.physicalRows,report.physicalRows)
  assert.deepEqual(final.unknown,report.unknown);assert.deepEqual(final.conflicts,report.conflicts);assert.deepEqual(final.missing,report.missing)
  assert.deepEqual(final.cellChanges.map((x:any)=>x.key).sort(),approved.map((x:any)=>`${x.row}:${x.column}`).sort())
  for(const item of approved) assert.equal(String(final.cellChanges.find((x:any)=>x.key===`${item.row}:${item.column}`).after.content),item.after)
  // Independent fresh repeat of the exact repair planner: no writes permitted/needed.
  const repeatSnapshot=await v.readSnapshot(),repeat=v.inspect(repeatSnapshot,v.workflowSources(v.readWorkflow()))
  assert.equal(repeat.diff.length,0)
  assert.deepEqual(v.cells(repeatSnapshot),v.cells(JSON.parse(fs.readFileSync(path.join(root,'quota-after/sheet-raw.json'),'utf8'))))
  save('quota-repeat.json',{plannedWrites:repeat.diff.length,actualWrites:0,samples:repeat.samples,verified:repeat.verified.length})
  const acceptance={changed:final.cellChanges.length,remainingKnown:final.diff.length,unknown:final.unknown.length,conflicts:final.conflicts,physicalRows:final.physicalRows,missing:final.missing.length,unrelatedChanges:0,repeatWrites:0,samples:final.samples}
  save('quota-acceptance.json',acceptance);log({event:'complete',...acceptance})
  return acceptance
 })
 if(!result) throw Error('Advisory lock busy; no writes')
}
main().catch(error=>{log({event:'fatal',error:error.message});process.exitCode=1})
