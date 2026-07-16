'use client'

import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/DashboardShell'
import type { MachineUnit, Order } from '@/types/domain'

const PACKING_STATE_KEY = 'bsm.packing.state.v1'

type PackingState = Record<string, { urgent?: boolean }>
type MachineGroup = { itemName: string; serials: string[]; quantity: number; woodenPackingRequired: boolean }

export function PackagingTvClient() {
  const [orders, setOrders] = useState<Order[]>([])
  const [state, setState] = useState<PackingState>({})
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => { setState(readState()); void syncLocal() }, [])

  const sorted = useMemo(() => [...orders].sort((a, b) => dateValue(a.deliveryDate) - dateValue(b.deliveryDate)), [orders])
  const urgent = sorted.filter((order) => isUrgent(order, state))
  const regular = sorted.filter((order) => !isUrgent(order, state))

  async function syncLocal() {
    if (syncing) return
    setSyncing(true); setError(''); setNotice('')
    try {
      const response = await fetch('/api/packaging-tv', { cache: 'no-store' })
      const json = await response.json()
      if (!response.ok || !json.ok) throw new Error(json.error || 'Could not sync Packaging TV')
      setOrders(json.data?.orders || [])
      setNotice('Sync completed successfully.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sync Packaging TV')
    } finally { setSyncing(false) }
  }

  async function completeOrder(order: Order) {
    if (!window.confirm(`Mark ${order.salesOrderNumber} as Packaging Completed?`)) return
    const response = await fetch('/api/packaging-tv', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ order }) })
    const json = await response.json()
    if (!response.ok || !json.ok) { setError(json.error || 'Could not complete packaging'); return }
    setOrders((prev) => prev.filter((item) => item.id !== order.id))
  }

  return <main className="packaging-tv-light">
    <header className="top compact-top packaging-tv-head"><div><h1 className="h1">Dispatch View</h1></div><div className="tabs packaging-sync-actions"><Badge tone="green">{orders.length} Active {orders.length === 1 ? 'Order' : 'Orders'}</Badge><button className="btn red" onClick={syncLocal} disabled={syncing}>{syncing ? 'SYNCING…' : 'SYNC'}</button></div></header>
    {notice && <div className="form-success">{notice}</div>}
    {error && <div className="form-error">{error}</div>}
    <div className="packaging-dispatch-grid">
      <DispatchSection title="Urgent Dispatch" tone="urgent" orders={urgent} state={state} completeOrder={completeOrder} />
      <DispatchSection title="Regular Dispatch" tone="regular" orders={regular} state={state} completeOrder={completeOrder} />
    </div>
  </main>
}

function DispatchSection({ title, tone, orders, state, completeOrder }: { title: string; tone: 'urgent' | 'regular'; orders: Order[]; state: PackingState; completeOrder: (order: Order) => void }) {
  return <section className={`packaging-section ${tone}`}><div className="packaging-section-head"><h2>{title}</h2><span>{orders.length}</span></div><div className="packaging-order-list">{orders.length ? orders.map((order) => <OrderCard key={order.id} order={order} urgent={isUrgent(order, state)} completeOrder={completeOrder} />) : <div className="card packaging-empty">No active orders</div>}</div></section>
}

function OrderCard({ order, urgent, completeOrder }: { order: Order; urgent: boolean; completeOrder: (order: Order) => void }) {
  const groups = groupMachines(order.machines)
  return <article className="card packaging-order-card"><div className="packaging-order-title"><div><h3>{order.salesOrderNumber}</h3><p>Expected Delivery: {formatDate(order.deliveryDate)}</p></div>{urgent && <Badge tone="amber">Urgent</Badge>}</div><div className="packaging-machine-table"><div className="packaging-row packaging-header"><span>Machine Name</span><span>Serial Number</span><span>Quantity</span><span>Wooden Packing</span></div>{groups.map((group) => <div className="packaging-row" key={group.itemName}><strong>{group.itemName}</strong><div className="serial-list">{group.serials.map((serial) => <span key={serial}>{serial || 'QR Not Required'}</span>)}</div><b>{group.quantity}</b><b className={group.woodenPackingRequired ? 'wooden-yes' : 'wooden-no'}>{group.woodenPackingRequired ? 'Yes' : 'No'}</b></div>)}</div><button className="btn green full packaging-complete" onClick={() => completeOrder(order)}>Complete</button></article>
}

function groupMachines(machines: MachineUnit[]) {
  const map = new Map<string, MachineGroup>()
  for (const machine of machines) {
    const current = map.get(machine.itemName) || { itemName: machine.itemName, serials: [], quantity: 0, woodenPackingRequired: false }
    current.serials.push(machine.serialNumber || '')
    current.quantity += 1
    current.woodenPackingRequired ||= machine.woodenPacking !== 'Not Required'
    map.set(machine.itemName, current)
  }
  return [...map.values()]
}
function isUrgent(order: Order, state: PackingState) { return order.machines.some((machine) => state[machine.id]?.urgent) }
function readState(): PackingState { try { return JSON.parse(localStorage.getItem(PACKING_STATE_KEY) || '{}') as PackingState } catch { return {} } }
function dateValue(value: string) { const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : 9999999999999 }
function formatDate(value: string) { const d = new Date(value); if (Number.isNaN(d.getTime())) return value; return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getFullYear()).slice(-2)}` }
