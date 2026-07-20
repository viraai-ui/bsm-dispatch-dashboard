'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge } from '@/components/DashboardShell'
import { dispatchCategoryLabel, isMachineLineItem } from '@/lib/item-classification'
import type { MachineUnit, Order, OrderLineItem } from '@/types/domain'

const PACKING_STATE_KEY = 'bsm.packing.state.v1'

type PackingState = Record<string, { urgent?: boolean }>
type MachineGroup = { itemName: string; description?: string; sku?: string; serials: string[]; notes: string[]; quantity: number; woodenPackingRequired: boolean; category?: string }
type DispatchOrder = Order & { dispatchPriority?: 'urgent' | 'regular' }

export function PackagingTvClient() {
  const [orders, setOrders] = useState<DispatchOrder[]>([])
  const [state, setState] = useState<PackingState>({})
  const [syncing, setSyncing] = useState(false)
  const syncingRef = useRef(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    setState(readState())
    void syncLocal(true)
    const timer = window.setInterval(() => { void syncLocal(true) }, 15 * 60 * 1000)
    return () => window.clearInterval(timer)
  }, [])

  const sorted = useMemo(() => [...orders].sort((a, b) => dateValue(a.deliveryDate) - dateValue(b.deliveryDate)), [orders])
  const urgent = sorted.filter((order) => isUrgent(order, state))
  const regular = sorted.filter((order) => !isUrgent(order, state))

  async function syncLocal(silent = false) {
    if (syncingRef.current) return
    syncingRef.current = true
    setSyncing(true); setError(''); if (!silent) setNotice('')
    try {
      const response = await fetch('/api/packaging-tv', { cache: 'no-store' })
      const json = await response.json()
      if (!response.ok || !json.ok) throw new Error(json.error || 'Could not sync Packaging TV')
      setOrders(json.data?.orders || [])
      if (!silent) setNotice('Sync completed successfully.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sync Packaging TV')
    } finally { syncingRef.current = false; setSyncing(false) }
  }

  async function completeOrder(order: Order) {
    if (!window.confirm(`Mark ${order.salesOrderNumber} as Packaging Completed?`)) return
    const response = await fetch('/api/packaging-tv', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ order, machineIds: order.machines.map((machine) => machine.id) }) })
    const json = await response.json()
    if (!response.ok || !json.ok) { setError(json.error || 'Could not complete packaging'); return }
    setOrders((prev) => prev.filter((item) => item.id !== order.id))
  }

  return <main className="packaging-tv-light">
    <header className="top compact-top packaging-tv-head"><div><h1 className="h1">Dispatch View</h1></div><div className="tabs packaging-sync-actions"><Badge tone="green">{orders.length} Active {orders.length === 1 ? 'Order' : 'Orders'}</Badge><button className="btn red" onClick={() => syncLocal()} disabled={syncing}>{syncing ? 'SYNCING…' : 'SYNC'}</button></div></header>
    {notice && <div className="form-success">{notice}</div>}
    {error && <div className="form-error">{error}</div>}
    <div className="packaging-dispatch-grid">
      <DispatchSection title="Urgent Dispatch" tone="urgent" orders={urgent} state={state} completeOrder={completeOrder} />
      <DispatchSection title="Regular Dispatch" tone="regular" orders={regular} state={state} completeOrder={completeOrder} />
    </div>
  </main>
}

function DispatchSection({ title, tone, orders, state, completeOrder }: { title: string; tone: 'urgent' | 'regular'; orders: DispatchOrder[]; state: PackingState; completeOrder: (order: DispatchOrder) => void }) {
  return <section className={`packaging-section ${tone}`}><div className="packaging-section-head"><h2>{title}</h2><span>{orders.length}</span></div><div className="packaging-order-list">{orders.length ? orders.map((order) => <OrderCard key={order.id} order={order} urgent={isUrgent(order, state)} completeOrder={completeOrder} />) : <div className="card packaging-empty">No active orders</div>}</div></section>
}

