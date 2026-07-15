'use client'

import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/DashboardShell'

const WOODEN_CACHE_KEY = 'bsm.wooden.requirements.v2'
type WoodenItem = { id: string; salesOrderNumber: string; customerName: string; itemName: string; requiredQuantity: number }
type WoodenQueue = { lastSuccessAt?: string | null; items: WoodenItem[] }

export function WoodenPackingClient({ initialQueue = { items: [] } }: { initialQueue?: WoodenQueue }) {
  const [queue, setQueue] = useState<WoodenQueue>(initialQueue)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { const cached = readCache(); if (cached.items.length > initialQueue.items.length) setQueue(cached); void loadSaved() }, [initialQueue.items.length])
  const rows = queue.items || []
  const grouped = useMemo(() => {
    const map = new Map<string, WoodenItem[]>()
    rows.forEach((row) => map.set(row.salesOrderNumber, [...(map.get(row.salesOrderNumber) || []), row]))
    return [...map.entries()]
  }, [rows])
  const summary = rows.map((row) => `${row.salesOrderNumber}\t${row.customerName}\t${row.itemName}\t${row.requiredQuantity}`).join('\n')

  async function loadSaved() {
    try {
      const response = await fetch('/api/wooden-packing', { cache: 'no-store' })
      const json = await response.json()
      const saved = json.data?.queue || { items: [] }
      setQueue(saved); localStorage.setItem(WOODEN_CACHE_KEY, JSON.stringify(saved))
    } catch {}
  }

  async function syncZoho(showError = true) {
    if (syncing) return
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
    } finally { setSyncing(false) }
  }

  return <>
    <header className="top compact-top"><div><h1 className="h1">Wooden Packing</h1></div><button className="btn red" onClick={() => syncZoho(true)} disabled={syncing}>{syncing ? 'Syncing…' : 'Sync Zoho'}</button></header>
    {error && <div className="form-error">{error}</div>}
    <section className="grid two analytics-grid"><div className="card"><h2>Consolidated Summary</h2><div className="big-number">{rows.reduce((sum, row) => sum + row.requiredQuantity, 0)}</div><p className="muted">Machines requiring wooden packing</p><p className="muted">Last successful sync: {queue.lastSuccessAt ? new Date(queue.lastSuccessAt).toLocaleString() : 'Not synced yet'}</p></div><div className="card"><h2>Export</h2><div className="tabs"><button className="btn light" onClick={() => navigator.clipboard.writeText(summary)}>Copy List</button><button className="btn light" onClick={() => window.print()}>Print</button><button className="btn red" onClick={() => downloadText('wooden-packing-requirements.txt', summary)}>Download</button><button className="btn light" onClick={() => syncZoho(true)} disabled={syncing}>Retry Sync</button></div></div></section>
    <div style={{ height: 16 }} />
    <section className="card"><h2>Pending Wooden Packing</h2>{syncing && <div className="machine-row compact"><span>Syncing complete Zoho wooden packing queue</span><Badge>Live</Badge></div>}<div className="machine">{grouped.map(([so, items]) => <div className="machine-row" key={so}><div><strong>{so}</strong><p className="muted">{items[0]?.customerName}</p>{items.map((item) => <p key={item.id}>{item.itemName} — <strong>{item.requiredQuantity}</strong></p>)}</div><Badge tone="amber">Required</Badge></div>)}</div></section>
  </>
}

function readCache(): WoodenQueue { try { return JSON.parse(localStorage.getItem(WOODEN_CACHE_KEY) || '{"items":[]}') as WoodenQueue } catch { return { items: [] } } }
function downloadText(fileName: string, text: string) { const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' })); const a = document.createElement('a'); a.href = url; a.download = fileName; a.click(); URL.revokeObjectURL(url) }
