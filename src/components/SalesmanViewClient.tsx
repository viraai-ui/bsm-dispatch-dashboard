'use client'

import { useMemo, useState } from 'react'
import type { SalesmanDispatchOrder, SalesmanShipmentOrder } from '@/lib/salesman-view'

type SalesmanData = {
  generatedAt: string
  totals: {
    dispatchOrders: number
    dispatchMachines: number
    urgentOrders: number
    urgentMachines: number
    regularOrders: number
    regularMachines: number
    shipmentOrders: number
    shipmentMachines: number
    totalWorkloadMachines: number
  }
  urgentOrders: SalesmanDispatchOrder[]
  regularOrders: SalesmanDispatchOrder[]
  shipmentOrders: SalesmanShipmentOrder[]
}

export function SalesmanViewClient({ initialData }: { initialData: SalesmanData | null }) {
  const [data, setData] = useState(initialData)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const urgentPct = data?.totals.totalWorkloadMachines ? Math.round((data.totals.urgentMachines / data.totals.totalWorkloadMachines) * 100) : 0
  const regularPct = data?.totals.totalWorkloadMachines ? Math.round((data.totals.regularMachines / data.totals.totalWorkloadMachines) * 100) : 0
  const shipmentPct = data?.totals.totalWorkloadMachines ? Math.max(0, 100 - urgentPct - regularPct) : 0
  const workloadText = useMemo(() => {
    if (!data) return 'No live workload loaded'
    return `${data.totals.dispatchMachines} machines in dispatch packing + ${data.totals.shipmentMachines} machines ready for shipment`
  }, [data])

  async function refresh() {
    setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/salesman-view', { cache: 'no-store' })
      const json = await response.json().catch(() => ({}))
      if (!response.ok || !json.ok) throw new Error(json.error || 'Could not refresh Salesman View')
      setData(json.data)
      setMessage('Updated')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not refresh') }
    finally { setBusy(false) }
  }

  if (!data) return <section className="salesman-view-page"><div className="empty-state"><strong>Admin access required</strong></div></section>

  return <section className="salesman-view-page">
    <header className="salesman-hero card">
      <div>
        <span className="salesman-kicker">Salesman View</span>
        <h1>Live Dispatch Workload</h1>
        <p>{workloadText}</p>
      </div>
      <button className={`btn red salesman-refresh ${busy ? 'spinning' : ''}`} type="button" disabled={busy} onClick={refresh}>{busy ? 'Refreshing…' : 'Refresh'}</button>
    </header>
    {message && <div className={message === 'Updated' ? 'form-success' : 'form-error'}>{message}</div>}

    <div className="salesman-metric-grid">
      <MetricCard tone="red" label="Urgent Dispatch" value={data.totals.urgentOrders} sub={`${data.totals.urgentMachines} pending machines`} />
      <MetricCard tone="blue" label="Regular Dispatch" value={data.totals.regularOrders} sub={`${data.totals.regularMachines} pending machines`} />
      <MetricCard tone="green" label="Ready to Ship" value={data.totals.shipmentOrders} sub={`${data.totals.shipmentMachines} shipment machines`} />
      <MetricCard tone="dark" label="Total Team Load" value={data.totals.totalWorkloadMachines} sub="machines across packing + shipment" />
    </div>

    <section className="card salesman-workload-card">
      <div className="salesman-section-head"><div><h2>Overall workload split</h2><span>Visual estimate for customer commitment timing</span></div></div>
      <div className="salesman-workload-bar" aria-label="Workload split"><i className="urgent" style={{ width: `${urgentPct}%` }} /><i className="regular" style={{ width: `${regularPct}%` }} /><i className="shipment" style={{ width: `${shipmentPct}%` }} /></div>
      <div className="salesman-legend"><span><i className="urgent" />Urgent {data.totals.urgentMachines}</span><span><i className="regular" />Regular {data.totals.regularMachines}</span><span><i className="shipment" />Shipment {data.totals.shipmentMachines}</span></div>
    </section>

    <div className="salesman-columns">
      <OrderPanel title="Urgent Dispatch Orders" tone="urgent" orders={data.urgentOrders} empty="No urgent dispatch workload" />
      <OrderPanel title="Regular Dispatch Orders" tone="regular" orders={data.regularOrders} empty="No regular dispatch workload" />
      <ShipmentPanel orders={data.shipmentOrders} />
    </div>
  </section>
}

function MetricCard({ label, value, sub, tone }: { label: string; value: number; sub: string; tone: 'red' | 'blue' | 'green' | 'dark' }) {
  return <article className={`salesman-metric-card ${tone}`}><span>{label}</span><strong>{value}</strong><em>{sub}</em></article>
}

function OrderPanel({ title, tone, orders, empty }: { title: string; tone: 'urgent' | 'regular'; orders: SalesmanDispatchOrder[]; empty: string }) {
  return <section className={`card salesman-order-panel ${tone}`}><div className="salesman-section-head"><h2>{title}</h2><strong>{orders.reduce((sum, order) => sum + order.machineCount, 0)} machines</strong></div><div className="salesman-order-list">{orders.map((order) => <article className="salesman-mini-order" key={order.id}><div><strong>{order.salesOrderNumber}</strong><span>{order.customerName}</span></div><em>{order.machineCount} machines</em>{order.machineNames.length > 0 && <p>{order.machineNames.join(' · ')}</p>}</article>)}{!orders.length && <div className="empty-state small"><strong>{empty}</strong></div>}</div></section>
}

function ShipmentPanel({ orders }: { orders: SalesmanShipmentOrder[] }) {
  return <section className="card salesman-order-panel shipment"><div className="salesman-section-head"><h2>Ready to Ship Orders</h2><strong>{orders.reduce((sum, order) => sum + order.machineCount, 0)} machines</strong></div><div className="salesman-order-list">{orders.map((order) => <article className="salesman-mini-order" key={order.id}><div><strong>{order.salesOrderNumber}</strong><span>{order.customerName}</span></div><em>{order.needsBuilty ? 'Builty needed' : `${order.machineCount} machines`}</em>{order.machineNames.length > 0 && <p>{order.machineNames.join(' · ')}</p>}</article>)}{!orders.length && <div className="empty-state small"><strong>No shipment workload pending</strong></div>}</div></section>
}
