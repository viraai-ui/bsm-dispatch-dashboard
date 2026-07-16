import { Badge, DashboardShell } from '@/components/DashboardShell'
export const dynamic = 'force-dynamic'
import { githubReadJson, listProcessedOrders } from '@/lib/workflow-store'
import { listSyncedOrders, readSyncedOrdersStore } from '@/lib/synced-orders'
import { readMediaProofStore } from '@/lib/media-proof'
import { buildStageMap, readDispatchStore } from '@/lib/order-stage'
import type { Order } from '@/types/domain'

type CompletedStore = { completed: Record<string, { completedAt: string; order: Order }> }
const COMPLETED_PATH = 'data/packaging-completed-store.json'

export default async function Home() {
  const store = await readSyncedOrdersStore()
  const orders = await listSyncedOrders()
  const processed = await listProcessedOrders()
  const { data: completed } = await githubReadJson<CompletedStore>(COMPLETED_PATH, { completed: {} })
  const media = await readMediaProofStore()
  const dispatch = await readDispatchStore()
  const workflowMap = Object.fromEntries(processed.map((item) => [item.salesOrderId, item]))
  const stageMap = await buildStageMap(workflowMap)

  const processedIds = new Set(processed.map((item) => item.salesOrderId))
  const completedIds = new Set(Object.keys(completed.completed || {}))
  const mediaIds = new Set(Object.keys(media.records || {}))
  const dispatchedIds = new Set(Object.keys(dispatch.dispatched || {}))
  const confirmed = orders.length
  const openOrders = orders.filter((o) => !processedIds.has(o.id)).length
  const qrGenerated = processed.filter((item) => item.status === 'qr_generated' || item.status === 'processed').length
  const partiallyGenerated = processed.filter((item) => item.status === 'partially_generated').length
  const pendingWooden = orders.reduce((sum, order) => sum + order.lineItems.filter((item) => item.woodenPackingRequired && item.quantity > 0).reduce((lineSum, item) => lineSum + Number(item.quantity || 0), 0), 0)
  const activePackaging = processed.filter((item) => item.status === 'processed' && !completedIds.has(item.salesOrderId)).length
  const submittedMedia = Object.values(media.records || {}).filter((record) => record.submittedAt).length
  const mediaPending = Math.max(0, completedIds.size - submittedMedia)
  const stageCounts = countStages(orders, stageMap)
  const progressPercent = confirmed ? Math.round(((completedIds.size + submittedMedia + dispatchedIds.size) / (confirmed * 3)) * 100) : 0
  const mediaUploads = Object.values(media.records || {}).reduce((sum, record) => sum + Object.values(record.units || {}).reduce((unitSum, unit) => unitSum + (unit.photos?.length || 0) + (unit.videos?.length || 0), 0), 0)
  const woodenTop = topWoodenRequirements(orders)
  const recent = processed.filter((item) => item.processedAt).sort((a, b) => Date.parse(b.processedAt || '') - Date.parse(a.processedAt || '')).slice(0, 5)

  return <DashboardShell active="Dashboard">
    <header className="top compact-top dashboard-hero"><div><span className="eyebrow">Operations command center</span><h1 className="h1">Dashboard</h1>{store.lastSuccessfulSyncAt && <p className="muted">Last successful sync: {new Date(store.lastSuccessfulSyncAt).toLocaleString()}</p>}</div><Badge tone="green">Live</Badge></header>

    <section className="dashboard-grid overview-grid">
      <div className="card hero-metric"><span className="muted">Confirmed SO</span><strong>{confirmed}</strong><em>{openOrders} open · {processedIds.size} processed</em><div className="progress-track"><i style={{ width: `${percent(processedIds.size, confirmed)}%` }} /></div></div>
      <Stat label="QR Generated" value={qrGenerated} sub={`${partiallyGenerated} partial`} tone="blue" />
      <Stat label="Packaging Done" value={completedIds.size} sub={`${activePackaging} active`} tone="amber" />
      <Stat label="Media Submitted" value={submittedMedia} sub={`${mediaPending} pending`} tone="purple" />
    </section>

    <section className="dashboard-grid main-dashboard-grid">
      <div className="card dashboard-panel span-2"><div className="panel-head"><div><h2>Order Lifecycle</h2><p className="muted">Live movement across operational stages</p></div><Badge tone="blue">{progressPercent}% flow</Badge></div><div className="stage-chart">{stageCounts.map((item) => <div className="stage-bar-row" key={item.label}><span>{item.label}</span><div><i className={item.tone} style={{ width: `${percent(item.value, confirmed)}%` }} /></div><strong>{item.value}</strong></div>)}</div></div>
      <div className="card dashboard-panel"><div className="panel-head"><div><h2>Fulfilment Mix</h2><p className="muted">Completed vs in-progress</p></div></div><Donut completed={completedIds.size} media={submittedMedia} dispatched={dispatchedIds.size} total={confirmed} /><div className="legend compact-legend"><span><i className="green-dot" />Packed</span><span><i className="purple-dot" />Media</span><span><i className="blue-dot" />Dispatched</span></div></div>
      <div className="card dashboard-panel"><div className="panel-head"><div><h2>Wooden Packing</h2><p className="muted">Top live requirements from synced orders</p></div><Badge tone="amber">{pendingWooden} units</Badge></div><div className="mini-bars">{woodenTop.length ? woodenTop.map((item) => <div className="mini-bar" key={item.name}><span>{item.name}</span><div><i style={{ width: `${percent(item.qty, woodenTop[0]?.qty || 1)}%` }} /></div><strong>{item.qty}</strong></div>) : <p className="muted">No wooden packing pending</p>}</div></div>
      <div className="card dashboard-panel"><div className="panel-head"><div><h2>Media Proof Health</h2><p className="muted">Actual upload and submission records</p></div></div><div className="media-health"><div><strong>{mediaUploads}</strong><span>Total uploads</span></div><div><strong>{mediaIds.size}</strong><span>Orders with media</span></div><div><strong>{submittedMedia}</strong><span>Submitted</span></div></div></div>
      <div className="card dashboard-panel span-2"><div className="panel-head"><div><h2>Recently Processed Orders</h2><p className="muted">Latest completed QR/process actions</p></div></div><div className="machine recent-list">{recent.length ? recent.map((item) => <div className="machine-row compact" key={item.salesOrderId}><span><strong>{item.salesOrderNumber}</strong></span><Badge tone="green">Processed</Badge><strong>{item.processedAt ? new Date(item.processedAt).toLocaleString() : '—'}</strong></div>) : <div className="machine-row compact"><span>No processed orders yet</span><strong>—</strong></div>}</div></div>
    </section>
  </DashboardShell>
}

