#!/usr/bin/env node
const fs = require('node:fs')
const cp = require('node:child_process')
const { Client } = require('pg')
const APPLY = process.argv.includes('--apply')
const SNAPSHOT = (() => { const i=process.argv.indexOf('--snapshot'); return i>=0 ? process.argv[i+1] : '' })()
const FLOOR = 26270758

function loadEnv() {
  if (!fs.existsSync('.env.local')) return
  for (const line of fs.readFileSync('.env.local','utf8').split(/\r?\n/)) { const m=line.match(/^([^#=]+)=(.*)$/); if(!m || process.env[m[1].trim()]) continue; let v=m[2].trim(); if((v[0]==='"'&&v.at(-1)==='"')||(v[0]==="'"&&v.at(-1)==="'")) v=v.slice(1,-1); process.env[m[1].trim()]=v }
}
async function githubWorkflow() {
  if (SNAPSHOT) return { workflow: JSON.parse(fs.readFileSync(SNAPSHOT,'utf8')), source: `snapshot:${SNAPSHOT}` }
  const owner=process.env.GITHUB_OWNER||'viraai-ui', repo=process.env.GITHUB_REPO||'bsm-dispatch-dashboard', path='data/workflow-store.json'
  try { const ghEnv={...process.env}; delete ghEnv.GITHUB_TOKEN; delete ghEnv.GH_TOKEN; let data=JSON.parse(cp.execFileSync('gh',['api',`repos/${owner}/${repo}/contents/${path}`],{encoding:'utf8',stdio:['ignore','pipe','pipe'],env:ghEnv})); const sha=data.sha; if(!data.content && data.git_url) data=JSON.parse(cp.execFileSync('gh',['api',data.git_url],{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:20*1024*1024,env:ghEnv})); return { workflow:JSON.parse(Buffer.from(String(data.content||'').replace(/\s/g,''),'base64').toString('utf8')),source:`gh-keyring:${owner}/${repo}@${sha}` } }
  catch (error) { throw new Error(`No workflow source: pass --snapshot FILE exported freshly from the live workflow, or authenticate gh CLI keyring (${error.message})`) }
}
function status(machine){ return machine.dispatchedAt?'dispatched':machine.processedAt?'processed':machine.qrStatus==='generated'?'generated':'allocated_pending' }
async function run(){
  loadEnv(); const url=process.env.DATABASE_URL||process.env.NEON_DATABASE_URL; if(!url) throw new Error('DATABASE_URL/NEON_DATABASE_URL is required')
  const {workflow,source}=await githubWorkflow(); const client=new Client({connectionString:url}); await client.connect()
  try {
    await client.query('begin'); await client.query(fs.readFileSync('db/serial-ledger.sql','utf8'))
    const dbMachines=(await client.query(`select id::text,serial_number,sales_order_number,zoho_sales_order_id,source,created_at from machines where serial_number ~ '^[0-9]+$' and serial_number::bigint>$1 order by serial_number::bigint`,[FLOOR])).rows
    const candidates=new Map(); let dbDuplicateSerials=0, workflowDuplicateSerials=0
    function add(serial,row,priority){ const old=candidates.get(serial); if(old){ if(priority===1) dbDuplicateSerials++; else workflowDuplicateSerials++; old.aliases.push({machineIdentity:row.machineIdentity,orderId:row.orderId,machineId:row.machineId,source:row.source}); if(priority>old.priority){row.aliases=old.aliases;row.priority=priority;candidates.set(serial,row)} } else {row.aliases=[];row.priority=priority;candidates.set(serial,row)} }
    for(const row of dbMachines) add(String(row.serial_number),{machineIdentity:`master:${row.id}`,orderId:row.zoho_sales_order_id||`master:${row.id}`,machineId:row.id,salesOrderNumber:row.sales_order_number||'',source:row.source||'neon_machines',status:'generated',metadata:{neonMachine:row}},1)
    let workflowRows=0
    for(const [orderId,order] of Object.entries(workflow.orders||{})) for(const machine of Object.values(order.machines||{})){ const serial=String(machine.serialNumber||'').trim(); if(!/^\d+$/.test(serial)||Number(serial)<=FLOOR) continue; workflowRows++; add(serial,{machineIdentity:`${orderId}:${machine.machineUnitId}`,orderId,machineId:machine.machineUnitId,salesOrderNumber:order.salesOrderNumber||'',source:'workflow_backfill',status:status(machine),metadata:{lineItemId:machine.lineItemId,qrStatus:machine.qrStatus}},2) }
    const max=Math.max(FLOOR,Number(workflow.serialCounter||FLOOR),...candidates.keys().map(Number)); let historicalGaps=0
    for(let n=FLOOR+1;n<=max;n++) if(!candidates.has(String(n))){historicalGaps++;candidates.set(String(n),{machineIdentity:`historical-gap:${n}`,orderId:'historical-gap',machineId:`gap-${n}`,salesOrderNumber:'',source:'historical_gap',status:'voided',aliases:[],metadata:{classification:'unexplained_at_backfill',note:'Immutable reservation; never issue or reuse'}})}
    let inserted=0,existing=0
    for(const [serial,row] of [...candidates].sort((a,b)=>Number(a[0])-Number(b[0]))){ row.metadata.aliases=row.aliases; const r=await client.query(`insert into serial_allocations(serial_number,machine_identity,order_id,sales_order_number,machine_unit_id,idempotency_key,qr_token,status,source,allocated_at,generated_at,processed_at,dispatched_at,voided_at,metadata) values($1::bigint,$2,$3,$4,$5,$6,$1::text,$7,$8,coalesce(($9::jsonb#>>'{neonMachine,created_at}')::timestamptz,now()),case when $7 in ('generated','processed','dispatched') then now() end,case when $7 in ('processed','dispatched') then now() end,case when $7='dispatched' then now() end,case when $7='voided' then now() end,$9::jsonb) on conflict(serial_number) do nothing`,[serial,row.machineIdentity,row.orderId,row.salesOrderNumber,row.machineId,`serial:${row.machineIdentity}`,row.status,row.source,JSON.stringify(row.metadata)]); inserted+=r.rowCount; existing+=1-r.rowCount }
    await client.query(`update serial_counters set last_serial=$1,updated_at=now() where namespace='dashboard'`,[max])
    const check=(await client.query(`select (select last_serial::text from serial_counters where namespace='dashboard') counter,(select coalesce(max(serial_number),$1)::text from serial_allocations where namespace='dashboard') ledger_max,(select count(*)::int from generate_series($1::bigint+1,(select last_serial from serial_counters where namespace='dashboard')) n left join serial_allocations a on a.serial_number=n where a.serial_number is null) unexplained`,[FLOOR])).rows[0]
    const classifications={workflow_authoritative:[...candidates.values()].filter(x=>x.source==='workflow_backfill').length,neon_machine_only:[...candidates.values()].filter(x=>x.source!=='workflow_backfill'&&x.source!=='historical_gap').length,historical_voided:historicalGaps,workflow_duplicate_serials:workflowDuplicateSerials,neon_duplicate_serials:dbDuplicateSerials}
    const summary={mode:APPLY?'apply':'dry-run',workflowSource:source,workflowCounter:Number(workflow.serialCounter||FLOOR),workflowRows,neonMachineRows:dbMachines.length,max,inserted,existing,classifications,verification:check}
    if(String(check.counter)!==String(check.ledger_max)||Number(check.unexplained)!==0) throw new Error(`Invariant failed: ${JSON.stringify(check)}`)
    if(APPLY) await client.query('commit'); else await client.query('rollback'); console.log(JSON.stringify(summary,null,2))
  } catch(error){await client.query('rollback').catch(()=>{});throw error} finally{await client.end()}
}
run().catch(error=>{console.error(error.message);process.exit(1)})
