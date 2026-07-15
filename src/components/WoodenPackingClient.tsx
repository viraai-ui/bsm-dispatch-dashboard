'use client'

import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/DashboardShell'
import type { Order } from '@/types/domain'

const WOODEN_CACHE_KEY = 'bsm.wooden.requirements.v1'

type WoodenItem = { id: string; salesOrderNumber: string; customerName: string; itemName: string; requiredQuantity: number }

export function WoodenPackingClient() {
  const [rows, setRows] = useState<WoodenItem[]>([])
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    setRows(readCache())
    void syncZoho(false)
  }, [])

  const grouped = useMemo(() => {
    const map = new Map<string, WoodenItem[]>()
    rows.forEach((row) => map.set(row.salesOrderNumber, [...(map.get(row.salesOrderNumber) || []), row]))
    return [...map.entries()]
  }, [rows])

  const summary = rows.map((row) => `${row.salesOrderNumber}\t${row.customerName}\t${row.itemName}\t${row.requiredQuantity}`).join('\n')

  async function syncZoho(showError = true) {
    setSyncing(true)
    setError('')
    try {
      const listResponse = await fetch('/api/orders', { cache: 'no-store' })
      const listJson = await listResponse.json()
      const orders: Order[] = listJson.data?.orders || []
      const details = await Promise.all(orders.map(async (order) => {
        try {
          const response = await fetch(`/api/orders/${order.zohoSalesOrderId || order.id}`, { cache: 'no-store' })
          const json = await response.json()
          return json.data?.order as Order | undefined
        } catch { return undefined }
      }))
      const nextRows = details.filter(Boolean).flatMap((order) => order!.lineItems.filter((item) => item.woodenPackingRequired && item.pendingQuantity > 0).map((item) => ({ id: `${order!.id}-${item.id}`, salesOrderNumber: order!.salesOrderNumber, customerName: order!.customerName, itemName: item.itemName, requiredQuantity: item.pendingQuantity })))
      const deduped = [...new Map(nextRows.map((row) => [row.id, row])).values()]
      setRows(deduped)
      localStorage.setItem(WOODEN_CACHE_KEY, JSON.stringify(deduped))
    } catch (err) {
      if (showError) setError(err instanceof Error ? err.message : 'Could not sync wooden packing')
    } finally { setSyncing(false) }
  }

  return <>
    <header className="top compact-top"><div><h1 className="h1">Wooden Packing</h1></div><button className="btn red" onClick={() => syncZoho(true)} disabled={syncing}>{syncing ? 'Syncing…' : 'Sync Zoho'}</button></header>
    {error && <div className="form-error">{error}</div>}
    <section className="grid two analytics-grid"><div className="card"><h2>Consolidated Summary</h2><div className="big-number">{rows.reduce((sum, row) => sum + row.requiredQuantity, 0)}</div><p className="muted">Machines requiring wooden packing</p></div><div className="card"><h2>Export</h2><div className="tabs"><button className="btn light" onClick={() => navigator.clipboard.writeText(summary)}>Copy List</button><button className="btn light" onClick={() => window.print()}>Print</button><button className="btn red" onClick={() => downloadText('wooden-packing-requirements.txt', summary)}>Download</button></div></div></section>
    <div style={{ height: 16 }} />
    <section className="card"><h2>Pending Wooden Packing</h2>{syncing && <div className="machine-row compact"><span>Syncing in background</span><Badge>Live</Badge></div>}<div className="machine">{grouped.map(([so, items]) => <div className="machine-row" key={so}><div><strong>{so}</strong><p className="muted">{items[0]?.customerName}</p>{items.map((item) => <p key={item.id}>{item.itemName} — <strong>{item.requiredQuantity}</strong></p>)}</div><Badge tone="amber">Required</Badge></div>)}</div></section>
  </>
}

function readCache(): WoodenItem[] { try { return JSON.parse(localStorage.getItem(WOODEN_CACHE_KEY) || '[]') as WoodenItem[] } catch { return [] } }
function downloadText(fileName: string, text: string) { const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' })); const a = document.createElement('a'); a.href = url; a.download = fileName; a.click(); URL.revokeObjectURL(url) }
