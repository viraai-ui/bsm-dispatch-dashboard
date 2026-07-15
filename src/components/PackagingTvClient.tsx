'use client'

import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/DashboardShell'
import type { MachineUnit, Order } from '@/types/domain'

const PROCESSED_ORDERS_KEY = 'bsm.processed.orders.v1'
const PACKING_STATE_KEY = 'bsm.packing.state.v1'
const MEDIA_QUEUE_KEY = 'bsm.media.queue.v1'

type PackingState = Record<string, { packingComplete?: boolean; qrPasted?: boolean; qcDone?: boolean; issue?: boolean; urgent?: boolean }>

export function PackagingTvClient() {
  const [orders, setOrders] = useState<Order[]>([])
  const [state, setState] = useState<PackingState>({})
  const [syncing, setSyncing] = useState(false)

  useEffect(() => { setOrders(readProcessed()); setState(readState()); void syncLocal() }, [])

  const sorted = useMemo(() => [...orders].sort((a, b) => dateValue(a.deliveryDate) - dateValue(b.deliveryDate)), [orders])
  const urgent = sorted.filter((order) => order.machines.some((machine) => state[machine.id]?.urgent))
  const regular = sorted.filter((order) => !urgent.some((item) => item.id === order.id))

  function syncLocal() { setSyncing(true); setOrders(readProcessed()); setState(readState()); setTimeout(() => setSyncing(false), 150) }
  function update(machineId: string, key: keyof PackingState[string]) { const next = { ...state, [machineId]: { ...(state[machineId] || {}), [key]: !state[machineId]?.[key] } }; setState(next); localStorage.setItem(PACKING_STATE_KEY, JSON.stringify(next)) }
  function orderReady(order: Order) { return order.machines.every((m) => state[m.id]?.packingComplete && state[m.id]?.qrPasted && state[m.id]?.qcDone && !state[m.id]?.issue) }
  function completeOrder(order: Order) { const queue = readMediaQueue().filter((item) => item.id !== order.id); queue.unshift({ ...order, dashboardStatus: 'Packing Done' }); localStorage.setItem(MEDIA_QUEUE_KEY, JSON.stringify(queue)); setOrders((prev) => { const next = prev.filter((item) => item.id !== order.id); localStorage.setItem(PROCESSED_ORDERS_KEY, JSON.stringify(next)); return next }) }

  return <main className="tv"><header className="top"><div><h1 className="h1">Packaging TV</h1></div><div className="tabs"><button className="btn red" onClick={syncLocal} disabled={syncing}>{syncing ? 'Syncing…' : 'Sync Zoho'}</button><Badge tone="green">{orders.length} orders</Badge></div></header><section className="tv-split"><DispatchColumn title="Urgent Dispatch" orders={urgent} state={state} update={update} orderReady={orderReady} completeOrder={completeOrder} /><DispatchColumn title="Regular Dispatch" orders={regular} state={state} update={update} orderReady={orderReady} completeOrder={completeOrder} /></section></main>
}

function DispatchColumn({ title, orders, state, update, orderReady, completeOrder }: { title: string; orders: Order[]; state: PackingState; update: (machineId: string, key: keyof PackingState[string]) => void; orderReady: (order: Order) => boolean; completeOrder: (order: Order) => void }) {
  return <section className="card"><h2>{title}</h2><div className="machine">{orders.map((order) => <article className="card" key={order.id}><div className="modal-section-title"><div><h2>{order.salesOrderNumber}</h2><p className="muted">{order.customerName} · {order.deliveryDate}</p></div><Badge tone={orderReady(order) ? 'green' : 'amber'}>{orderReady(order) ? 'Ready' : 'Packing'}</Badge></div><div className="desktop-table table-wrap"><table className="table"><thead><tr><th>Machine</th><th>Serial</th><th>Packing</th><th>QR</th><th>QC</th><th>Issue</th><th>Urgent</th></tr></thead><tbody>{order.machines.map((machine) => <tr key={machine.id}><td>{machine.itemName}</td><td>{machine.serialNumber}</td><td><Toggle on={state[machine.id]?.packingComplete} label="Packing Complete" onClick={() => update(machine.id, 'packingComplete')} /></td><td><Toggle on={state[machine.id]?.qrPasted} label="QR Pasted" onClick={() => update(machine.id, 'qrPasted')} /></td><td><Toggle on={state[machine.id]?.qcDone} label="QC Done" onClick={() => update(machine.id, 'qcDone')} /></td><td><Toggle on={state[machine.id]?.issue} label="Issue" onClick={() => update(machine.id, 'issue')} /></td><td><Toggle on={state[machine.id]?.urgent} label="Urgent" onClick={() => update(machine.id, 'urgent')} /></td></tr>)}</tbody></table></div><button className="btn red full" disabled={!orderReady(order)} onClick={() => completeOrder(order)}>Mark Sales Order Packing Completed</button></article>)}</div></section>
}

function Toggle({ on, label, onClick }: { on?: boolean; label: string; onClick: () => void }) { return <button className={on ? 'btn' : 'btn light'} onClick={onClick}>{label}</button> }
function readProcessed(): Order[] { try { return JSON.parse(localStorage.getItem(PROCESSED_ORDERS_KEY) || '[]') as Order[] } catch { return [] } }
function readState(): PackingState { try { return JSON.parse(localStorage.getItem(PACKING_STATE_KEY) || '{}') as PackingState } catch { return {} } }
function readMediaQueue(): Order[] { try { return JSON.parse(localStorage.getItem(MEDIA_QUEUE_KEY) || '[]') as Order[] } catch { return [] } }
function dateValue(value: string) { const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : 9999999999999 }
