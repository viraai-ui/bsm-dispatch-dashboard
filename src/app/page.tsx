import { Badge, DashboardShell } from '@/components/DashboardShell'
export const dynamic = 'force-dynamic'
import { githubReadJson, listProcessedOrders } from '@/lib/workflow-store'
import { listSyncedOrders, readSyncedOrdersStore } from '@/lib/synced-orders'
import { readMediaProofStore } from '@/lib/media-proof'
import type { Order } from '@/types/domain'

type CompletedStore = { completed: Record<string, { completedAt: string; order: Order }> }
const COMPLETED_PATH = 'data/packaging-completed-store.json'

export default async function Home() {
  const store = await readSyncedOrdersStore()
  const orders = await listSyncedOrders()
  const processed = await listProcessedOrders()
  const { data: completed } = await githubReadJson<CompletedStore>(COMPLETED_PATH, { completed: {} })
  const media = await readMediaProofStore()
  const processedIds = new Set(processed.map((item) => item.salesOrderId))
  const completedIds = new Set(Object.keys(completed.completed || {}))
  const mediaIds = new Set(Object.keys(media.records || {}))
  const qrGenerated = processed.filter((item) => item.status === 'qr_generated' || item.status === 'processed').length
  const partiallyGenerated = processed.filter((item) => item.status === 'partially_generated').length
  const pendingWooden = orders.reduce((sum, order) => sum + order.lineItems.filter((item) => item.woodenPackingRequired && item.quantity > 0).length, 0)
  const activePackaging = processed.filter((item) => item.status === 'processed' && !completedIds.has(item.salesOrderId)).length
  const mediaPending = Object.values(media.records || {}).filter((record) => !record.submittedAt).length
  const recent = processed.filter((item) => item.processedAt).sort((a, b) => Date.parse(b.processedAt || '') - Date.parse(a.processedAt || '')).slice(0, 5)

  return <DashboardShell active="Dashboard">
    <header className="top compact-top"><div><h1 className="h1">Dashboard</h1>{store.lastSuccessfulSyncAt && <p className="muted">Last successful sync: {new Date(store.lastSuccessfulSyncAt).toLocaleString()}</p>}</div><Badge tone="green">Live</Badge></header>
    <section className="grid stats"><Stat label="Confirmed SO" value={orders.length} /><Stat label="Open Orders" value={orders.filter((o) => !processedIds.has(o.id)).length} /><Stat label="QR Generated" value={qrGenerated} /><Stat label="Processed" value={processedIds.size} /></section>
    <section className="grid three" style={{ marginTop: 16 }}>
      <Metric title="Partially Generated" value={partiallyGenerated} />
      <Metric title="Wooden Packing Pending" value={pendingWooden} />
      <Metric title="Active Packaging TV" value={activePackaging} />
      <Metric title="Pending Media Proof" value={mediaPending} />
      <Metric title="Packaging Completed" value={completedIds.size} />
      <Metric title="Media Records" value={mediaIds.size} />
    </section>
    <section className="card" style={{ marginTop: 16 }}><h2>Recently Processed Orders</h2><div className="machine">{recent.length ? recent.map((item) => <div className="machine-row compact" key={item.salesOrderId}><span>{item.salesOrderNumber}</span><strong>{item.processedAt ? new Date(item.processedAt).toLocaleString() : '—'}</strong></div>) : <div className="machine-row compact"><span>No processed orders yet</span><strong>—</strong></div>}</div></section>
  </DashboardShell>
}
function Stat({ label, value }: { label: string; value: number }) { return <div className="card stat shine-card"><span className="muted">{label}</span><b>{value}</b></div> }
function Metric({ title, value }: { title: string; value: number }) { return <div className="card module-card"><h2>{title}</h2><div className="big-number">{value}</div></div> }
