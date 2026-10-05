import type { Store, OrderWorkflow } from './workflow-store'
import { cleanVendor, exactSheetHeaders, normalizeHeader, type SheetRow } from './serial-sheet-vendors'

// Exact serial identity only. Even equal duplicate rows are ambiguous.
export function sheetSuppliers(rows: SheetRow[], store: Store) {
  const headers = exactSheetHeaders(rows)
  const serialCol = headers.get(normalizeHeader('Serial No.'))?.column
  const makeCol = headers.get(normalizeHeader('Make'))?.column
  if (!serialCol || !makeCol) throw new Error('Missing serial/supplier headers')
  const physical = new Map<string, string[]>()
  for (const row of rows.filter(r => Number(r.row_index) > 1)) {
    const value = (col: number) => cleanVendor(row.row_details?.find(c => Number(c.column_index) === col)?.content)
    const serial = value(serialCol)
    if (serial) physical.set(serial, [...(physical.get(serial) || []), value(makeCol)])
  }
  const counts = new Map<string, number>()
  for (const order of Object.values(store.orders)) for (const m of Object.values(order.machines || {})) {
    if (m.serialNumber) counts.set(m.serialNumber, (counts.get(m.serialNumber) || 0) + 1)
  }
  return [...physical].filter(([serial, values]) => values.length === 1 && values[0] && (counts.get(serial) || 0) <= 1).map(([serial, values]) => ({ serial, vendor: values[0] }))
}

// Also applied to every workflow CAS retry: stale process/generate requests cannot
// roll back a Sheet-owned supplier while updating unrelated workflow state.
export function preserveSheetSuppliers(next: OrderWorkflow, current: OrderWorkflow | null): OrderWorkflow {
  for (const [id, m] of Object.entries(next.machines || {})) {
    const old = current?.machines[id]
    if (old?.sheetVendor && old.serialNumber === m.serialNumber) next.machines[id] = { ...m, vendor: old.sheetVendor, sheetVendor: old.sheetVendor }
  }
  if (next.processedOrder) next.processedOrder = { ...next.processedOrder, machines: next.processedOrder.machines.map(m => {
    const saved = next.machines[m.id]
    return saved?.sheetVendor && saved.serialNumber === m.serialNumber ? { ...m, vendor: saved.sheetVendor } : m
  }) }
  return next
}

export function applySheetSuppliers(store: Store, suppliers: { serial: string; vendor: string }[]) {
  const bySerial = new Map(suppliers.map(s => [s.serial, s.vendor]))
  const counts = new Map<string, number>()
  for (const order of Object.values(store.orders)) for (const m of Object.values(order.machines || {})) if (m.serialNumber) counts.set(m.serialNumber, (counts.get(m.serialNumber) || 0) + 1)
  let changed = 0
  for (const order of Object.values(store.orders)) {
    for (const m of Object.values(order.machines || {})) {
      const vendor = m.serialNumber && counts.get(m.serialNumber) === 1 ? bySerial.get(m.serialNumber) : undefined
      if (!vendor || m.reallocatedToMachineId || m.qrStatus === 'transferred') continue
      if (m.vendor !== vendor || m.sheetVendor !== vendor) { m.vendor = vendor; m.sheetVendor = vendor; changed++ }
    }
    if (order.processedOrder) order.processedOrder.machines = order.processedOrder.machines.map(m => {
      const saved = order.machines[m.id]
      if (!saved?.sheetVendor || saved.serialNumber !== m.serialNumber || m.vendor === saved.sheetVendor) return m
      changed++; return { ...m, vendor: saved.sheetVendor }
    })
  }
  return changed
}
