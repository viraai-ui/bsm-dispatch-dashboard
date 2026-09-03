import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const client = await readFile('src/components/PublicDatabaseClient.tsx', 'utf8')
const snapshot = await readFile('src/lib/public-database-snapshot.ts', 'utf8')
const route = await readFile('src/app/api/public/database/orders/[id]/route.ts', 'utf8')
const warranty = await readFile('src/lib/warranty.ts', 'utf8')

test('detail replaces status summary with explicit 13-month warranty presentation', () => {
  assert.doesNotMatch(client, /Status summary/i)
  assert.match(client, /Warranty Valid/)
  assert.match(client, /Warranty Void/)
  assert.match(client, /Delivery Date/)
  assert.match(client, /Warranty Valid Till/)
  assert.match(warranty, /setMonth\(end\.getMonth\(\) \+ months\)/)
  assert.match(warranty, /Math\.min\(day/)
})

test('packing stays machine-scoped and dispatch sections are separate and ordered', () => {
  assert.match(snapshot, /machineId\?:string/)
  assert.match(route, /machineId:r\.machineId/)
  assert.match(client, /media\.machineId === machine\.id/)
  const packing = client.indexOf('Machines & packing videos')
  const loading = client.indexOf('title="Loading Video"')
  const builty = client.indexOf('title="Builty \/ LR"')
  const transport = client.indexOf('Transport Details')
  assert.ok(packing < loading && loading < builty && builty < transport)
})

test('shipment parity and hover prefetch are retained', () => {
  for (const field of ['Shipment Type','Transporter Name','Transporter / Contact Number','Vehicle Number','Driver Name','Driver Mobile','Expected Delivery','Shipped At','Notes']) assert.match(client, new RegExp(field))
  assert.match(snapshot, /driverName:shipment\.driverName/)
  assert.match(snapshot, /shippedAt:shipment\.shippedAt/)
  assert.match(client, /onMouseEnter=\{\(\) => prefetch\(row\)\}/)
  assert.match(client, /detailCache/)
})
