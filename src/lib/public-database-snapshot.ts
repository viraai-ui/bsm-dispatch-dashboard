import crypto from 'node:crypto'
import { loadDatabaseOrders } from './database-orders'
import { buildOrderStatusMap, type StatusTone } from './status-projection'
import type { MediaUpload } from './media-proof'
import { isAllowedGithubUrl } from './public-database-media'
import { isSafeR2Key } from './r2'
import { publicDatabaseRevision } from './public-database-freshness'
import { warrantyEnd } from './warranty'
import durableSnapshot from '../../data/public-database-snapshot.json'

export type PublicDatabaseRow = { id:string; salesOrderNumber:string; customerName:string; units:number; salesperson?:string; warrantyDate:string; warrantyEnd:string; mediaLabel:string; mediaTone:StatusTone; lifecycleLabel:string; builtyUploaded:boolean }
export type PublicMediaRef = { id:string; orderId:string; machineId?:string; kind:'packing'|'loading'|'builty'; source:'r2'|'github'|'workdrive'; value:string; name?:string; contentType?:string }
export type PublicDatabaseDetail = { id:string; salesOrderNumber:string; customerName:string; salesperson:string; shippingAddress:string; deliveryDate:string; warrantyDate:string; status:{lifecycleLabel:string;mediaLabel:string}; machines:Array<{id:string;itemName:string;serialNumber:string;vendor:string}>; shipment?:{shipmentType?:string;transporterName?:string;transporterPhone?:string;vehicleNumber?:string;driverName?:string;driverPhone?:string;expectedDelivery?:string;shippedAt?:string;notes?:string}; mediaRefIds:string[] }
export type PublicDatabaseSnapshot = { schema:1; snapshotVersion:string; generatedAt:string; rows:PublicDatabaseRow[]; details:Record<string,PublicDatabaseDetail>; media:Record<string,PublicMediaRef>; haystacks:Record<string,string> }

const MAX_SNAPSHOT_AGE_MS = 5 * 60_000
let resolved = durableSnapshot as PublicDatabaseSnapshot
let resolvedRevision = -1
let retryAfter = 0
let current: Promise<PublicDatabaseSnapshot>|undefined

// Refresh immediately in the process that performed a business write and at
// most five minutes after a remote write on another instance. Keep serving the
// durable last-known-good snapshot if an upstream store is temporarily down.
export function getPublicDatabaseSnapshot(){
 const revision=publicDatabaseRevision()
 const fresh=Date.now()-Date.parse(resolved.generatedAt)<MAX_SNAPSHOT_AGE_MS
 if(fresh&&resolvedRevision===revision)return Promise.resolve(resolved)
 if(Date.now()<retryAfter)return Promise.resolve(resolved)
 if(current)return current
 const buildRevision=revision
 current=buildPublicDatabaseSnapshot().then(snapshot=>{assertCompleteSnapshot(snapshot,resolved);resolved=snapshot;resolvedRevision=buildRevision;retryAfter=0;return snapshot}).catch(error=>{retryAfter=Date.now()+60_000;console.error('public database refresh failed',error);return resolved}).finally(()=>{current=undefined})
 return current
}
export function clearPublicDatabaseSnapshot(){ resolvedRevision=-1;current=undefined }

