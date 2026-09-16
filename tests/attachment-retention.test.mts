import assert from 'node:assert/strict'
import test from 'node:test'
import { cleanMediaStore, cleanPayments, cleanShipmentStore, type DeleteMemo } from '../src/lib/attachment-retention.ts'

const NOW = Date.parse('2026-09-16T12:00:00.000Z')
const payment = (createdAt: string, key = 'payments/proof.jpg'): any => ({ id: 'p1', customerName: 'Customer', status: 'Payment Received', createdBy: 'Admin', createdAt, updatedAt: createdAt, attachments: [{ key, url: '/proof', name: 'proof.jpg', contentType: 'image/jpeg', size: 12 }] })
const media = (uploadedAt: string, kind: 'video'|'photo' = 'video', key = 'media-proof/packing/proof.mp4'): any => ({ records: { o1: { orderId: 'o1', salesOrderNumber: 'SO-1', submittedAt: uploadedAt, units: { m1: { photos: kind === 'photo' ? [{ id:'f', name:'f', type:'image/jpeg', kind, url:'', r2Key:key, storageProvider:'r2', uploadedAt }] : [], videos: kind === 'video' ? [{ id:'f', name:'f', type:'video/mp4', kind, url:'', r2Key:key, storageProvider:'r2', uploadedAt }] : [] } } } } })

test('30-day boundary removes at exactly 30 days but preserves one millisecond newer', async () => {
  let calls = 0
  const old = await cleanPayments([payment('2026-08-17T12:00:00.000Z')], async () => { calls++ }, { now: NOW })
  assert.equal(old.result.removed, 1); assert.equal(old.payments.length, 1); assert.deepEqual(old.payments[0].attachments, [])
  const fresh = await cleanPayments([payment('2026-08-17T12:00:00.001Z')], async () => { calls++ }, { now: NOW })
  assert.equal(fresh.result.removed, 0); assert.equal(fresh.payments[0].attachments?.length, 1); assert.equal(calls, 1)
})

test('shipment attachment clears without deleting shipment business record', async () => {
  const store: any = { shipments: { o1: { id:'s1', orderId:'o1', salesOrderNumber:'SO-1', customerName:'C', transporterName:'T', vehicleNumber:'V', driverName:'D', driverPhone:'1', shippedAt:'2026-08-01T00:00:00Z', lrCopy:{name:'lr.pdf',type:'application/pdf',url:'x',r2Key:'media-proof/shipment/lr.pdf'}, messages:{customer:{status:'sent'},salesperson:{status:'sent'}} } } }
  const out = await cleanShipmentStore(store, async () => {}, { now: NOW })
  assert.equal(out.result.removed, 1); assert.equal(out.store.shipments.o1.lrCopy, null); assert.equal(out.store.shipments.o1.vehicleNumber, 'V'); assert.equal(Object.keys(out.store.shipments).length, 1)
})

test('delete failure preserves attachment metadata', async () => {
  const out = await cleanPayments([payment('2026-08-01T00:00:00Z')], async () => { throw new Error('R2 unavailable') }, { now: NOW })
  assert.equal(out.result.removed, 0); assert.equal(out.result.errors.length, 1); assert.equal(out.payments[0].attachments?.length, 1)
})

test('duplicate keys delete once and clear every successful reference', async () => {
  let calls = 0; const memo: DeleteMemo = new Map()
  const key='payments/shared.jpg'
  const out = await cleanPayments([payment('2026-08-01T00:00:00Z', key), {...payment('2026-08-02T00:00:00Z', key),id:'p2'}], async () => { calls++ }, { now: NOW, memo })
  assert.equal(calls, 1); assert.equal(out.result.removed, 2); assert.ok(out.payments.every(p => p.attachments?.length === 0))
})

test('one-time 21-day selector removes boundary-old videos, not photos; normal policy is 30 days', async () => {
  const at21='2026-08-26T12:00:00.000Z'; let calls=0
  const oneTime=await cleanMediaStore(media(at21),async()=>{calls++},{now:NOW,days:21})
  assert.equal(oneTime.result.removed,1)
  const normal=await cleanMediaStore(media(at21),async()=>{calls++},{now:NOW,days:30})
  assert.equal(normal.result.removed,0)
  const photo=await cleanMediaStore(media(at21,'photo','media-proof/packing/photo.jpg'),async()=>{calls++},{now:NOW,days:21})
  assert.equal(photo.result.removed,0); assert.equal(calls,1)
})