function Stat({ label, value, sub, tone }: { label: string; value: number; sub: string; tone: 'blue' | 'amber' | 'purple' }) { return <div className={`card stat shine-card stat-${tone}`}><span className="muted">{label}</span><b>{value}</b><em>{sub}</em></div> }
function percent(value: number, total: number) { return Math.max(4, Math.min(100, total ? Math.round((value / total) * 100) : 0)) }
function countStages(orders: Order[], stages: Record<string, string>) {
  const rows = [
    { key: 'open', label: 'Open', value: 0, tone: 'gray' },
    { key: 'processed', label: 'Processed', value: 0, tone: 'amber' },
    { key: 'packed', label: 'Packed', value: 0, tone: 'blue' },
    { key: 'media_uploaded', label: 'Media Uploaded', value: 0, tone: 'purple' },
    { key: 'dispatched', label: 'Dispatched', value: 0, tone: 'green' },
  ]
  const byKey = Object.fromEntries(rows.map((row) => [row.key, row]))
  for (const order of orders) (byKey[stages[order.id] || 'open'] || byKey.open).value += 1
  return rows
}
function topWoodenRequirements(orders: Order[]) {
  const map = new Map<string, number>()
  for (const order of orders) for (const item of order.lineItems) if (item.woodenPackingRequired) map.set(item.itemName, (map.get(item.itemName) || 0) + Number(item.quantity || 0))
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, qty]) => ({ name, qty }))
}
function Donut({ completed, media, dispatched, total }: { completed: number; media: number; dispatched: number; total: number }) {
  const packedDeg = total ? Math.round((completed / total) * 120) : 0
  const mediaDeg = total ? Math.round((media / total) * 120) : 0
  const dispatchDeg = total ? Math.round((dispatched / total) * 120) : 0
  return <div className="donut-card"><div className="dashboard-donut" style={{ background: `conic-gradient(#22c55e 0 ${packedDeg}deg, #8b5cf6 ${packedDeg}deg ${packedDeg + mediaDeg}deg, #2563eb ${packedDeg + mediaDeg}deg ${packedDeg + mediaDeg + dispatchDeg}deg, #e2e8f0 ${packedDeg + mediaDeg + dispatchDeg}deg 360deg)` }}><span>{total ? Math.round(((completed + media + dispatched) / (total * 3)) * 100) : 0}%</span></div></div>
}
