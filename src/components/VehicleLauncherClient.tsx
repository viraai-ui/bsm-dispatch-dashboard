'use client'

import Image from 'next/image'
import { useState } from 'react'
import type { Order } from '@/types/domain'
import { Badge } from './DashboardShell'

const providers = [
  {
    key: 'rapido',
    name: 'Rapido',
    url: 'https://www.rapido.bike/Home',
    logoSrc: '/vehicle-logos/rapido.jpg',
    accent: 'rapido',
    button: 'Open Rapido',
  },
  {
    key: 'porter',
    name: 'Porter',
    url: 'https://porter.in/enterprise',
    logoSrc: '/vehicle-logos/porter.jpg',
    accent: 'porter',
    button: 'Open Porter',
  },
]

export function VehicleLauncherClient({ initialOrders = [] }: { initialOrders?: Order[] }) {
  const [active, setActive] = useState<(typeof providers)[number] | null>(null)
  const [orders, setOrders] = useState<Order[]>(initialOrders)

  async function markDispatched(order: Order) {
    const response = await fetch('/api/dispatch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orderId: order.id }) })
    const json = await response.json()
    if (response.ok && json.ok) setOrders((prev) => prev.filter((item) => item.id !== order.id))
  }

  return <>
    <section className="card" style={{ marginBottom: 16 }}><h2>Ready for Dispatch</h2><div className="machine">{orders.length ? orders.map((order) => <div className="machine-row compact" key={order.id}><span><strong>{order.salesOrderNumber}</strong> · {order.customerName}</span><button className="btn red" onClick={() => markDispatched(order)}>Mark Dispatched</button></div>) : <div className="machine-row compact"><span>No orders ready</span><Badge tone="green">Clear</Badge></div>}</div></section>
    <section className="vehicle-provider-grid" aria-label="Vehicle booking applications">
      {providers.map((provider) => <article className={`vehicle-provider-card ${provider.accent}`} key={provider.key}>
        <button className="vehicle-logo-link" type="button" onClick={() => setActive(provider)} aria-label={`Open ${provider.name} inside dashboard`}>
          <Image className="vehicle-logo-img" src={provider.logoSrc} width={220} height={220} alt={`${provider.name} logo`} priority />
        </button>
        <div className="vehicle-provider-copy">
          <h2>{provider.name}</h2>
        </div>
        <button className="btn red vehicle-open-btn" type="button" onClick={() => setActive(provider)}>{provider.button}</button>
      </article>)}
    </section>

    <section className="vehicle-frame-card" aria-label="Embedded vehicle booking app">
      <div className="vehicle-frame-head">
        <h2>{active ? active.name : 'Booking App'}</h2>
        <span>{active ? active.url : ''}</span>
      </div>
      {active ? <iframe key={active.url} src={active.url} title={`${active.name} booking app`} className="vehicle-booking-frame" /> : <div className="vehicle-frame-empty">Select Porter or Rapido</div>}
    </section>
  </>
}
