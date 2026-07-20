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
  const packing = await readMediaProofStore('packing')
  const loading = await readMediaProofStore('loading')
  const dispatch = await readDispatchStore()
  const workflowMap = Object.fromEntries(processed.map((item) => [item.salesOrderId, item]))
  const stageMap = await buildStageMap(workflowMap)

  const processedIds = new Set(processed.map((item) => item.salesOrderId))
  const completedIds = new Set(Object.keys(completed.completed || {}))
  const packingIds = new Set(Object.keys(packing.records || {}))
  const loadingIds = new Set(Object.keys(loading.records || {}))
  const dispatchedIds = new Set(Object.keys(dispatch.dispatched || {}))
  const confirmed = orders.length
  const openOrders = orders.filter((o) => !processedIds.has(o.id)).length
  const qrGenerated = processed.filter((item) => item.status === 'qr_generated' || item.status === 'processed').length
  const partiallyGenerated = processed.filter((item) => item.status === 'partially_generated').length
  const pendingWooden = orders.reduce((sum, order) => sum + order.lineItems.filter((item) => item.woodenPackingRequired && item.quantity > 0).reduce((lineSum, item) => lineSum + Number(item.quantity || 0), 0), 0)
  const activePackaging = processed.filter((item) => item.status === 'processed' && !completedIds.has(item.salesOrderId)).length
  const submittedPacking = Object.values(packing.records || {}).filter((record) => record.submittedAt).length
  const submittedLoading = Object.values(loading.records || {}).filter((record) => record.submittedAt).length
  const submittedMedia = submittedLoading
  const stageCounts = countStages(orders, stageMap)
  const progressPercent = confirmed ? Math.round(((processedIds.size + completedIds.size + submittedPacking + submittedLoading) / (confirmed * 4)) * 100) : 0
  const packingUploads = Object.values(packing.records || {}).reduce((sum, record) => sum + Object.values(record.units || {}).reduce((unitSum, unit) => unitSum + (unit.photos?.length || 0) + (unit.videos?.length || 0), 0), 0)
  const loadingUploads = Object.values(loading.records || {}).reduce((sum, record) => sum + Object.values(record.units || {}).reduce((unitSum, unit) => unitSum + (unit.photos?.length || 0) + (unit.videos?.length || 0), 0), 0)
  const mediaUploads = packingUploads + loadingUploads
  const woodenTop = topWoodenRequirements(orders)
  const recent = processed.filter((item) => item.processedAt).sort((a, b) => Date.parse(b.processedAt || '') - Date.parse(a.processedAt || '')).slice(0, 5)
  const lastSync = store.lastSuccessfulSyncAt ? new Date(store.lastSuccessfulSyncAt).toLocaleString() : 'Awaiting first sync'

  return <DashboardShell active="Dashboard">
    <section className="command-dashboard">
      <header className="command-hero">
        <div className="hero-copy">
          <h1>Dispatch Dashboard</h1>
          <div className="hero-chips"><Badge tone="green">Live data</Badge><span>Last sync: {lastSync}</span></div>
        </div>
        <div className="hero-score-card">
          <strong>{progressPercent}%</strong>
          <div className="premium-progress"><i style={{ width: `${progressPercent}%` }} /></div>
          <em>{completedIds.size} packed · {submittedPacking} packing videos · {submittedLoading} loading videos</em>
        </div>
      </header>

      <section className="metric-ribbon">
        <Metric icon="SO" label="Confirmed SO" value={confirmed} sub={`${openOrders} open · ${processedIds.size} processed`} tone="red" />
        <Metric icon="QR" label="QR Generated" value={qrGenerated} sub={`${partiallyGenerated} partial`} tone="blue" />
        <Metric icon="PK" label="Packaging Done" value={completedIds.size} sub={`${activePackaging} active`} tone="green" />
        <Metric icon="PV" label="Packing Video" value={submittedPacking} sub={`${Math.max(0, completedIds.size - submittedPacking)} pending`} tone="purple" />
        <Metric icon="LV" label="Loading Video" value={submittedLoading} sub={`${Math.max(0, submittedPacking - submittedLoading)} pending`} tone="purple" />
      </section>

      <section className="command-grid">
        <div className="premium-panel lifecycle-panel"><PanelHead title="Order Lifecycle" accent={`${progressPercent}% flow`} /><div className="stage-chart premium-stage-chart">{stageCounts.map((item) => <div className="stage-bar-row" key={item.label}><span>{item.label}</span><div><i className={item.tone} style={{ width: `${percent(item.value, confirmed)}%` }} /></div><strong>{item.value}</strong></div>)}</div></div>
        <div className="premium-panel fulfillment-panel"><PanelHead title="Fulfilment Mix" /><Donut completed={completedIds.size} media={submittedMedia} dispatched={dispatchedIds.size} total={confirmed} /><div className="legend compact-legend"><span><i className="green-dot" />Packed</span><span><i className="purple-dot" />Media</span><span><i className="blue-dot" />Dispatched</span></div></div>
        <div className="premium-panel wooden-panel"><PanelHead title="Wooden Packing" accent={`${pendingWooden} units`} /><div className="mini-bars">{woodenTop.length ? woodenTop.map((item) => <div className="mini-bar" key={item.name}><span>{item.name}</span><div><i style={{ width: `${percent(item.qty, woodenTop[0]?.qty || 1)}%` }} /></div><strong>{item.qty}</strong></div>) : <p className="muted">No wooden packing pending</p>}</div></div>
        <div className="premium-panel media-panel"><PanelHead title="Video Health" /><div className="media-health premium-health"><div><strong>{packingUploads}</strong><span>Packing uploads</span></div><div><strong>{loadingUploads}</strong><span>Loading uploads</span></div><div><strong>{submittedLoading}</strong><span>Closed</span></div></div></div>
        <div className="premium-panel recent-panel"><PanelHead title="Recently Processed Orders" /><div className="machine recent-list">{recent.length ? recent.map((item) => <div className="machine-row compact" key={item.salesOrderId}><span><strong>{item.salesOrderNumber}</strong></span><Badge tone="green">Processed</Badge><strong>{item.processedAt ? new Date(item.processedAt).toLocaleString() : '—'}</strong></div>) : <div className="machine-row compact"><span>No processed orders yet</span><strong>—</strong></div>}</div></div>
      </section>
    </section>
  </DashboardShell>
}