function OrderCard({ order, urgent, completeOrder }: { order: DispatchOrder; urgent: boolean; completeOrder: (order: DispatchOrder) => void }) {
  const groups = [...groupMachines(order.machines), ...groupDispatchLineItems(order.lineItems)]
  return <article className="card packaging-order-card"><div className="packaging-order-title"><div><h3>{order.salesOrderNumber}</h3><p>Expected Delivery: {formatDate(order.deliveryDate)}</p></div>{urgent && <Badge tone="amber">Urgent</Badge>}</div><div className="packaging-machine-table"><div className="packaging-row packaging-header"><span>Machine</span><span>SKU</span><span>Qty</span><span>Wooden Packing</span><span>Notes</span></div>{groups.map((group) => <div className="packaging-row" key={`${group.category || 'machine'}-${group.itemName}-${group.sku || ''}-${group.serials.join('-')}`}><ItemName name={group.itemName} description={group.description} serials={group.serials} /><span className="dispatch-sku">{group.sku || '—'}</span><b>{formatQty(group.quantity, group.category)}</b><b className={group.woodenPackingRequired ? 'wooden-yes' : 'wooden-no'}>{group.woodenPackingRequired ? 'Yes' : 'No'}</b><span className="dispatch-notes">{group.notes.length ? group.notes.join(' • ') : '—'}</span></div>)}</div><button className="btn green full packaging-complete" onClick={() => completeOrder(order)}>Complete</button></article>
}

function groupMachines(machines: MachineUnit[]) {
  const map = new Map<string, MachineGroup>()
  for (const machine of machines) {
    const key = `${machine.itemName}::${machine.itemDescription || ''}`
    const current = map.get(key) || { itemName: machine.itemName, description: machine.itemDescription, sku: machine.sku, serials: [], notes: [], quantity: 0, woodenPackingRequired: false, category: 'Machine' }
    current.serials.push(machine.serialNumber || '')
    if (machine.dispatchNote?.trim()) current.notes.push(machine.dispatchNote.trim())
    current.quantity += 1
    current.woodenPackingRequired ||= machine.woodenPacking !== 'Not Required'
    map.set(key, current)
  }
  return [...map.values()]
}

function groupDispatchLineItems(lineItems: OrderLineItem[]) {
  return lineItems.filter((item) => !isMachineLineItem(item) && item.dispatchCategory !== 'freight').map((item) => ({
    itemName: item.itemName,
    description: item.description,
    sku: item.sku,
    serials: [],
    notes: [],
    quantity: item.quantity,
    woodenPackingRequired: false,
    category: dispatchCategoryLabel(item.dispatchCategory),
  }))
}
function formatQty(quantity: number, category?: string) { return category === 'Adhesive' ? `${quantity} kgs` : quantity }
function ItemName({ name, description, serials = [] }: { name: string; description?: string; serials?: string[] }) { const cleanDescription = displayDescription(name, description); return <div className="item-name-stack dispatch-item-name"><strong>{name}</strong>{serials.length > 0 && <span className="inline-serials">Serial: {serials.filter(Boolean).join(', ') || 'QR Not Required'}</span>}{cleanDescription && <small className="item-description">{cleanDescription}</small>}</div> }
function displayDescription(name: string, description?: string) {
  const clean = String(description || '').replace(/\s+/g, ' ').trim()
  if (!clean) return ''
  if (clean.toLowerCase() === String(name || '').replace(/\s+/g, ' ').trim().toLowerCase()) return ''
  return clean
}
function isUrgent(order: DispatchOrder, state: PackingState) { return order.dispatchPriority === 'urgent' || order.machines.some((machine) => state[machine.id]?.urgent) }
function readState(): PackingState { try { return JSON.parse(localStorage.getItem(PACKING_STATE_KEY) || '{}') as PackingState } catch { return {} } }
function dateValue(value: string) { const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : 9999999999999 }
function formatDate(value: string) { const d = new Date(value); if (Number.isNaN(d.getTime())) return value; return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getFullYear()).slice(-2)}` }
