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
  const [orders, setOrders] = useState<Order[]>(initialOrders)
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(initialOrders[0]?.id || null)

  async function markDispatched(order: Order) {
    const response = await fetch('/api/dispatch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orderId: order.id }) })
    const json = await response.json()
    if (response.ok && json.ok) setOrders((prev) => prev.filter((item) => item.id !== order.id))
  }

  return <>
    <section className="card vehicle-dispatch-card" style={{ marginBottom: 16 }}>
      <h2>Ready for Dispatch</h2>
      <div className="machine vehicle-order-list">
        {orders.length ? orders.map((order) => {
          const expanded = expandedOrderId === order.id
          return <div className={`vehicle-order-row ${expanded ? 'expanded' : ''}`} key={order.id}>
            <div className="machine-row compact vehicle-order-head">
              <span><strong>{order.salesOrderNumber}</strong> · {order.customerName}</span>
              <div className="vehicle-order-actions">
                <button className="btn light" type="button" onClick={() => setExpandedOrderId(expanded ? null : order.id)}>{expanded ? 'Hide Machines' : 'View Order'}</button>
                <button className="btn red" onClick={() => markDispatched(order)}>Mark Dispatched</button>
              </div>
            </div>
            {expanded && <div className="vehicle-machine-panel">
              <div className="vehicle-machine-head"><strong>Machines</strong><Badge tone="blue">{order.machines.length}</Badge></div>
              {order.machines.map((machine) => <div className="vehicle-machine-row" key={machine.id}>
                <span>{machine.itemName}</span>
                <small>{machine.serialNumber || 'No serial'} · Unit {machine.unitNumber}</small>
              </div>)}
            </div>}
          </div>
        }) : <div className="machine-row compact"><span>No orders ready</span><Badge tone="green">Clear</Badge></div>}
      </div>
    </section>
    <section className="vehicle-provider-grid" aria-label="Vehicle booking applications">
      {providers.map((provider) => <article className={`vehicle-provider-card ${provider.accent}`} key={provider.key}>
        <a className="vehicle-logo-link" href={provider.url} target="_blank" rel="noreferrer" aria-label={`Open ${provider.name}`}>
          <Image className="vehicle-logo-img" src={provider.logoSrc} width={220} height={220} alt={`${provider.name} logo`} priority />
        </a>
        <div className="vehicle-provider-copy">
          <h2>{provider.name}</h2>
        </div>
        <a className="btn red vehicle-open-btn" href={provider.url} target="_blank" rel="noreferrer">{provider.button}</a>
      </article>)}
    </section>
  </>
}