function Metric({ icon, label, value, sub, tone }: { icon: string; label: string; value: number; sub: string; tone: 'red' | 'blue' | 'green' | 'purple' }) { return <article className={`metric-card metric-${tone}`}><div className="metric-icon">{icon}</div><div><span>{label}</span><strong>{value}</strong><em>{sub}</em></div></article> }
function PanelHead({ title, accent }: { title: string; accent?: string }) { return <div className="panel-head premium-panel-head"><div><h2>{title}</h2></div>{accent && <Badge tone="blue">{accent}</Badge>}</div> }
function percent(value: number, total: number) { return Math.max(value ? 4 : 0, Math.min(100, total ? Math.round((value / total) * 100) : 0)) }
function countStages(orders: Order[], stages: Record<string, string>) {
  const rows = [
    { key: 'open', label: 'Open', value: 0, tone: 'gray' },
    { key: 'processed', label: 'Processed', value: 0, tone: 'amber' },
    { key: 'packed', label: 'Packed', value: 0, tone: 'blue' },
    { key: 'packing_video', label: 'Packing Video', value: 0, tone: 'purple' },
    { key: 'loading_video', label: 'Loading Video', value: 0, tone: 'purple' },
    { key: 'closed', label: 'Closed', value: 0, tone: 'green' },
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
  return <div className="donut-card"><div className="dashboard-donut" style={{ background: `conic-gradient(#22c55e 0 ${packedDeg}deg, #8b5cf6 ${packedDeg}deg ${packedDeg + mediaDeg}deg, #2563eb ${packedDeg + mediaDeg}deg ${packedDeg + mediaDeg + dispatchDeg}deg, #e5edf7 ${packedDeg + mediaDeg + dispatchDeg}deg 360deg)` }}><span>{total ? Math.round(((completed + media + dispatched) / (total * 3)) * 100) : 0}%</span></div></div>
}
