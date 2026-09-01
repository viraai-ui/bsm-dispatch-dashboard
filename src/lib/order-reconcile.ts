import type { MachineUnit, Order, OrderLineItem } from '@/types/domain'

export type OrderSyncDiff = { added: string[]; removed: string[]; updated: string[]; quantityDeltas: Record<string, number>; retiredUnits: number }
const norm = (value: unknown) => String(value ?? '').trim().toLowerCase()
export function legacyLineKey(line: OrderLineItem) { return [norm(line.zohoItemId), norm(line.sku), norm(line.itemName), Number(line.rate ?? 0).toFixed(4)].join('|') }
const ordinal = (machine: MachineUnit) => Number(machine.id.match(/-(\d+)$/)?.[1] || machine.unitNumber || 0)
const operational = (m: MachineUnit, workflowIds: Set<string>) => Boolean(m.serialNumber || m.qrToken || m.mediaPhotos || m.mediaVideos || m.qrPasted || m.qcDone || m.vehicleNumber || m.dispatchNote || workflowIds.has(m.id) || !['Not Generated', 'Review Required'].includes(m.status))

/** Pure reconciliation. Zoho source fields win; local unit/workflow fields survive. */
export function reconcileOrder(local: Order, remote: Order, workflowIds = new Set<string>(), now = new Date().toISOString()) {
  if (!remote.id || remote.zohoSalesOrderId !== local.zohoSalesOrderId) throw new Error('Zoho returned a different sales order')
  const unused = new Set(local.lineItems.map((_, i) => i)); const matches = new Map<number, OrderLineItem>()
  remote.lineItems.forEach((wanted, ri) => {
    let candidates = [...unused].filter((i) => local.lineItems[i].id === wanted.id && !wanted.id.startsWith('line-'))
    if (!candidates.length) { const key = legacyLineKey(wanted); candidates = [...unused].filter((i) => legacyLineKey(local.lineItems[i]) === key) }
    if (candidates.length === 1) { matches.set(ri, local.lineItems[candidates[0]]); unused.delete(candidates[0]) }
  })
  const diff: OrderSyncDiff = { added: [], removed: [], updated: [], quantityDeltas: {}, retiredUnits: 0 }
  const machines: MachineUnit[] = []; const retired = [...(local.retiredMachines || [])]
  remote.lineItems.forEach((line, ri) => {
    const old = matches.get(ri)
    if (!old) diff.added.push(line.id); else if (JSON.stringify(old) !== JSON.stringify(line)) diff.updated.push(line.id)
    const delta = line.pendingQuantity - (old?.pendingQuantity || 0); if (delta) diff.quantityDeltas[line.id] = delta
    const existing = old ? local.machines.filter((m) => m.lineItemId === old.id).sort((a, b) => ordinal(a) - ordinal(b)) : []
    const target = Math.max(0, line.pendingQuantity)
    // Remove highest unprocessed ordinals first. Processed excess is retired history.
    const active = [...existing]
    while (active.length > target) {
      const indexed = active.map((m, i) => ({ m, i }))
      const historicalExcess = indexed.filter(({ m }) => operational(m, workflowIds) && ordinal(m) > target).sort((a, b) => ordinal(b.m) - ordinal(a.m))
      const candidates = indexed.filter(({ m }) => !operational(m, workflowIds)).sort((a, b) => ordinal(b.m) - ordinal(a.m))
      const chosen = historicalExcess[0] || candidates[0] || indexed.sort((a, b) => ordinal(b.m) - ordinal(a.m))[0]
      const [removed] = active.splice(chosen.i, 1); if (operational(removed, workflowIds)) { retired.push({ ...removed, sourceRemovedAt: now }); diff.retiredUnits++ }
    }
    machines.push(...active.map((m) => ({ ...m, lineItemId: line.id, itemName: line.itemName, sku: line.sku, customerName: remote.customerName, salesOrderNumber: remote.salesOrderNumber, deliveryDate: remote.deliveryDate, itemDescription: line.description })))
    const used = new Set(existing.map(ordinal)); let toAdd = target - active.length
    while (toAdd-- > 0) { let n = 1; while (used.has(n)) n++; used.add(n); const t = remote.machines.find((m) => m.lineItemId === line.id); if (t) machines.push({ ...t, id: `${remote.id}-${line.id}-${n}`, serialNumber: '', qrToken: '', selectedForBatch: false, mediaPhotos: 0, mediaVideos: 0, qrPasted: false, qcDone: false }) }
  })
  for (const i of unused) { const line = local.lineItems[i]; diff.removed.push(line.id); diff.quantityDeltas[line.id] = -line.pendingQuantity; for (const m of local.machines.filter((u) => u.lineItemId === line.id)) if (operational(m, workflowIds)) { retired.push({ ...m, sourceRemovedAt: now }); diff.retiredUnits++ } }
  machines.forEach((m, i) => { m.unitNumber = i + 1 })
  const changed = Boolean(diff.added.length || diff.removed.length || diff.updated.length || diff.retiredUnits)
  return { order: { ...local, ...remote, machines, retiredMachines: retired }, diff, changed }
}
