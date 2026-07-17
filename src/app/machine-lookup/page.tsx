import { DashboardShell } from '@/components/DashboardShell'
import { Badge } from '@/components/DashboardShell'
import { listSyncedOrders } from '@/lib/synced-orders'
import { hasPageAccess } from '@/lib/page-auth'

export const dynamic = 'force-dynamic'

export default async function MachineLookupPage() {
  const authed = await hasPageAccess(['Admin', 'Operations'])
  const orders = authed ? await listSyncedOrders() : []
  const machines = orders.flatMap((order) => order.machines.map((machine) => ({ order, machine }))).filter(({ machine }) => machine.serialNumber || machine.qrToken)
  return <DashboardShell active="Database">
    <header className="top compact-top"><div><h1 className="h1">Machine Lookup</h1><p className="muted">Find printed QR labels and machine passports</p></div><Badge tone="blue">{machines.length} machines</Badge></header>
    <section className="card search-panel"><input placeholder="Search by serial, QR token, sales order, customer, or machine" readOnly /><Badge tone="gray">Use browser find for now</Badge></section>
    <section className="card"><div className="desktop-table table-wrap"><table className="table"><thead><tr><th>Serial</th><th>Sales Order</th><th>Customer</th><th>Machine</th><th>Action</th></tr></thead><tbody>{machines.map(({ order, machine }) => <tr key={machine.id}><td><strong>{machine.serialNumber || 'Pending'}</strong></td><td>{order.salesOrderNumber}</td><td>{order.customerName}</td><td>{machine.itemName}</td><td>{machine.serialNumber || machine.qrToken ? <a className="btn light" href={`/m/${machine.qrToken || machine.serialNumber}`}>Open</a> : '—'}</td></tr>)}</tbody></table></div><div className="mobile-cards">{machines.map(({ order, machine }) => <article className="card mobile-order-card" key={machine.id}><strong>{machine.serialNumber || 'Pending'}</strong><p className="muted">{machine.itemName}</p><div className="meta-grid"><div><span>SO</span><strong>{order.salesOrderNumber}</strong></div><div><span>Customer</span><strong>{order.customerName}</strong></div></div>{(machine.serialNumber || machine.qrToken) && <a className="btn light full" href={`/m/${machine.qrToken || machine.serialNumber}`}>Open Passport</a>}</article>)}</div></section>
  </DashboardShell>
}
