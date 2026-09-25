'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { CancelledOrderSearchResult, ReallocationRow, TargetOption } from '@/lib/machine-reallocation'

type ViewRow = ReallocationRow
type View = { rows: ViewRow[] }
type Notice = { tone: 'success' | 'error'; text: string } | null

export function MachineReallocationClient({ initial }: { initial: View }) {
  const [view, setView] = useState(initial)
  const [search, setSearch] = useState<Record<string, string>>({})
  const [targetResults, setTargetResults] = useState<Record<string, TargetOption[]>>({})
  const [selected, setSelected] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState<Notice>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CancelledOrderSearchResult[]>([])
  const [staged, setStaged] = useState<Record<string, CancelledOrderSearchResult>>({})
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const openButtonRef = useRef<HTMLButtonElement>(null)
  const destinationTimers = useRef<Record<string, number>>({})
  const destinationQueries = useRef<Record<string, string>>({})

  async function act(body: object, token: string) {
    setBusy(token); setNotice(null)
    try {
      const response = await fetch('/api/machine-reallocation', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const json = await response.json()
      if (!response.ok || !json.ok) throw new Error(json.error || 'Request failed')
      setView(json.data)
      return true
    } catch (error) {
      setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Request failed' })
      return false
    } finally { setBusy('') }
  }

  function closeModal() {
    if (busy === 'import-batch') return
    setModalOpen(false); setQuery(''); setResults([]); setStaged({}); setSearchError('')
    requestAnimationFrame(() => openButtonRef.current?.focus())
  }

  useEffect(() => {
    if (!modalOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    requestAnimationFrame(() => searchRef.current?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && busy !== 'import-batch') closeModal()
      if (event.key === 'Tab') {
        const modal = document.querySelector<HTMLElement>('.reallocation-modal')
        const focusable = modal?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])')
        if (!focusable?.length) return
        const first = focusable[0], last = focusable[focusable.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKeyDown) }
  }, [modalOpen, busy])

  useEffect(() => {
    if (!modalOpen) return
    const trimmed = query.trim()
    if (trimmed.length < 2) { setResults([]); setSearchError(''); setSearching(false); return }
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setSearching(true); setSearchError('')
      try {
        const response = await fetch(`/api/machine-reallocation?q=${encodeURIComponent(trimmed)}`, { cache: 'no-store', signal: controller.signal })
        const json = await response.json()
        if (!response.ok || !json.ok) throw new Error(json.error || 'Search failed')
        setResults(Array.isArray(json.data) ? json.data : [])
      } catch (error) {
        if ((error as Error).name !== 'AbortError') setSearchError(error instanceof Error ? error.message : 'Unable to search orders')
      } finally { if (!controller.signal.aborted) setSearching(false) }
    }, 320)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [query, modalOpen])

  async function saveStaged() {
    const orderIds = Object.keys(staged)
    if (!orderIds.length) return
    if (await act({ action: 'import-batch', orderIds }, 'import-batch')) {
      const count = orderIds.length
      closeModal()
      setNotice({ tone: 'success', text: `${count} Sales ${count === 1 ? 'Order' : 'Orders'} added to the reallocation queue.` })
    }
  }

  async function searchDestinations(row: ViewRow, value?: string) {
    const input = (value ?? search[row.id] ?? '').trim()
    if (input.length < 2) return
    setBusy(`search:${row.id}`); setNotice(null); setSelected(old => ({ ...old, [row.id]: '' }))
    try {
      const response = await fetch(`/api/machine-reallocation?destinationRowId=${encodeURIComponent(row.id)}&q=${encodeURIComponent(input)}`, { cache: 'no-store' })
      const json = await response.json()
      if (!response.ok || !json.ok) throw new Error(json.error || 'Destination search failed')
      if (destinationQueries.current[row.id] !== input) return
      setTargetResults(old => ({ ...old, [row.id]: Array.isArray(json.data) ? json.data : [] }))
    } catch (error) { setNotice({ tone: 'error', text: error instanceof Error ? error.message : 'Destination search failed' }) }
    finally { setBusy('') }
  }

  function updateDestinationSearch(row: ViewRow, value: string) {
    setSearch(old => ({ ...old, [row.id]: value }))
    destinationQueries.current[row.id] = value.trim()
    setTargetResults(old => { const next = { ...old }; delete next[row.id]; return next })
    setSelected(old => ({ ...old, [row.id]: '' }))
    window.clearTimeout(destinationTimers.current[row.id])
    if (value.trim().length < 2) return
    destinationTimers.current[row.id] = window.setTimeout(() => void searchDestinations(row, value), 320)
  }

  async function relocate(row: ViewRow, target: TargetOption) {
    if (await act({ action: 'relocate', rowId: row.id, targetOrderId: target.orderId, targetMachineId: target.machineId }, row.id)) setNotice({ tone: 'success', text: `Serial ${row.serialNumber} relocated to ${target.salesOrderNumber}.` })
  }

  async function removeQueued(row: ViewRow) {
    if (!window.confirm(`Remove serial ${row.serialNumber} from the reallocation queue?`)) return
    if (await act({ action: 'cancel', rowId: row.id }, `cancel:${row.id}`)) setNotice({ tone: 'success', text: `Serial ${row.serialNumber} removed from the queue.` })
  }

  async function undoRelocation(row: ViewRow) {
    if (await act({ action: 'undo', rowId: row.id }, `undo:${row.id}`)) setNotice({ tone: 'success', text: `Relocation of serial ${row.serialNumber} undone.` })
  }

  const available = useMemo(() => view.rows.filter(row => row.status === 'available').length, [view.rows])
  const relocated = view.rows.length - available
  const stagedOrders = Object.values(staged)

  return <div className="reallocation-page">
    <header className="page-head reallocation-page-head">
      <div><span className="eyebrow">Serial-safe operations</span><h1>Machine Reallocation</h1><p>Move an existing generated serial from any database Sales Order to a compatible open unit.</p></div>
      <div className="reallocation-stats" aria-label={`${available} available, ${relocated} relocated`}><span className="reallocation-count"><strong>{available}</strong> available</span>{relocated > 0 && <span className="reallocation-count complete"><strong>{relocated}</strong> relocated</span>}</div>
    </header>

    <section className="card reallocation-import" aria-labelledby="reallocation-import-title">
      <div className="reallocation-section-copy"><div><h2 id="reallocation-import-title">Add Sales Orders</h2><p>Find any database order by customer or SO number, then add its eligible machines to the queue.</p></div></div>
      <button ref={openButtonRef} type="button" className="primary reallocation-add-button" onClick={() => setModalOpen(true)} disabled={busy !== ''}>
        <span aria-hidden="true">＋</span> Search &amp; Add Sales Order
      </button>
    </section>
    {notice && <div className={`reallocation-message ${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>{notice.text}</div>}

    <section className="reallocation-list" aria-labelledby="reallocation-queue-title">
      <div className="reallocation-heading"><div><h2 id="reallocation-queue-title">Reallocation queue</h2></div><span>{view.rows.length} serial {view.rows.length === 1 ? 'record' : 'records'}</span></div>
      {!view.rows.length && <div className="card reallocation-empty"><span className="reallocation-empty-icon" aria-hidden="true">↗</span><h3>No machines in the queue</h3><p>Search any database Sales Order to find its generated, eligible serials.</p></div>}
      {view.rows.map(row => {
        const targets = targetResults[row.id] || []
        const chosen = targets.find(target => `${target.orderId}:${target.machineId}` === selected[row.id])
        const isBusy = busy === row.id || busy === `cancel:${row.id}` || busy === `undo:${row.id}`
        return <article className={`card reallocation-row ${row.status}`} key={row.id} aria-busy={isBusy}>
          {row.status === 'available'
            ? <button type="button" className="reallocation-row-control remove" onClick={() => void removeQueued(row)} disabled={busy !== ''} aria-label={`Remove serial ${row.serialNumber} from queue`} title="Remove from queue"><span aria-hidden="true">×</span></button>
            : <button type="button" className="reallocation-row-control undo" onClick={() => void undoRelocation(row)} disabled={busy !== ''} aria-label={`Undo relocation of serial ${row.serialNumber}`}><span>{busy === `undo:${row.id}` ? 'Undoing…' : 'Undo'}</span></button>}
          <div className="reallocation-machine"><div className="reallocation-machine-title"><span className={`badge ${row.status === 'available' ? 'purple' : 'green'}`}>{row.status === 'available' ? 'Available' : 'Relocated'}</span><h3>{row.itemName}</h3><span className="serial-label">Machine serial</span><strong className="serial">{row.serialNumber}</strong></div>
            <dl><div><dt>Original SO</dt><dd>{row.sourceSalesOrderNumber}</dd></div><div><dt>Customer</dt><dd>{row.sourceCustomerName}</dd></div><div><dt>Model / SKU</dt><dd>{row.sku || '—'}</dd></div><div><dt>Specification</dt><dd>{row.itemDescription || '—'}</dd></div></dl></div>
          {row.status === 'available' ? <div className="reallocation-target">
            <label className="reallocation-destination-search"><span aria-hidden="true">⌕</span><input aria-label={`Find destination for ${row.serialNumber}`} placeholder="Find destination by customer or SO" value={search[row.id] || ''} onChange={event => updateDestinationSearch(row, event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && (search[row.id] || '').trim().length >= 2) { event.preventDefault(); window.clearTimeout(destinationTimers.current[row.id]); void searchDestinations(row) } }} autoComplete="off" /><em>{busy === `search:${row.id}` ? 'Searching…' : 'Destination'}</em></label>
            {targets.length > 0 && <div className="reallocation-destination-results" aria-live="polite">{targets.map(target => { const value = `${target.orderId}:${target.machineId}`; const picked = selected[row.id] === value; return <button type="button" className={`reallocation-destination-result ${picked ? 'selected' : ''}`} key={value} aria-pressed={picked} onClick={() => setSelected(old => ({ ...old, [row.id]: value }))}><span><strong>{target.customerName}</strong><small>{target.salesOrderNumber} · {target.itemName}</small></span><span>{picked ? '✓' : 'Choose'}</span></button> })}</div>}
            {targetResults[row.id] && !targets.length && <small className="reallocation-destination-empty">No compatible active machines found.</small>}
            {chosen && <div className="reallocation-destination-confirm"><small>{chosen.currentSerialNumber ? `Replaces serial ${chosen.currentSerialNumber}; audit history is retained.` : 'Destination is currently unallocated.'}</small><button className="primary reallocation-action" disabled={busy !== ''} aria-busy={isBusy} onClick={() => void relocate(row, chosen)}>{isBusy ? 'Relocating…' : 'Relocate'}</button></div>}
          </div> : <div className="reallocation-complete"><span className="reallocation-check" aria-hidden="true">✓</span><div><strong>Relocated to {row.targetSalesOrderNumber}</strong><span>{row.relocatedAt ? new Date(row.relocatedAt).toLocaleString() : 'Relocation complete'}</span></div></div>}
        </article>
      })}
    </section>

    {modalOpen && <div className="reallocation-modal-layer" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) closeModal() }}>
      <section className="reallocation-modal" role="dialog" aria-modal="true" aria-labelledby="cancelled-order-modal-title" aria-describedby="cancelled-order-modal-copy">
        <header className="reallocation-modal-head"><div><span className="eyebrow">Database order search</span><h2 id="cancelled-order-modal-title">Search &amp; add orders</h2><p id="cancelled-order-modal-copy">Search by customer name or Sales Order number. Select one or more orders before saving.</p></div><button className="reallocation-modal-close" type="button" onClick={closeModal} disabled={busy === 'import-batch'} aria-label="Close dialog">×</button></header>
        <div className="reallocation-modal-body">
          <label className="reallocation-modal-search"><span className="reallocation-modal-search-icon" aria-hidden="true">⌕</span><input ref={searchRef} aria-label="Customer name or Sales Order number" value={query} onChange={event => setQuery(event.target.value)} placeholder="Customer name or Sales Order number" autoComplete="off" /><em aria-hidden="true">{searching ? 'Searching…' : 'Customer or SO'}</em></label>
          {stagedOrders.length > 0 && <div className="reallocation-staged" aria-label="Orders selected to add"><div><strong>Selected</strong><span>{stagedOrders.length} {stagedOrders.length === 1 ? 'order' : 'orders'}</span></div><div className="reallocation-staged-chips">{stagedOrders.map(order => <button key={order.orderId} type="button" onClick={() => setStaged(old => { const next = { ...old }; delete next[order.orderId]; return next })} aria-label={`Remove ${order.salesOrderNumber}`}><span>{order.salesOrderNumber}</span> ×</button>)}</div></div>}
          <div className="reallocation-results" aria-live="polite">
            {searchError && <div className="reallocation-search-state error" role="alert"><strong>Search unavailable</strong><span>{searchError}</span></div>}
            {!searchError && searching && <div className="reallocation-search-state"><span className="reallocation-spinner" aria-hidden="true" /><strong>Searching order history…</strong></div>}
            {!searchError && !searching && query.trim().length < 2 && <div className="reallocation-search-state"><span className="reallocation-search-icon" aria-hidden="true">⌕</span><strong>Find a Sales Order</strong><span>Enter at least 2 characters. Customer name is the quickest way to search.</span></div>}
            {!searchError && !searching && query.trim().length >= 2 && !results.length && <div className="reallocation-search-state"><strong>No matching orders</strong><span>Try another customer name or the full Sales Order number.</span></div>}
            {!searchError && !searching && results.map(order => {
              const isStaged = Boolean(staged[order.orderId])
              return <article className={`reallocation-result ${isStaged ? 'staged' : ''} ${!order.eligible ? 'ineligible' : ''}`} key={order.orderId}>
                <div className="reallocation-result-copy"><strong>{order.customerName || 'Unnamed customer'}</strong><span className="reallocation-result-so">{order.salesOrderNumber}</span><div className="reallocation-result-meta"><span>{order.status || 'Unknown status'}</span>{order.date && <span>{new Date(order.date).toLocaleDateString()}</span>}<span>{order.eligibleMachineCount} of {order.generatedMachineCount} {order.generatedMachineCount === 1 ? 'machine' : 'machines'} eligible</span>{order.historical && <span>Saved history</span>}</div>{!order.eligible && <small>{order.ineligibilityReason || 'This order cannot be added'}</small>}</div>
                <button type="button" className={isStaged ? 'reallocation-remove' : 'reallocation-result-add'} disabled={!order.eligible} aria-pressed={isStaged} onClick={() => setStaged(old => { const next = { ...old }; if (isStaged) delete next[order.orderId]; else next[order.orderId] = order; return next })}>{isStaged ? 'Remove' : order.eligible ? 'Add' : 'Unavailable'}</button>
              </article>
            })}
          </div>
        </div>
        <footer className="reallocation-modal-footer"><span>{stagedOrders.length ? `${stagedOrders.length} selected` : 'Select eligible orders to continue'}</span><div><button type="button" className="reallocation-cancel" onClick={closeModal} disabled={busy === 'import-batch'}>Cancel</button><button type="button" className="primary reallocation-save" onClick={() => void saveStaged()} disabled={!stagedOrders.length || busy === 'import-batch'} aria-busy={busy === 'import-batch'}>{busy === 'import-batch' ? 'Saving…' : `Save${stagedOrders.length ? ` (${stagedOrders.length})` : ''}`}</button></div></footer>
      </section>
    </div>}
  </div>
}
