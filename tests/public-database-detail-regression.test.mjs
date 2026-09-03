import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const client = await readFile('src/components/PublicDatabaseClient.tsx', 'utf8')
const snapshot = await readFile('src/lib/public-database-snapshot.ts', 'utf8')
const route = await readFile('src/app/api/public/database/orders/[id]/route.ts', 'utf8')
const warranty = await readFile('src/lib/warranty.ts', 'utf8')
const awaitCss = await readFile('src/app/globals.css', 'utf8')
const durableSnapshot = JSON.parse(await readFile('data/public-database-snapshot.json', 'utf8'))
const workflowStore = JSON.parse(await readFile('data/workflow-store.json', 'utf8'))

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

test('canonical item vendor survives workflow to public detail and renders beside serial', () => {
  assert.match(snapshot, /vendor:m\.vendor\|\|''/)
  assert.match(snapshot, /machines:Array<\{id:string;itemName:string;serialNumber:string;vendor:string\}>/)
  assert.match(client, /pdb-machine-serial[\s\S]*Serial number[\s\S]*machine\.serialNumber \|\| '—'[\s\S]*pdb-machine-vendor[\s\S]*Vendor[\s\S]*machine\.vendor \|\| '—'/)
  assert.match(route, /\.\.\.detail,media/)

  const workflow = Object.values(workflowStore.orders).find(value => value.processedOrder?.salesOrderNumber === 'SO-07808')
  const canonicalMachine = workflow?.processedOrder?.machines?.find(machine => machine.serialNumber === '26271078')
  const publicOrder = Object.values(durableSnapshot.details).find(detail => detail.salesOrderNumber === 'SO-07808')
  const publicMachine = publicOrder?.machines?.find(machine => machine.serialNumber === '26271078')
  assert.equal(canonicalMachine?.vendor, 'K S')
  assert.equal(publicMachine?.vendor, canonicalMachine.vendor)
})

test('vendor layout remains one compact desktop row and stacks without mobile overflow', () => {
  assert.match(awaitCss, /\.pdb-machine-compact\{display:grid;grid-template-columns:minmax\(0,1\.5fr\) minmax\(260px,1fr\) auto/)
  assert.match(awaitCss, /\.pdb-machine-meta\{display:grid;grid-template-columns:minmax\(110px,1fr\) minmax\(110px,1fr\)/)
  assert.match(awaitCss, /@media\(max-width:700px\)[^{]*\{[\s\S]*\.pdb-machine-name\{grid-column:1\/-1;white-space:normal\}[\s\S]*\.pdb-machine-meta\{grid-column:1;grid-row:2;grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)/)
})

test('packing and loading use one accessible inline player while Builty remains a link', () => {
  assert.match(client, /\(media\.kind === 'loading' \|\| media\.kind === 'packing'\) && onViewVideo/)
  assert.match(client, /packing\.map\(media => <AttachmentAction key=\{media\.id\} media=\{media\} onViewVideo=\{onViewVideo\}/)
  assert.match(client, /<CompactMediaRow label="Loading Video" media=\{loading\} onViewVideo=\{onViewVideo\}/)
  assert.equal((client.match(/function MediaPlayer\(/g) || []).length, 1)
  assert.match(client, /<video[^>]*src=\{media\.url\}[^>]*controls[^>]*autoPlay[^>]*playsInline[^>]*preload="metadata"/)
  assert.match(client, /media\.kind === 'packing' \? 'Packing Video' : 'Loading Video'/)
  assert.match(client, /role="dialog" aria-modal="true" aria-labelledby="media-video-title"/)
  assert.match(client, /aria-label=\{`Close \$\{title\.toLowerCase\(\)\}`\}/)
  assert.match(client, /video\.pause\(\); video\.removeAttribute\('src'\); video\.load\(\)/)
  assert.match(client, /videoTriggerRef\.current\?\.focus\(\)/)
  assert.match(client, /return <a className="btn light pdb-view-action" href=\{media\.url\}/)
  assert.doesNotMatch(client, /if \(media\.kind === 'packing'.*return <a/)
  assert.doesNotMatch(client, /fetch\(videoMedia\.url|arrayBuffer\(|createObjectURL\(/)
  assert.match(awaitCss, /\.pdb-video-backdrop\{position:fixed;inset:0;z-index:1100/)
})
