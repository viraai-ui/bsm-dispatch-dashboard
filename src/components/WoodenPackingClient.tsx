'use client'

import { useEffect, useMemo, useState } from 'react'
import { Badge } from '@/components/DashboardShell'
import type { Order } from '@/types/domain'

const WOODEN_CACHE_KEY = 'bsm.wooden.requirements.v1'
const DETAIL_BATCH_SIZE = 10
const DETAIL_LIMIT = 200

type WoodenItem = { id: string; salesOrderNumber: string; customerName: string; itemName: string; requiredQuantity: number }

export function WoodenPackingClient() {
  const [rows, setRows] = useState<WoodenItem[]>([])
  const [syncing, setSyncing] = useState(false)
  const [scanning, setScanning] = useState(false)
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
    setScanning(false)
    setError('')
    try {
      const listResponse = await fetch('/api/orders', { cache: 'no-store' })
      const listJson = await listResponse.json()
      if (!listResponse.ok || !listJson.ok) throw new Error(listJson.error || 'Failed to fetch data from Zoho')
      const openOrders: Order[] = (listJson.data?.orders || []).filter((order: Order) => order.status === 'open' || order.status === 'partially_shipped')
      setSyncing(false)
      setScanning(true)
      await scanWoodenRequirements(openOrders.slice(0, DETAIL_LIMIT))
    } catch (err) {
      setRows([])
      localStorage.removeItem(WOODEN_CACHE_KEY)
      if (showError) setError('Failed to fetch data from Zoho')
      setSyncing(false)
      setScanning(false)
    }
  }

  async function scanWoodenRequirements(openOrders: Order[]) {
    const found = new Map<string, WoodenItem>()
    for (let index = 0; index < openOrders.length; index += DETAIL_BATCH_SIZE) {
      const batch = openOrders.slice(index, index + DETAIL_BATCH_SIZE)
      const details = await Promise.allSettled(batch.map(async (order) => {
        const response = await fetch(`/api/orders/${order.zohoSalesOrderId || order.id}`, { cache: 'no-store' })
        const json = await response.json()
        if (!response.ok || !json.ok) throw new Error(json.error || 'Failed to fetch data from Zoho')
        return json.data?.order as Order
      }))
      for (const result of details) {
        if (result.status !== 'fulfilled' || !result.value) continue
        const order = result.value
        for (const item of order.lineItems) {
          if (!item.woodenPackingRequired || item.pendingQuantity <= 0) continue
          found.set(`${order.id}-${item.id}`, { id: `${order.id}-${item.id}`, salesOrderNumber: order.salesOrderNumber, customerName: order.customerName, itemName: item.itemName, requiredQuantity: item.pendingQuantity })
        }
      }
      const nextRows = [...found.values()]
      setRows(nextRows)
      localStorage.setItem(WOODEN_CACHE_KEY, JSON.stringify(nextRows))
    }
    setScanning(false)
  }

  return <>
    <header className="top compact-top"><div><h1 className="h1">Wooden Packing</h1></div><button className="btn red" onClick={() => syncZoho(true)} disabled={syncing}>{syncing ? 'Syncing…' : 'Sync Zoho'}</button></header>
    {error && <div className="form-error">{error}</div>}
    <section className="grid two analytics-grid"><div className="card"><h2>Consolidated Summary</h2><div className="big-number">{rows.reduce((sum, row) => sum + row.requiredQuantity, 0)}</div><p className="muted">Machines requiring wooden packing</p></div><div className="card"><h2>Export</h2><div className="tabs"><button className="btn light" onClick={() => navigator.clipboard.writeText(summary)}>Copy List</button><button className="btn light" onClick={() => window.print()}>Print</button><button className="btn red" onClick={() => downloadText('wooden-packing-requirements.txt', summary)}>Download</button></div></div></section>
    <div style={{ height: 16 }} />
    <section className="card"><h2>Pending Wooden Packing</h2>{syncing && <div className="machine-row compact"><span>Fetching open Zoho orders</span><Badge>Live</Badge></div>}{scanning && <div className="machine-row compact"><span>Checking open orders for wooden packing</span><Badge tone="amber">Background</Badge></div>}<div className="machine">{grouped.map(([so, items]) => <div className="machine-row" key={so}><div><strong>{so}</strong><p className="muted">{items[0]?.customerName}</p>{items.map((item) => <p key={item.id}>{item.itemName} — <strong>{item.requiredQuantity}</strong></p>)}</div><Badge tone="amber">Required</Badge></div>)}</div></section>
  </>
}

function readCache(): WoodenItem[] { try { return JSON.parse(localStorage.getItem(WOODEN_CACHE_KEY) || '[]') as WoodenItem[] } catch { return [] } }
function downloadText(fileName: string, text: string) { const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' })); const a = document.createElement('a'); a.href = url; a.download = fileName; a.click(); URL.revokeObjectURL(url) }