export async function buildPublicDatabaseSnapshot():Promise<PublicDatabaseSnapshot>{
 const {databaseOrders,workflows,warrantyDates,shipmentRecords}=await loadDatabaseOrders()
 const {statuses,packingMediaRecords,loadingMediaRecords}=await buildOrderStatusMap(databaseOrders,workflows)
 const generatedAt=new Date().toISOString(); const media:Record<string,PublicMediaRef>={}; const details:Record<string,PublicDatabaseDetail>={}; const haystacks:Record<string,string>={}
 for(const order of databaseOrders){
  const refs:PublicMediaRef[]=[]
  collect(order.id,'packing',packingMediaRecords[order.id],refs); collect(order.id,'loading',loadingMediaRecords[order.id],refs)
  const lr=shipmentRecords[order.id]?.lrCopy; if(lr){const source=sourceFor({url:lr.url,r2Key:lr.r2Key});if(source) refs.push(makeRef(order.id,'builty',source,lr.name))}
  for(const ref of refs) media[ref.id]=ref
  const status=statuses[order.id]||{lifecycleLabel:'Open',mediaLabel:'Pending',mediaTone:'amber' as const}
  const shipment=shipmentRecords[order.id]
  details[order.id]={id:order.id,salesOrderNumber:order.salesOrderNumber,customerName:order.customerName,salesperson:order.salesperson||'',shippingAddress:order.shippingAddress||'',deliveryDate:order.deliveryDate||'',warrantyDate:warrantyDates[order.id]||'',status:{lifecycleLabel:status.lifecycleLabel,mediaLabel:status.mediaLabel},machines:order.machines.map(m=>({id:m.id,itemName:m.itemName,serialNumber:m.serialNumber||'',vendor:m.vendor||''})),shipment:shipment?{shipmentType:shipment.shipmentType,transporterName:shipment.transporterName,transporterPhone:shipment.transporterPhone,vehicleNumber:shipment.vehicleNumber,driverName:shipment.driverName,driverPhone:shipment.driverPhone,expectedDelivery:shipment.expectedDelivery,shippedAt:shipment.shippedAt,notes:shipment.notes}:undefined,mediaRefIds:refs.map(r=>r.id)}
  haystacks[order.id]=normalize([order.salesOrderNumber,order.customerName,order.salesperson,order.deliveryDate,status.lifecycleLabel,status.mediaLabel,shipment?.transporterName,shipment?.transporterPhone,shipment?.vehicleNumber,shipment?.driverName,shipment?.driverPhone,...order.machines.flatMap(m=>[m.serialNumber,m.itemName,m.vendor])].join(' '))
 }
 const rows=databaseOrders.map(o=>{const s=statuses[o.id];return{id:o.id,salesOrderNumber:o.salesOrderNumber,customerName:o.customerName,units:o.machines.length,salesperson:o.salesperson||'',warrantyDate:warrantyDates[o.id]||'',warrantyEnd:warrantyEnd(warrantyDates[o.id]),mediaLabel:s?.mediaLabel||'Pending',mediaTone:s?.mediaTone||'amber',lifecycleLabel:s?.lifecycleLabel||'Open',builtyUploaded:Boolean(shipmentRecords[o.id]?.lrCopy)}})
 // Content-derived: every cold instance serving the same durable store has the
 // same immutable version; wall-clock generation time must never split it.
 const version=crypto.createHash('sha256').update(JSON.stringify({rows,details,media})).digest('hex').slice(0,20)
 return {schema:1,snapshotVersion:version,generatedAt,rows,details,media,haystacks}
}
function assertCompleteSnapshot(next:PublicDatabaseSnapshot,previous:PublicDatabaseSnapshot){
 if(next.rows.length<Math.floor(previous.rows.length*.8))throw new Error(`Public database refresh incomplete: ${next.rows.length}/${previous.rows.length} rows`)
 const previousMedia=Object.keys(previous.media).length,nextMedia=Object.keys(next.media).length
 if(previousMedia&&nextMedia<Math.floor(previousMedia*.5))throw new Error(`Public database refresh incomplete: ${nextMedia}/${previousMedia} media`)
}
function collect(orderId:string,kind:'packing'|'loading',record:any,out:PublicMediaRef[]){for(const [machineId,unit] of Object.entries(record?.units||{}) as [string,any][])for(const file of [...(unit.videos||[]),...(unit.photos||[])]){const source=sourceFor(file);if(source)out.push(makeRef(orderId,kind,source,file.name,machineId))}}
function makeRef(orderId:string,kind:PublicMediaRef['kind'],source:{source:PublicMediaRef['source'];value:string},name?:string,machineId?:string){return{id:crypto.createHash('sha256').update(`${orderId}\0${kind}\0${source.source}\0${source.value}`).digest('base64url').slice(0,22),orderId,machineId,kind,...source,name}}
function sourceFor(file:Pick<MediaUpload,'url'|'workdriveUrl'|'workdriveFileId'|'r2Key'>){const key=file.r2Key||r2FromUrl(file.url);if(key&&isSafeR2Key(key,['media-proof/']))return{source:'r2' as const,value:key};if(file.workdriveFileId&&!file.workdriveFileId.startsWith('github:'))return{source:'workdrive' as const,value:file.workdriveFileId};const url=file.workdriveUrl||file.url||'';if(isAllowedGithubUrl(url))return{source:'github' as const,value:url};return null}
function r2FromUrl(value?:string|null){try{return value?.startsWith('/api/r2/view?')?new URL(value,'https://x').searchParams.get('key')||'':''}catch{return''}}
export function normalize(v:string){const low=v.toLowerCase();return `${low} ${low.replace(/[^a-z0-9]/g,'')} ${low.replace(/\D/g,'')}`}
