import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const client = await readFile('src/components/PublicDatabaseClient.tsx', 'utf8')
const snapshot = await readFile('src/lib/public-database-snapshot.ts', 'utf8')
const route = await readFile('src/app/api/public/database/orders/[id]/route.ts', 'utf8')
const warranty = await readFile('src/lib/warranty.ts', 'utf8')
const awaitCss = await readFile('src/app/globals.css', 'utf8')

test('detail replaces status summary with explicit 13-month warranty presentation', () => {
  assert.doesNotMatch(client, /Status summary/i)
  assert.match(client, /Warranty Valid/)
  assert.match(client, /Warranty Void/)
  assert.match(client, /Delivery Date/)
  assert.match(client, /Warranty Valid Till/)
  assert.match(warranty, /setMonth\(end\.getMonth\(\) \+ months\)/)
  assert.match(warranty, /Math\.min\(day/)
})

test('premium popup has exact balanced section order and full-width compact machine rows', () => {
  assert.match(snapshot, /machineId\?:string/)
  assert.match(route, /machineId:r\.machineId/)
  assert.match(client, /media\.machineId === machine\.id/)
  const order = client.indexOf('pdb-order-card')
  const transport = client.indexOf('Transport Details')
  const packing = client.indexOf('pdb-machines-card')
  const warrantyCard = client.indexOf('pdb-warranty-card')
  const combined = client.indexOf('pdb-dispatch-media-card')
  assert.ok(order < transport && transport < packing && packing < warrantyCard && warrantyCard < combined)
  assert.match(client, /pdb-machine pdb-machine-compact/)
  assert.match(client, /Loading Video &amp; LR Copy/)
  assert.match(client, />View<\/a>/)
  assert.doesNotMatch(client, /media\.name|\.split\('\.'\)|View packing video|View loading video|View Builty/)
  assert.match(awaitCss, /\.pdb-premium-grid>\.pdb-machines-card\{grid-column:1\/-1;grid-row:2\}/)
})

test('detail popup hides scrollbar chrome while preserving scrolling and bottom breathing room', () => {
  assert.match(awaitCss, /\.pdb-overlay \.pdb-detail-body\{\s*scrollbar-width:none;\s*-ms-overflow-style:none;/)
  assert.match(awaitCss, /\.pdb-overlay \.pdb-detail-body::\-webkit-scrollbar\{\s*width:0;\s*height:0;/)
  assert.match(awaitCss, /\.pdb-detail-body:has\(\.pdb-premium-grid\)\{padding-bottom:28px\}/)
  assert.match(awaitCss, /padding-bottom:calc\(18px \+ env\(safe-area-inset-bottom\)\)/)
  assert.match(awaitCss, /\.pdb-detail-body\{[^}]*overflow-y:auto/)
})

test('shipment parity and hover prefetch are retained', () => {
  for (const field of ['Shipment Type','Transporter Name','Transporter / Contact Number','Vehicle Number','Driver Name','Driver Mobile','Expected Delivery','Shipped At','Notes']) assert.match(client, new RegExp(field))
  assert.match(snapshot, /driverName:shipment\.driverName/)
  assert.match(snapshot, /shippedAt:shipment\.shippedAt/)
  assert.match(client, /onMouseEnter=\{\(\) => prefetch\(row\)\}/)
  assert.match(client, /detailCache/)
})
