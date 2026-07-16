'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Badge } from '@/components/DashboardShell'

const WOODEN_CACHE_KEY = 'bsm.wooden.requirements.v2'
const WOODEN_STATUS_KEY = 'bsm.wooden.status.v2'
const OLD_WOODEN_STATUS_KEY = 'bsm.wooden.status.v1'
const WOODEN_AUTO_SYNC_MS = 30 * 60 * 1000
type WoodenStatus = 'Required' | 'Ordered'
type WoodenItem = { id: string; salesOrderNumber: string; customerName: string; itemName: string; requiredQuantity: number }
type WoodenQueue = { lastSuccessAt?: string | null; items: WoodenItem[] }
type ConsolidatedRow = { itemName: string; totalQuantity: number; salesOrders: string; customers: string; status: string }

export function WoodenPackingClient({ initialQueue = { items: [] } }: { initialQueue?: WoodenQueue }) {
  const [queue, setQueue] = useState<WoodenQueue>(initialQueue)
  const [statuses, setStatuses] = useState<Record<string, WoodenStatus>>({})
  const [syncing, setSyncing] = useState(false)
  const syncingRef = useRef(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const cached = readCache()
    if (cached.items.length > initialQueue.items.length) setQueue(cached)
    setStatuses(readStatuses(cached.items.length ? cached.items : initialQueue.items))
    void loadSaved()
  }, [initialQueue.items])

  useEffect(() => {
    const timer = window.setInterval(() => { void syncZoho(false) }, WOODEN_AUTO_SYNC_MS)
    return () => window.clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rows = queue.items || []
  const grouped = useMemo(() => {
    const map = new Map<string, WoodenItem[]>()
    rows.forEach((row) => map.set(row.salesOrderNumber, [...(map.get(row.salesOrderNumber) || []), row]))
    return [...map.entries()].sort(([a, aItems], [b, bItems]) => {
      const aStatus = statuses[a] || 'Required'
      const bStatus = statuses[b] || 'Required'
      if (aStatus !== bStatus) return aStatus === 'Required' ? -1 : 1
      return a.localeCompare(b) || (aItems[0]?.customerName || '').localeCompare(bItems[0]?.customerName || '')
    })
  }, [rows, statuses])
  const requiredRows = useMemo(() => rows.filter((row) => (statuses[row.salesOrderNumber] || 'Required') === 'Required'), [rows, statuses])
  const consolidated = useMemo(() => consolidateRows(requiredRows), [requiredRows])
  const pendingRequiredTotal = useMemo(() => requiredRows.reduce((sum, row) => sum + Number(row.requiredQuantity || 0), 0), [requiredRows])

  async function loadSaved() {
    try {
      const response = await fetch('/api/wooden-packing', { cache: 'no-store' })
      const json = await response.json()
      const saved = json.data?.queue || { items: [] }
      setQueue(saved); localStorage.setItem(WOODEN_CACHE_KEY, JSON.stringify(saved))
      setStatuses((current) => ({ ...readStatuses(saved.items), ...current }))
    } catch {}
  }

  async function syncZoho(showError = true) {
    if (syncingRef.current) return
    syncingRef.current = true
    setSyncing(true); setError('')
    try {
      const response = await fetch('/api/wooden-packing', { method: 'POST', cache: 'no-store' })
      const json = await response.json()
      const next = json.data?.queue
      if (!response.ok || !json.ok) throw new Error(json.error || 'Wooden Packing sync failed. Showing the last successfully synced data.')
      setQueue(next); localStorage.setItem(WOODEN_CACHE_KEY, JSON.stringify(next))
    } catch (err) {
      if (showError) setError(err instanceof Error ? err.message : 'Wooden Packing sync failed. Showing the last successfully synced data.')
      await loadSaved()
    } finally { syncingRef.current = false; setSyncing(false) }
  }

  function updateStatus(salesOrderNumber: string, status: WoodenStatus) {
    const next = { ...statuses, [salesOrderNumber]: status }
    setStatuses(next)
    localStorage.setItem(WOODEN_STATUS_KEY, JSON.stringify(next))
  }

  return <>
    <header className="top compact-top"><div><h1 className="h1">Wooden Packing</h1></div><button className="btn red" onClick={() => syncZoho(true)} disabled={syncing}>{syncing ? 'Syncing…' : 'Sync Zoho'}</button></header>
    {error && <div className="form-error">{error}</div>}
    <section className="grid two analytics-grid"><div className="card"><h2>Consolidated Summary</h2><div className="big-number">{pendingRequiredTotal}</div><p className="muted">Required wooden packing still pending order</p><p className="muted">Last successful sync: {queue.lastSuccessAt ? new Date(queue.lastSuccessAt).toLocaleString() : 'Not synced yet'}</p></div><div className="card"><h2>Export</h2><div className="tabs"><button className="btn light" onClick={() => printConsolidated(consolidated)}>Print</button><button className="btn red" onClick={() => downloadXls('wooden-packing-consolidated-requirements.xls', consolidated)}>Download</button></div></div></section>
    <div style={{ height: 16 }} />
    <section className="card"><h2>Pending Wooden Packing</h2>{syncing && <div className="machine-row compact"><span>Syncing complete Zoho wooden packing queue</span><Badge>Live</Badge></div>}<div className="machine">{grouped.map(([so, items]) => { const status = statuses[so] || 'Required'; return <div className={`machine-row wooden-order-row ${status === 'Ordered' ? 'ordered' : 'required'}`} key={so}><div><strong>{so}</strong><p className="muted">{items[0]?.customerName}</p>{items.map((item) => <p key={item.id}>{item.itemName} — <strong>{item.requiredQuantity}</strong></p>)}</div><select className={`status-select ${status === 'Ordered' ? 'green' : 'required'}`} value={status} onChange={(event) => updateStatus(so, event.target.value as WoodenStatus)} aria-label={`Wooden packing status for ${so}`}><option>Required</option><option>Ordered</option></select></div> })}</div></section>
  </>
}

function consolidateRows(rows: WoodenItem[]): ConsolidatedRow[] {
  const map = new Map<string, { itemName: string; totalQuantity: number; salesOrders: Set<string>; customers: Set<string> }>()
  for (const row of rows) {
    const key = row.itemName.trim().toLowerCase()
    const entry = map.get(key) || { itemName: row.itemName, totalQuantity: 0, salesOrders: new Set<string>(), customers: new Set<string>() }
    entry.totalQuantity += Number(row.requiredQuantity || 0)
    entry.salesOrders.add(row.salesOrderNumber)
    if (row.customerName) entry.customers.add(row.customerName)
    map.set(key, entry)
  }
  return [...map.values()].sort((a, b) => a.itemName.localeCompare(b.itemName)).map((entry) => ({ itemName: entry.itemName, totalQuantity: entry.totalQuantity, salesOrders: [...entry.salesOrders].join(', '), customers: [...entry.customers].join(', '), status: 'Required' }))
}

function xlsTable(rows: ConsolidatedRow[]) {
  const esc = (value: string | number) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<table><thead><tr><th>Machine / Item</th><th>Total Wooden Boxes Required</th><th>Sales Orders</th><th>Customers</th><th>Status</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${esc(row.itemName)}</td><td>${esc(row.totalQuantity)}</td><td>${esc(row.salesOrders)}</td><td>${esc(row.customers)}</td><td>${esc(row.status)}</td></tr>`).join('')}</tbody></table>`
}

function downloadXls(fileName: string, rows: ConsolidatedRow[]) {
  const html = `<!doctype html><html><head><meta charset="utf-8" /></head><body>${xlsTable(rows)}</body></html>`
  const url = URL.createObjectURL(new Blob([html], { type: 'application/vnd.ms-excel' }))
  const a = document.createElement('a')
  a.href = url; a.download = fileName; a.click(); URL.revokeObjectURL(url)
}

function printConsolidated(rows: ConsolidatedRow[]) {
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(`<!doctype html><html><head><title>Wooden Packing Requirements</title><style>body{font-family:Arial,sans-serif;padding:24px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:10px;text-align:left}th{background:#f1f5f9}</style></head><body><h1>Wooden Packing Requirements</h1>${xlsTable(rows)}</body></html>`)
  win.document.close(); win.focus(); win.print()
}

function readCache(): WoodenQueue { try { return JSON.parse(localStorage.getItem(WOODEN_CACHE_KEY) || '{"items":[]}') as WoodenQueue } catch { return { items: [] } } }
function readStatuses(rows: WoodenItem[] = []): Record<string, WoodenStatus> {
  try {
    const current = JSON.parse(localStorage.getItem(WOODEN_STATUS_KEY) || '{}') as Record<string, WoodenStatus>
    if (Object.keys(current).length) return current
    const old = JSON.parse(localStorage.getItem(OLD_WOODEN_STATUS_KEY) || '{}') as Record<string, string>
    const migrated: Record<string, WoodenStatus> = {}
    for (const [salesOrderNumber, items] of rows.reduce((map, row) => map.set(row.salesOrderNumber, [...(map.get(row.salesOrderNumber) || []), row]), new Map<string, WoodenItem[]>())) {
      migrated[salesOrderNumber] = items.some((item) => old[item.id] === 'Ordered' || old[item.id] === 'Completed') ? 'Ordered' : 'Required'
    }
    if (Object.keys(migrated).length) localStorage.setItem(WOODEN_STATUS_KEY, JSON.stringify(migrated))
    return migrated
  } catch { return {} }
}
