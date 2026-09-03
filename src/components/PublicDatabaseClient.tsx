'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { PublicDatabaseRow } from '@/lib/public-database-snapshot'
import { publicWarrantyInfo } from '@/lib/warranty'

type Result = { items: PublicDatabaseRow[]; page: number; pages: number; total: number; snapshotVersion: string; generatedAt: string }
type Suggestion = { id: string; value: string; salesOrderNumber: string; customerName: string; match: string }
type Detail = { id: string; salesOrderNumber: string; customerName: string; salesperson: string; shippingAddress: string; deliveryDate: string; warrantyDate: string; machines: Array<{ id: string; itemName: string; serialNumber: string; vendor: string }>; shipment?: { shipmentType?: string; transporterName?: string; transporterPhone?: string; vehicleNumber?: string; driverName?: string; driverPhone?: string; expectedDelivery?: string; shippedAt?: string; notes?: string }; media: Array<{ id: string; machineId?: string; kind: 'packing'|'loading'|'builty'; name?: string; url: string }>; snapshotVersion: string }
const FILTERS = [['all', 'All records'], ['pending', 'Pending'], ['submitted', 'Media submitted'], ['closed', 'Closed'], ['builty', 'Builty uploaded']] as const

function Icon({ name }: { name: 'search' | 'filter' | 'close' | 'chevron' | 'file' | 'refresh' }) {
  const paths = { search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>, filter: <><path d="M4 6h16M7 12h10M10 18h4"/></>, close: <path d="m6 6 12 12M18 6 6 18"/>, chevron: <path d="m9 18 6-6-6-6"/>, file: <><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v5h5"/></>, refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 9A7 7 0 0 1 18 6l2 3M18 15a7 7 0 0 1-12 3l-2-3"/></> } as const
  return <svg className="pdb-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}

export function PublicDatabaseClient() {
  const [q, setQ] = useState('')
  const [draftQ, setDraftQ] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [activeSuggestion, setActiveSuggestion] = useState(-1)
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
  const suggestionAbort = useRef<AbortController | undefined>(undefined)
  const dialogRef = useRef<HTMLElement>(null)
  const detailCache = useRef(new Map<string, Detail>())

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
  useEffect(() => { suggestionAbort.current?.abort(); if (!draftQ.trim() || draftQ === q) { setSuggestions([]); setSuggestionsOpen(false); return } const controller=new AbortController(); suggestionAbort.current=controller; const timer=setTimeout(async()=>{try{const response=await fetch(`/api/public/database/search?mode=suggest&q=${encodeURIComponent(draftQ)}`,{signal:controller.signal});if(!response.ok)throw new Error();const value=await response.json();setSuggestions(value.suggestions);setSuggestionsOpen(true);setActiveSuggestion(-1)}catch(reason){if(!(reason instanceof DOMException&&reason.name==='AbortError'))setSuggestions([])}},180);return()=>{clearTimeout(timer);controller.abort()}},[draftQ,q])

  const commitSearch = useCallback((value=draftQ) => { const next=value.trim(); setDraftQ(next); setQ(next); setPage(1); setSuggestionsOpen(false); setActiveSuggestion(-1) }, [draftQ])
  const clearSearch = useCallback(() => { setDraftQ(''); setQ(''); setFilter('all'); setPage(1); setSuggestions([]); setSuggestionsOpen(false) }, [])

  const open = useCallback(async (row: PublicDatabaseRow) => {
    const cached = detailCache.current.get(`${data?.snapshotVersion}:${row.id}`)
    setSelected(row); setDetail(cached); setDetailError(''); setDetailLoading(!cached)
    if (cached) return
    try {
      let response = await fetch(`/api/public/database/orders/${encodeURIComponent(row.id)}?snapshotVersion=${data?.snapshotVersion || ''}`, { cache: 'no-store' })
      if (response.status === 409) { await load(); response = await fetch(`/api/public/database/orders/${encodeURIComponent(row.id)}`, { cache: 'no-store' }) }
      if (!response.ok) throw new Error()
      const value = await response.json() as Detail
      detailCache.current.set(`${value.snapshotVersion}:${row.id}`, value)
      setDetail(value)
    } catch { setDetailError('Record details could not be loaded.') }
    finally { setDetailLoading(false) }
  }, [data?.snapshotVersion, load])

  const prefetch = useCallback((row: PublicDatabaseRow) => {
    const key = `${data?.snapshotVersion}:${row.id}`
    if (detailCache.current.has(key)) return
    fetch(`/api/public/database/orders/${encodeURIComponent(row.id)}?snapshotVersion=${data?.snapshotVersion || ''}`, { cache: 'no-store' }).then(async response => { if (response.ok) detailCache.current.set(key, await response.json()) }).catch(() => {})
  }, [data?.snapshotVersion])

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
    <header className="pdb-mobile-hero pdb-database-hero">
      <div className="pdb-hero-top"><span className="pdb-eyebrow">Public database</span><span className="pdb-live"><i/>Live snapshot</span></div>
      <div className="pdb-hero-copy"><h1>Serial Database</h1><p>Find machines, serials and order records.</p></div>
    </header>

    <section className="card search-panel database-search-panel">
      <div className="database-search-input-wrap"><Icon name="search"/><input role="combobox" aria-autocomplete="list" aria-expanded={suggestionsOpen} aria-controls="pdb-suggestions" aria-activedescendant={activeSuggestion>=0?`pdb-suggestion-${activeSuggestion}`:undefined} aria-label="Search database" placeholder="Search SO, serial, customer or machine" value={draftQ} onChange={event => setDraftQ(event.target.value)} onFocus={()=>{if(suggestions.length)setSuggestionsOpen(true)}} onKeyDown={event=>{if(event.key==='ArrowDown'){event.preventDefault();setSuggestionsOpen(true);setActiveSuggestion(value=>Math.min(value+1,suggestions.length-1))}else if(event.key==='ArrowUp'){event.preventDefault();setActiveSuggestion(value=>Math.max(value-1,0))}else if(event.key==='Escape'){setSuggestionsOpen(false);setActiveSuggestion(-1)}else if(event.key==='Enter'){event.preventDefault();const choice=suggestions[activeSuggestion];commitSearch(choice?.value||draftQ)}}}/>{draftQ && <button type="button" className="database-clear-x" aria-label="Clear search and show all records" onClick={clearSearch}><Icon name="close"/></button>}{suggestionsOpen&&<div id="pdb-suggestions" role="listbox" className="pdb-suggestions">{suggestions.length?suggestions.map((item,index)=><button type="button" role="option" aria-selected={index===activeSuggestion} id={`pdb-suggestion-${index}`} className={index===activeSuggestion?'active':''} key={item.id} onMouseDown={event=>event.preventDefault()} onClick={()=>commitSearch(item.value)}><span><strong>{item.salesOrderNumber}</strong><small>{item.customerName}</small></span>{item.match&&<em>{item.match}</em>}</button>):<span className="pdb-suggestion-empty">No similar records</span>}</div>}</div>
      <select value={filter} onChange={event => { setFilter(event.target.value); setPage(1) }} aria-label="Filter database records">{FILTERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <button type="button" className="pdb-filter-button" aria-label={`Filters${filter === 'all' ? '' : ', 1 active'}`} onClick={() => { setDraftFilter(filter); setFiltersOpen(true) }}><Icon name="filter"/>{filter !== 'all' && <span>1</span>}</button>
    </section>

    <div className="pdb-announcer" role="status" aria-live="polite">{loading ? 'Searching records' : data ? `${data.total} records found` : ''}</div>
    {error && <section className="card pdb-state"><strong>Unable to load records</strong><p>{error}</p><button className="btn" onClick={load}><Icon name="refresh"/>Retry</button></section>}
    {loading && !data && <SkeletonList/>}

    {data && <section className={`card database-list-card${loading ? ' is-loading' : ''}`}>
      <div className="database-list-head"><div><h2>{q || filter !== 'all' ? 'Search results' : 'All records'}</h2><span className="pdb-result-count">{data.total.toLocaleString('en-IN')} records</span>{(q||filter!=='all')&&<button className="pdb-results-clear" aria-label="Clear search and return to all records" onClick={clearSearch}><Icon name="close"/>Clear</button>}</div><span className="muted">Updated {updated}</span></div>
      {loading ? <SkeletonList embedded/> : <>
        <div className="table-wrap pdb-desktop-table"><table className="table"><thead><tr><th>Sales order</th><th>Customer</th><th>Machines</th><th>Warranty Status</th><th>Warranty Valid Till</th><th><span className="sr-only">Open record</span></th></tr></thead><tbody>{data.items.map(row => <tr key={row.id} onMouseEnter={() => prefetch(row)} onFocus={() => prefetch(row)} onClick={() => open(row)}><td><span className="pdb-so-mark">SO</span><strong>{row.salesOrderNumber}</strong></td><td><strong className="pdb-table-customer">{row.customerName}</strong></td><td><strong>{row.units}</strong><small>{row.units === 1 ? 'unit' : 'units'}</small></td><td><WarrantyStatus warrantyDate={row.warrantyDate}/></td><td><strong>{row.warrantyEnd || '—'}</strong></td><td><button className="pdb-row-action" aria-label={`View ${row.salesOrderNumber}`} onClick={event => { event.stopPropagation(); open(row) }}>View <Icon name="chevron"/></button></td></tr>)}</tbody></table></div>
        <div className="pdb-mobile-cards">{data.items.map(row => <RecordCard key={row.id} row={row} open={open}/>)}</div>
        {!data.items.length && <div className="pdb-empty"><span className="pdb-empty-mark"><Icon name="search"/></span><strong>No matching records</strong><p>Try a different SO, serial, customer or machine.</p>{(q || filter !== 'all') && <button className="btn light" onClick={clearSearch}>Clear search</button>}</div>}
      </>}
      {!!data.items.length && <nav className="database-pagination" aria-label="Results pages"><button className="btn light" disabled={page <= 1 || loading} onClick={() => { setPage(value => value - 1); scrollTo({ top: 0, behavior: 'smooth' }) }}>Previous</button><span><b>{data.page}</b> of {Math.max(1, data.pages)}</span><button className="btn light" disabled={page >= data.pages || loading} onClick={() => { setPage(value => value + 1); scrollTo({ top: 0, behavior: 'smooth' }) }}>Next</button></nav>}
    </section>}

    {filtersOpen && <div className="pdb-overlay pdb-filter-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setFiltersOpen(false) }}><section ref={dialogRef} tabIndex={-1} className="pdb-filter-sheet" role="dialog" aria-modal="true" aria-labelledby="filter-title"><div className="pdb-handle"/><div className="pdb-sheet-head"><div><span>Refine records</span><h2 id="filter-title">Filters</h2></div><button aria-label="Close filters" onClick={() => setFiltersOpen(false)}><Icon name="close"/></button></div><div className="pdb-filter-options">{FILTERS.map(([value, label]) => <label key={value} className={draftFilter === value ? 'selected' : ''}><span>{label}</span><input type="radio" name="record-filter" value={value} checked={draftFilter === value} onChange={() => setDraftFilter(value)}/><i/></label>)}</div><div className="pdb-sheet-actions"><button className="btn light" onClick={() => setDraftFilter('all')}>Reset</button><button className="btn" onClick={() => { setFilter(draftFilter); setPage(1); setFiltersOpen(false) }}>Apply filter</button></div></section></div>}

    {selected && <div className="pdb-overlay" onMouseDown={event => { if (event.target === event.currentTarget) closeDetail() }}><section ref={dialogRef} tabIndex={-1} className="order-modal card pdb-detail-sheet" role="dialog" aria-modal="true" aria-labelledby="detail-title"><div className="pdb-handle"/><div className="pdb-detail-head"><div><span>Sales order</span><h1 id="detail-title">{detail?.salesOrderNumber || selected.salesOrderNumber}</h1><p>{detail?.customerName || selected.customerName}</p></div><button className="drawer-close" aria-label="Close details" onClick={closeDetail}><Icon name="close"/></button></div><div className="pdb-detail-body">{detailLoading ? <DetailSkeleton/> : detailError ? <div className="pdb-state"><strong>Details unavailable</strong><p>{detailError}</p><button className="btn" onClick={() => open(selected)}><Icon name="refresh"/>Retry</button></div> : detail && <DetailContent detail={detail} retry={() => open(selected)}/>}</div></section></div>}
  </div>
}

function RecordCard({ row, open }: { row: PublicDatabaseRow; open: (row: PublicDatabaseRow) => void }) {
  return <article className="pdb-record-card" tabIndex={0} role="button" aria-label={`View ${row.salesOrderNumber}, ${row.customerName}`} onClick={() => open(row)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(row) } }}><div className="pdb-card-top"><div><span>Sales order</span><h3>{row.salesOrderNumber}</h3></div></div><p className="pdb-customer">{row.customerName}</p><div className="pdb-card-grid"><Info k="Machines / Serials" v={`${row.units} ${row.units === 1 ? 'unit' : 'units'}`}/><div className="info-tile"><span>Warranty Status</span><WarrantyStatus warrantyDate={row.warrantyDate}/></div><Info k="Warranty Valid Till" v={row.warrantyEnd || '—'}/></div><div className="pdb-card-foot"><span/><button tabIndex={-1} aria-hidden="true">View <Icon name="chevron"/></button></div></article>
}
function WarrantyStatus({ warrantyDate }: { warrantyDate: string }) { const valid = publicWarrantyInfo(warrantyDate).valid; return <span className={`pdb-status ${valid ? 'green' : 'red'}`}>{valid ? 'Warranty Valid' : 'Warranty Void'}</span> }
function Info({ k, v }: { k: string; v: string }) { return <div className="info-tile"><span>{k}</span><strong>{v}</strong></div> }
function SkeletonList({ embedded = false }: { embedded?: boolean }) { return <div className={`pdb-skeleton-list${embedded ? ' embedded' : ''}`} aria-hidden="true">{[1, 2, 3].map(n => <div className="pdb-skeleton-card" key={n}><i/><i/><i/><div><i/><i/></div></div>)}</div> }
function DetailSkeleton() { return <div className="pdb-detail-skeleton" aria-label="Loading record"><i/><i/><div><i/><i/></div><i/><i/></div> }

function DetailContent({ detail, retry }: { detail: Detail; retry: () => void }) {
  const warranty = publicWarrantyInfo(detail.deliveryDate)
  const loading = detail.media.filter(media => media.kind === 'loading')
  const builty = detail.media.filter(media => media.kind === 'builty')
  const shipment = detail.shipment
  return <>
    <section className="pdb-detail-section"><div className="pdb-section-title"><span>01</span><h2>Order details</h2></div><div className="pdb-detail-grid"><Info k="Customer" v={detail.customerName}/><Info k="Salesperson" v={detail.salesperson || '—'}/><div className="info-tile wide"><span>Shipping address</span><strong>{detail.shippingAddress || '—'}</strong></div></div></section>
    <section className={`pdb-warranty-box ${warranty.valid ? 'valid' : 'void'}`}><div><span>Warranty status</span><strong>{warranty.valid ? 'Warranty Valid' : 'Warranty Void'}</strong></div><dl><div><dt>Delivery Date</dt><dd>{warranty.delivery}</dd></div><div><dt>Warranty Valid Till</dt><dd>{warranty.expiry}</dd></div></dl></section>
    <section className="pdb-detail-section"><div className="pdb-section-title"><span>02</span><h2>Machines & packing videos</h2></div><div className="pdb-machine-list">{detail.machines.map(machine => { const packing = detail.media.filter(media => media.kind === 'packing' && media.machineId === machine.id); return <div className="pdb-machine" key={machine.id}><div><strong>{machine.itemName}</strong><span>{machine.vendor || 'Vendor not listed'}</span></div><div><span>Serial number</span><strong>{machine.serialNumber || '—'}</strong></div><div className="pdb-machine-media"><span>Packing Video</span>{packing.length ? packing.map(media => <AttachmentRow key={media.id} media={media}/>) : <em>No packing video</em>}</div></div>})}</div></section>
    <MediaSection number="03" title="Loading Video" media={loading}/>
    <MediaSection number="04" title="Builty / LR" media={builty}/>
    <section className="pdb-detail-section"><div className="pdb-section-title"><span>05</span><h2>Transport Details</h2></div>{shipment ? <div className="pdb-detail-grid"><Info k="Shipment Type" v={shipment.shipmentType === 'transporter' ? 'Transporter' : 'Direct'}/><Info k="Transporter Name" v={shipment.transporterName || '—'}/><Info k="Transporter / Contact Number" v={shipment.transporterPhone || '—'}/><Info k="Vehicle Number" v={shipment.vehicleNumber || '—'}/><Info k="Driver Name" v={shipment.driverName || '—'}/><Info k="Driver Mobile" v={shipment.driverPhone || '—'}/><Info k="Expected Delivery" v={formatPublicDate(shipment.expectedDelivery)}/><Info k="Shipped At" v={formatPublicDate(shipment.shippedAt)}/>{shipment.notes && <div className="info-tile wide"><span>Notes</span><strong>{shipment.notes}</strong></div>}</div> : <p className="muted">Transport details have not been recorded.</p>}<button className="pdb-refresh-record" onClick={retry}><Icon name="refresh"/>Refresh record</button></section>
  </>
}

function MediaSection({ number, title, media }: { number: string; title: string; media: Detail['media'] }) { return <section className="pdb-detail-section"><div className="pdb-section-title"><span>{number}</span><h2>{title}</h2><small>{media.length}</small></div>{media.length ? <div className="pdb-attachment-list">{media.map(item => <AttachmentRow key={item.id} media={item}/>)}</div> : <div className="pdb-no-attachments"><Icon name="file"/><div><strong>Not uploaded</strong><span>No {title.toLowerCase()} is available.</span></div></div>}</section> }

function formatPublicDate(value?: string) { if (!value) return '—'; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) }

function AttachmentRow({ media }: { media: Detail['media'][number] }) {
  const type = media.name?.split('.').pop()?.toUpperCase() || 'FILE'
  const label = media.kind === 'builty' ? 'View Builty / LR' : media.kind === 'loading' ? 'View loading video' : 'View packing video'
  return <div className="pdb-attachment"><span className="pdb-file-icon"><Icon name="file"/></span><div><small>{media.kind} · {type}</small><strong>{media.name || `${media.kind} attachment`}</strong></div><a className="btn light" href={media.url} target="_blank" rel="noopener noreferrer">{label}</a></div>
}
