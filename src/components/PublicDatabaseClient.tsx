'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PublicDatabaseRow } from '@/lib/public-database-snapshot'

type Result = { items: PublicDatabaseRow[]; page: number; pages: number; total: number; snapshotVersion: string; generatedAt: string }
type Detail = { id: string; salesOrderNumber: string; customerName: string; salesperson: string; shippingAddress: string; deliveryDate: string; warrantyDate: string; status: { lifecycleLabel: string; mediaLabel: string }; machines: Array<{ id: string; itemName: string; serialNumber: string; vendor: string }>; shipment?: Record<string, string>; media: Array<{ id: string; kind: string; name?: string; url: string }>; snapshotVersion: string }
const FILTERS = [['all', 'All records'], ['pending', 'Pending'], ['submitted', 'Media submitted'], ['closed', 'Closed'], ['builty', 'Builty uploaded']] as const

function Icon({ name }: { name: 'search' | 'filter' | 'close' | 'chevron' | 'file' | 'refresh' }) {
  const paths = { search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>, filter: <><path d="M4 6h16M7 12h10M10 18h4"/></>, close: <path d="m6 6 12 12M18 6 6 18"/>, chevron: <path d="m9 18 6-6-6-6"/>, file: <><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v5h5"/></>, refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 9A7 7 0 0 1 18 6l2 3M18 15a7 7 0 0 1-12 3l-2-3"/></> } as const
  return <svg className="pdb-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}

export function PublicDatabaseClient() {
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const [draftFilter, setDraftFilter] = useState('all')
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [data, setData] = useState<Result>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState<Detail>()
  const [selected, setSelected] = useState<PublicDatabaseRow>()
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')
  const seq = useRef(0)
  const searchAbort = useRef<AbortController | undefined>(undefined)
  const dialogRef = useRef<HTMLElement>(null)

  const load = useCallback(async () => {
    const n = ++seq.current
    searchAbort.current?.abort()
    const controller = new AbortController()
    searchAbort.current = controller
    setLoading(true); setError('')
    try {
      const response = await fetch(`/api/public/database/search?q=${encodeURIComponent(q)}&filter=${filter}&page=${page}&limit=25`, { signal: controller.signal })
      if (!response.ok) throw new Error()
      const next = await response.json()
      if (n === seq.current) setData(next)
    } catch (reason) {
      if (n === seq.current && !(reason instanceof DOMException && reason.name === 'AbortError')) setError('Database is temporarily unavailable. Please retry.')
    } finally { if (n === seq.current) setLoading(false) }
  }, [q, filter, page])

  useEffect(() => { const timer = setTimeout(load, 225); return () => { clearTimeout(timer); searchAbort.current?.abort() } }, [load])

  const open = useCallback(async (row: PublicDatabaseRow) => {
    setSelected(row); setDetail(undefined); setDetailError(''); setDetailLoading(true)
    try {
      let response = await fetch(`/api/public/database/orders/${encodeURIComponent(row.id)}?snapshotVersion=${data?.snapshotVersion || ''}`, { cache: 'no-store' })
      if (response.status === 409) { await load(); response = await fetch(`/api/public/database/orders/${encodeURIComponent(row.id)}`, { cache: 'no-store' }) }
      if (!response.ok) throw new Error()
      setDetail(await response.json())
    } catch { setDetailError('Record details could not be loaded.') }
    finally { setDetailLoading(false) }
  }, [data?.snapshotVersion, load])

  const closeDetail = useCallback(() => { setSelected(undefined); setDetail(undefined); setDetailError('') }, [])
  const overlayOpen = Boolean(selected || filtersOpen)
  useEffect(() => {
    if (!overlayOpen) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { if (filtersOpen) setFiltersOpen(false); else closeDetail() } }
    document.addEventListener('keydown', onKey)
    requestAnimationFrame(() => dialogRef.current?.focus())
    return () => { document.body.style.overflow = previous; document.removeEventListener('keydown', onKey) }
  }, [overlayOpen, filtersOpen, closeDetail])

  const updated = data ? new Date(data.generatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''
  return <div className="public-database-view">
    <header className="pdb-mobile-hero">
      <div className="pdb-hero-top"><span className="pdb-eyebrow">Public database</span><span className="pdb-live"><i/>Live snapshot</span></div>
      <h1>Serial Database</h1><p>Find machines, serials and order records.</p>
    </header>

    <section className="card search-panel database-search-panel">
      <div className="database-search-input-wrap"><Icon name="search"/><input aria-label="Search database" placeholder="Search SO, serial, customer or machine" value={q} onChange={event => { setQ(event.target.value); setPage(1) }}/>{q && <button type="button" className="database-clear-x" aria-label="Clear search" onClick={() => setQ('')}><Icon name="close"/></button>}</div>
      <select value={filter} onChange={event => { setFilter(event.target.value); setPage(1) }} aria-label="Filter database records">{FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <button type="button" className="pdb-filter-button" aria-label={`Filters${filter === 'all' ? '' : ', 1 active'}`} onClick={() => { setDraftFilter(filter); setFiltersOpen(true) }}><Icon name="filter"/>{filter !== 'all' && <span>1</span>}</button>
    </section>

    <div className="pdb-announcer" role="status" aria-live="polite">{loading ? 'Searching records' : data ? `${data.total} records found` : ''}</div>
    {error && <section className="card pdb-state"><strong>Unable to load records</strong><p>{error}</p><button className="btn" onClick={load}><Icon name="refresh"/>Retry</button></section>}
    {loading && !data && <SkeletonList/>}

    {data && <section className={`card database-list-card${loading ? ' is-loading' : ''}`}>
      <div className="database-list-head"><div><h2>{q || filter !== 'all' ? 'Search results' : 'All records'}</h2><span className="pdb-result-count">{data.total.toLocaleString('en-IN')} records</span></div><span className="muted">Updated {updated}</span></div>
      {loading ? <SkeletonList embedded/> : <>
        <div className="table-wrap"><table className="table"><thead><tr><th>SO</th><th>Customer</th><th>Units</th><th>Warranty Valid Till</th><th>Media</th><th>Action</th></tr></thead><tbody>{data.items.map(row => <tr key={row.id}><td><strong>{row.salesOrderNumber}</strong></td><td>{row.customerName}{row.builtyUploaded && <small className="database-builty-chip"> Builty Uploaded</small>}</td><td>{row.units}</td><td>{row.warrantyEnd}</td><td>{row.mediaLabel}</td><td><button className="btn light" onClick={() => open(row)}>View</button></td></tr>)}</tbody></table></div>
        <div className="pdb-mobile-cards">{data.items.map(row => <RecordCard key={row.id} row={row} open={open}/>)}</div>
        {!data.items.length && <div className="pdb-empty"><span className="pdb-empty-mark"><Icon name="search"/></span><strong>No matching records</strong><p>Try a different SO, serial, customer or machine.</p>{(q || filter !== 'all') && <button className="btn light" onClick={() => { setQ(''); setFilter('all'); setPage(1) }}>Clear search</button>}</div>}
      </>}
      {!!data.items.length && <nav className="database-pagination" aria-label="Results pages"><button className="btn light" disabled={page <= 1 || loading} onClick={() => { setPage(value => value - 1); scrollTo({ top: 0, behavior: 'smooth' }) }}>Previous</button><span><b>{data.page}</b> of {Math.max(1, data.pages)}</span><button className="btn light" disabled={page >= data.pages || loading} onClick={() => { setPage(value => value + 1); scrollTo({ top: 0, behavior: 'smooth' }) }}>Next</button></nav>}
    </section>}

    {filtersOpen && <div className="pdb-overlay pdb-filter-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setFiltersOpen(false) }}><section ref={dialogRef} tabIndex={-1} className="pdb-filter-sheet" role="dialog" aria-modal="true" aria-labelledby="filter-title"><div className="pdb-handle"/><div className="pdb-sheet-head"><div><span>Refine records</span><h2 id="filter-title">Filters</h2></div><button aria-label="Close filters" onClick={() => setFiltersOpen(false)}><Icon name="close"/></button></div><div className="pdb-filter-options">{FILTERS.map(([value, label]) => <label key={value} className={draftFilter === value ? 'selected' : ''}><span>{label}</span><input type="radio" name="record-filter" value={value} checked={draftFilter === value} onChange={() => setDraftFilter(value)}/><i/></label>)}</div><div className="pdb-sheet-actions"><button className="btn light" onClick={() => setDraftFilter('all')}>Reset</button><button className="btn" onClick={() => { setFilter(draftFilter); setPage(1); setFiltersOpen(false) }}>Apply filter</button></div></section></div>}

    {selected && <div className="pdb-overlay" onMouseDown={event => { if (event.target === event.currentTarget) closeDetail() }}><section ref={dialogRef} tabIndex={-1} className="order-modal card pdb-detail-sheet" role="dialog" aria-modal="true" aria-labelledby="detail-title"><div className="pdb-handle"/><div className="pdb-detail-head"><div><span>Sales order</span><h1 id="detail-title">{detail?.salesOrderNumber || selected.salesOrderNumber}</h1><p>{detail?.customerName || selected.customerName}</p></div><button className="drawer-close" aria-label="Close details" onClick={closeDetail}><Icon name="close"/></button></div><div className="pdb-detail-body">{detailLoading ? <DetailSkeleton/> : detailError ? <div className="pdb-state"><strong>Details unavailable</strong><p>{detailError}</p><button className="btn" onClick={() => open(selected)}><Icon name="refresh"/>Retry</button></div> : detail && <DetailContent detail={detail} retry={() => open(selected)}/>}</div></section></div>}
  </div>
}

function RecordCard({ row, open }: { row: PublicDatabaseRow; open: (row: PublicDatabaseRow) => void }) {
  return <article className="pdb-record-card" tabIndex={0} role="button" aria-label={`View ${row.salesOrderNumber}, ${row.customerName}`} onClick={() => open(row)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(row) } }}><div className="pdb-card-top"><div><span>Sales order</span><h3>{row.salesOrderNumber}</h3></div><StatusBadge label={row.lifecycleLabel}/></div><p className="pdb-customer">{row.customerName}</p><div className="pdb-card-grid"><Info k="Machines / Serials" v={`${row.units} ${row.units === 1 ? 'unit' : 'units'}`}/><Info k="Warranty till" v={row.warrantyEnd || '—'}/></div><div className="pdb-card-foot"><div><StatusBadge label={row.mediaLabel}/>{row.builtyUploaded && <StatusBadge label="Builty uploaded"/>}</div><button tabIndex={-1} aria-hidden="true">View details <Icon name="chevron"/></button></div></article>
}
function StatusBadge({ label }: { label: string }) { const tone = /closed|complete|submitted|uploaded/i.test(label) ? 'green' : /pending|open/i.test(label) ? 'amber' : 'blue'; return <span className={`pdb-status ${tone}`}>{label}</span> }
function Info({ k, v }: { k: string; v: string }) { return <div className="info-tile"><span>{k}</span><strong>{v}</strong></div> }
function SkeletonList({ embedded = false }: { embedded?: boolean }) { return <div className={`pdb-skeleton-list${embedded ? ' embedded' : ''}`} aria-hidden="true">{[1, 2, 3].map(n => <div className="pdb-skeleton-card" key={n}><i/><i/><i/><div><i/><i/></div></div>)}</div> }
function DetailSkeleton() { return <div className="pdb-detail-skeleton" aria-label="Loading record"><i/><i/><div><i/><i/></div><i/><i/></div> }

function DetailContent({ detail, retry }: { detail: Detail; retry: () => void }) {
  return <><section className="pdb-detail-section"><div className="pdb-section-title"><span>01</span><h2>Order details</h2></div><div className="pdb-detail-grid"><Info k="Customer" v={detail.customerName}/><Info k="Salesperson" v={detail.salesperson || '—'}/><Info k="Delivery" v={detail.deliveryDate || '—'}/><Info k="Warranty" v={detail.warrantyDate || '—'}/><div className="info-tile wide"><span>Shipping address</span><strong>{detail.shippingAddress || '—'}</strong></div></div></section><section className="pdb-detail-section"><div className="pdb-section-title"><span>02</span><h2>Machines & serials</h2></div><div className="pdb-machine-list">{detail.machines.map(machine => <div className="pdb-machine" key={machine.id}><div><strong>{machine.itemName}</strong><span>{machine.vendor || 'Vendor not listed'}</span></div><div><span>Serial number</span><strong>{machine.serialNumber || '—'}</strong></div></div>)}</div></section><section className="pdb-detail-section"><div className="pdb-section-title"><span>03</span><h2>Status summary</h2></div><div className="pdb-status-summary"><div><i/><span>Workflow</span><strong>{detail.status.lifecycleLabel}</strong></div><div><i/><span>Media</span><strong>{detail.status.mediaLabel}</strong></div></div></section><section className="pdb-detail-section"><div className="pdb-section-title"><span>04</span><h2>Attachments</h2><small>{detail.media.length}</small></div>{detail.media.length ? <div className="pdb-attachment-list">{detail.media.map(media => <AttachmentRow key={media.id} media={media}/>)}</div> : <div className="pdb-no-attachments"><Icon name="file"/><div><strong>No attachments</strong><span>Nothing has been added to this record.</span></div></div>}<button className="pdb-refresh-record" onClick={retry}><Icon name="refresh"/>Refresh record</button></section></>
}

function AttachmentRow({ media }: { media: Detail['media'][number] }) {
  const type = media.name?.split('.').pop()?.toUpperCase() || 'FILE'
  const label = media.kind === 'builty' ? 'View Builty / LR' : media.kind === 'loading' ? 'View loading video' : 'View packing video'
  return <div className="pdb-attachment"><span className="pdb-file-icon"><Icon name="file"/></span><div><small>{media.kind} · {type}</small><strong>{media.name || `${media.kind} attachment`}</strong></div><a className="btn light" href={media.url} target="_blank" rel="noopener noreferrer">{label}</a></div>
}
