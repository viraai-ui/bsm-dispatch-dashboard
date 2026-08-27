'use client'

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import styles from './submit-payment.module.css'

type Order = { id: string; salesOrderNumber: string; customerName: string }
type Receipt = { id: string; salesOrderNumber: string; paymentAmount: number; status: 'Pending' }
type Payment = { id: string; date: string; salesOrderNumber: string; customerName: string; paymentMode: string | null; paymentAmount: number | null; status: 'Pending' | 'Payment Received'; hasScreenshot: boolean; proofUrl: string | null }
type Api<T> = { ok: boolean; data?: T; error?: string }
type Capabilities = Record<string, string>
const CAPABILITY_KEY = 'bsm-public-payment-delete-capabilities-v1'
const money = (amount: number | null) => amount == null ? '—' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount)
const date = (value: string) => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value))

function readCapabilities(): Capabilities {
  try { const value = JSON.parse(localStorage.getItem(CAPABILITY_KEY) || '{}'); return value && typeof value === 'object' ? value : {} } catch { return {} }
}

export default function PublicPaymentForm() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [listReady, setListReady] = useState(false)
  const [capabilities, setCapabilities] = useState<Capabilities>({})
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Payment | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [toast, setToast] = useState('')
  const [open, setOpen] = useState(false)
  const [orders, setOrders] = useState<Order[]>([])
  const [token, setToken] = useState('')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Order | null>(null)
  const [amount, setAmount] = useState('')
  const [mode, setMode] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const polling = useRef(false)

  useEffect(() => { setCapabilities(readCapabilities()) }, [])
  // The same short-lived signed session used by submission is CSRF proof for legacy deletion.
  useEffect(() => { void loadForm() }, [])
  useEffect(() => {
    const closeMenus = (event: PointerEvent) => { if (!(event.target as Element).closest('[data-payment-menu]')) setOpenMenu(null) }
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpenMenu(null); if (!deleteBusy) setDeleting(null) } }
    document.addEventListener('pointerdown', closeMenus); document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', closeMenus); document.removeEventListener('keydown', escape) }
  }, [deleteBusy])

  const refreshPayments = useCallback(async () => {
    if (polling.current) return
    polling.current = true
    try {
      const response = await fetch('/api/public/payments', { cache: 'no-store' })
      const json: Api<{ payments: Payment[] }> = await response.json()
      if (!response.ok || !json.data) throw new Error(json.error || 'Could not load payments')
      setPayments(json.data.payments)
    } catch { /* silent polling retry */ }
    finally { polling.current = false; setListReady(true) }
  }, [])

  useEffect(() => {
    void refreshPayments()
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void refreshPayments() }, 5000)
    const focus = () => void refreshPayments()
    window.addEventListener('focus', focus)
    return () => { clearInterval(timer); window.removeEventListener('focus', focus) }
  }, [refreshPayments])

  async function loadForm() {
    setError('')
    try {
      const response = await fetch('/api/public/payments/orders', { cache: 'no-store' })
      const json: Api<{ orders: Order[]; submissionToken: string }> = await response.json()
      if (!response.ok || !json.data) throw new Error(json.error || 'Could not load open sales orders')
      setOrders(json.data.orders); setToken(json.data.submissionToken)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load form') }
  }
  useEffect(() => { if (open && !token) void loadForm() }, [open, token])
  const matches = useMemo(() => {
    const needle = query.toLowerCase().trim()
    return orders.filter((order) => !needle || `${order.salesOrderNumber} ${order.customerName}`.toLowerCase().includes(needle)).slice(0, 8)
  }, [orders, query])
  function choose(order: Order) { setSelected(order); setQuery(order.salesOrderNumber); setError('') }
  function close() { if (!busy) { setOpen(false); setReceipt(null); setError('') } }
  function again() { setReceipt(null); setQuery(''); setSelected(null); setAmount(''); setMode(''); setFile(null); setToken(''); void loadForm() }

  async function submit(event: FormEvent) {
    event.preventDefault(); setError('')
    if (!selected || query !== selected.salesOrderNumber) return setError('Select a sales order from the suggestions.')
    if (!/^\d{1,10}(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) return setError('Enter a valid amount with up to 2 decimal places.')
    if (!mode) return setError('Select a payment mode.')
    setBusy(true)
    try {
      let screenshotKey = '', screenshotUrl = '', screenshotName = ''
      if (file) {
        const targetResponse = await fetch('/api/public/payments/upload-target', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: file.name, type: file.type, size: file.size, salesOrderNumber: selected.salesOrderNumber, submissionToken: token }) })
        const targetJson: Api<{ key: string; uploadUrl: string; publicUrl: string; uploadContentType: string }> = await targetResponse.json().catch(() => ({} as Api<never>))
        if (!targetResponse.ok || !targetJson.data) throw new Error(targetJson.error || 'Could not prepare screenshot upload')
        const upload = await fetch(targetJson.data.uploadUrl, { method: 'PUT', headers: { 'content-type': targetJson.data.uploadContentType }, body: file }).catch(() => null)
        if (!upload?.ok) throw new Error('Screenshot upload failed. Check your connection and tap Submit Payment to retry.')
        screenshotKey = targetJson.data.key; screenshotUrl = targetJson.data.publicUrl; screenshotName = file.name
      }
      const response = await fetch('/api/public/payments', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID().replaceAll('-', '') }, body: JSON.stringify({ salesOrderId: selected.id, salesOrderNumber: selected.salesOrderNumber, paymentAmount: amount, paymentMode: mode, screenshotKey, screenshotUrl, screenshotName, submissionToken: token, website: '' }) })
      const json: Api<{ receipt: Receipt; deleteToken?: string }> = await response.json()
      if (!response.ok || !json.data) throw new Error(json.error || 'Payment could not be submitted')
      if (json.data.deleteToken) {
        const next = { ...readCapabilities(), [json.data.receipt.id]: json.data.deleteToken }
        localStorage.setItem(CAPABILITY_KEY, JSON.stringify(next)); setCapabilities(next)
      }
      setReceipt(json.data.receipt); await refreshPayments()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Payment could not be submitted') }
    finally { setBusy(false) }
  }

  async function deletePayment() {
    if (!deleting) return
    const capability = capabilities[deleting.id] || ''
    setDeleteBusy(true); setDeleteError('')
    try {
      const sessionToken = token || await fetch('/api/public/payments/orders', { cache: 'no-store' }).then((response) => response.json()).then((json: Api<{ submissionToken: string }>) => json.data?.submissionToken || '')
      const response = await fetch(`/api/public/payments/${encodeURIComponent(deleting.id)}`, { method: 'DELETE', headers: { 'x-payment-delete-token': capability, 'x-public-submission-token': sessionToken } })
      const json: Api<{ deleted: boolean }> = await response.json().catch(() => ({} as Api<never>))
      if (!response.ok) throw new Error(json.error || 'Could not delete payment. Please retry.')
      setPayments((items) => items.filter((item) => item.id !== deleting.id))
      const next = { ...capabilities }; delete next[deleting.id]
      localStorage.setItem(CAPABILITY_KEY, JSON.stringify(next)); setCapabilities(next)
      setOpenMenu(null); setDeleting(null); setToast('Payment deleted')
      window.setTimeout(() => setToast(''), 2400)
    } catch (cause) { setDeleteError(cause instanceof Error ? cause.message : 'Could not delete payment. Please retry.') }
    finally { setDeleteBusy(false) }
  }

  const menu = (payment: Payment) => payment.status === 'Pending' ? <div className={styles.menuWrap} data-payment-menu>
    <button className={styles.menuButton} type="button" aria-label={`Actions for ${payment.salesOrderNumber}`} aria-expanded={openMenu === payment.id} onClick={() => setOpenMenu((id) => id === payment.id ? null : payment.id)}><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></button>
    {openMenu === payment.id && <div className={styles.menu} role="menu"><button type="button" role="menuitem" onClick={() => { setDeleting(payment); setDeleteError(''); setOpenMenu(null) }}>Delete</button></div>}
  </div> : null

  return <main className={styles.shell}>
    <section className={styles.page}>
      <header className={styles.header}><div><div className={styles.brand}><span>BSM</span><small>India</small></div><p className={styles.eyebrow}>Finance</p><h1>Payments</h1><p className={styles.lead}>Submit customer payment proofs and wait for Accounts to confirm receipt.</p></div><button className={styles.add} type="button" onClick={() => setOpen(true)}>+ Add Payment</button></header>
      <section className={styles.listCard} aria-live="polite">
        {listReady && payments.length === 0 ? <div className={styles.empty}><strong>No payments added yet</strong><span>New payment records will appear here.</span></div> : <>
          <div className={styles.tableWrap}><table><thead><tr><th>Date</th><th>Sales Order</th><th>Customer Name</th><th>Mode</th><th>Amount</th><th>Screenshot</th><th>Status</th><th className={styles.actionHead}>Actions</th></tr></thead><tbody>{payments.map((payment) => <tr key={payment.id} className={payment.status === 'Payment Received' ? styles.receivedRow : ''}><td>{date(payment.date)}</td><td><strong>{payment.salesOrderNumber}</strong></td><td>{payment.customerName}</td><td>{payment.paymentMode || '—'}</td><td>{money(payment.paymentAmount)}</td><td>{payment.proofUrl ? <a href={payment.proofUrl} target="_blank" rel="noreferrer">View</a> : '—'}</td><td><span className={payment.status === 'Payment Received' ? styles.received : styles.pending}>{payment.status}</span></td><td className={styles.actionCell}>{menu(payment)}</td></tr>)}</tbody></table></div>
          <div className={styles.mobileList}>{payments.map((payment) => <article key={payment.id} className={payment.status === 'Payment Received' ? styles.receivedCard : styles.mobileCard}><div className={styles.cardTop}><div><small>{date(payment.date)}</small><strong>{payment.salesOrderNumber}</strong></div><div className={styles.mobileTools}><span className={payment.status === 'Payment Received' ? styles.received : styles.pending}>{payment.status}</span>{menu(payment)}</div></div><h2>{payment.customerName}</h2><dl><div><dt>Mode</dt><dd>{payment.paymentMode || '—'}</dd></div><div><dt>Amount</dt><dd>{money(payment.paymentAmount)}</dd></div></dl>{payment.proofUrl && <a className={styles.proof} href={payment.proofUrl} target="_blank" rel="noreferrer">View Screenshot ↗</a>}</article>)}</div>
        </>}
      </section>
    </section>
    {toast && <div className={styles.toast} role="status">✓ {toast}</div>}
    {deleting && <div className={styles.backdrop} role="dialog" aria-modal="true" aria-labelledby="delete-payment-title"><section className={`${styles.modal} ${styles.deleteModal}`}><div className={styles.deleteIcon}>!</div><h2 id="delete-payment-title">Delete payment?</h2><p>This removes the pending submission and its screenshot. This action cannot be undone.</p><dl><div><dt>Sales Order</dt><dd>{deleting.salesOrderNumber}</dd></div><div><dt>Customer</dt><dd>{deleting.customerName}</dd></div><div><dt>Amount</dt><dd>{money(deleting.paymentAmount)}</dd></div></dl>{deleteError && <p className={styles.error} role="alert">{deleteError}</p>}<div className={styles.actions}><button type="button" className={styles.cancel} disabled={deleteBusy} onClick={() => setDeleting(null)}>Cancel</button><button type="button" className={styles.deleteButton} disabled={deleteBusy} onClick={() => void deletePayment()}>{deleteBusy ? 'Deleting…' : 'Delete Payment'}</button></div></section></div>}
    {open && <div className={styles.backdrop} role="dialog" aria-modal="true" aria-labelledby="add-payment-title"><section className={styles.modal}>
      {receipt ? <div className={styles.success}><button className={styles.close} onClick={close} aria-label="Close">×</button><div className={styles.successIcon}>✓</div><h2>Payment submitted</h2><p>Your payment is safely queued for approval.</p><dl><div><dt>Sales Order</dt><dd>{receipt.salesOrderNumber}</dd></div><div><dt>Amount</dt><dd>{money(receipt.paymentAmount)}</dd></div><div><dt>Status</dt><dd><span className={styles.pending}>Pending</span></dd></div></dl><button className={styles.add} onClick={again}>Submit another payment</button></div> : <><header className={styles.modalHead}><div><p className={styles.eyebrow}>New record</p><h2 id="add-payment-title">Add Payment</h2></div><button className={styles.close} type="button" onClick={close} disabled={busy} aria-label="Close">×</button></header><form onSubmit={submit} noValidate>
        <label>Sales Order Number<span>*</span></label><div className={styles.searchWrap}><input value={query} onChange={(e) => { setQuery(e.target.value.toUpperCase()); setSelected(null) }} placeholder="Search SO number or customer" autoComplete="off" required />{query && !selected && matches.length > 0 && <div className={styles.suggestions}>{matches.map((order) => <button type="button" key={order.id} onClick={() => choose(order)}><strong>{order.salesOrderNumber}</strong><small>{order.customerName}</small></button>)}</div>}</div>
        <label>Customer Name</label><div className={`${styles.readonly} ${selected ? styles.filled : ''}`}>{selected?.customerName || 'Filled after selecting a sales order'}</div>
        <label htmlFor="amount">Payment Amount<span>*</span></label><div className={styles.amount}><b>₹</b><input id="amount" type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.00" /></div>
        <label htmlFor="mode">Payment Mode<span>*</span></label><select id="mode" value={mode} onChange={(e) => setMode(e.target.value)}><option value="">Select payment mode</option>{['Bank Transfer', 'UPI', 'Credit Card', 'Debit Card', 'Other'].map((item) => <option key={item}>{item}</option>)}</select>
        <label htmlFor="shot">Payment Screenshot <em>Optional</em></label><label className={styles.upload} htmlFor="shot"><b>{file ? 'Image selected' : 'Add screenshot'}</b><small>{file ? file.name : 'JPEG, PNG, WebP or HEIC · Max 10 MB'}</small></label><input className={styles.file} id="shot" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <input className={styles.trap} name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />{error && <p className={styles.error} role="alert">{error}</p>}<div className={styles.actions}><button type="button" className={styles.cancel} onClick={close}>Cancel</button><button className={styles.add} disabled={busy || !token}>{busy ? 'Submitting…' : 'Submit Payment'}</button></div>
      </form></>}
    </section></div>}
  </main>
}
