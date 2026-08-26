'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import styles from './submit-payment.module.css'

type Order = { id: string; salesOrderNumber: string; customerName: string }
type Receipt = { id: string; salesOrderNumber: string; paymentAmount: number; status: 'Pending' }
type Api<T> = { success: boolean; data?: T; error?: string }

export default function PublicPaymentForm() {
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

  async function load() {
    setError('')
    try {
      const response = await fetch('/api/public/payments/orders', { cache: 'no-store' })
      const json: Api<{ orders: Order[]; submissionToken: string }> = await response.json()
      if (!response.ok || !json.data) throw new Error(json.error || 'Could not load open sales orders')
      setOrders(json.data.orders); setToken(json.data.submissionToken)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load form') }
  }
  useEffect(() => { void load() }, [])
  const matches = useMemo(() => {
    const needle = query.toLowerCase().trim()
    if (!needle) return orders.slice(0, 8)
    return orders.filter((order) => `${order.salesOrderNumber} ${order.customerName}`.toLowerCase().includes(needle)).slice(0, 8)
  }, [orders, query])

  function choose(order: Order) { setSelected(order); setQuery(order.salesOrderNumber); setError('') }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('')
    if (!selected || query !== selected.salesOrderNumber) return setError('Select a sales order from the suggestions.')
    if (!/^\d{1,10}(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) return setError('Enter a valid amount with up to 2 decimal places.')
    if (!mode) return setError('Select a payment mode.')
    setBusy(true)
    try {
      let screenshotKey = '', screenshotUrl = '', screenshotName = ''
      if (file) {
        const targetResponse = await fetch('/api/public/payments/upload-target', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: file.name, type: file.type, size: file.size, submissionToken: token }) })
        const targetJson: Api<{ key: string; uploadUrl: string; publicUrl: string }> = await targetResponse.json()
        if (!targetResponse.ok || !targetJson.data) throw new Error(targetJson.error || 'Could not prepare screenshot upload')
        const upload = await fetch(targetJson.data.uploadUrl, { method: 'PUT', headers: { 'content-type': file.type }, body: file })
        if (!upload.ok) throw new Error('Screenshot upload failed. Please try again.')
        screenshotKey = targetJson.data.key; screenshotUrl = targetJson.data.publicUrl; screenshotName = file.name
      }
      const idempotencyKey = crypto.randomUUID().replaceAll('-', '')
      const response = await fetch('/api/public/payments', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey }, body: JSON.stringify({ salesOrderId: selected.id, salesOrderNumber: selected.salesOrderNumber, paymentAmount: amount, paymentMode: mode, screenshotKey, screenshotUrl, screenshotName, submissionToken: token, website: '' }) })
      const json: Api<{ receipt: Receipt }> = await response.json()
      if (!response.ok || !json.data) throw new Error(json.error || 'Payment could not be submitted')
      setReceipt(json.data.receipt)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Payment could not be submitted') } finally { setBusy(false) }
  }
  function again() { setReceipt(null); setQuery(''); setSelected(null); setAmount(''); setMode(''); setFile(null); void load() }

  if (receipt) return <main className={styles.shell}><section className={styles.card} aria-live="polite"><div className={styles.brand}><span>BSM</span><small>India</small></div><div className={styles.successIcon}>✓</div><h1>Payment submitted</h1><p className={styles.lead}>Your payment is safely queued for approval.</p><dl className={styles.receipt}><div><dt>Sales Order</dt><dd>{receipt.salesOrderNumber}</dd></div><div><dt>Amount</dt><dd>₹{receipt.paymentAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</dd></div><div><dt>Confirmation</dt><dd>{receipt.id}</dd></div><div><dt>Status</dt><dd><span className={styles.pending}>Pending</span></dd></div></dl><button className={styles.primary} onClick={again}>Submit another payment</button></section></main>

  return <main className={styles.shell}><section className={styles.card}><header><div className={styles.brand}><span>BSM</span><small>India</small></div><p className={styles.eyebrow}>Secure payment entry</p><h1>Submit a payment</h1><p className={styles.lead}>Add payment details against an open sales order.</p></header><form onSubmit={submit} noValidate>
    <label>Sales Order Number<span>*</span></label><div className={styles.searchWrap}><input value={query} onChange={(e) => { setQuery(e.target.value.toUpperCase()); setSelected(null) }} placeholder="Search SO number or customer" autoComplete="off" required aria-autocomplete="list" />{query && !selected && matches.length > 0 && <div className={styles.suggestions} role="listbox">{matches.map((order) => <button type="button" role="option" key={order.id} onClick={() => choose(order)}><strong>{order.salesOrderNumber}</strong><small>{order.customerName}</small></button>)}</div>}</div>
    <label>Customer Name</label><div className={`${styles.readonly} ${selected ? styles.filled : ''}`}>{selected?.customerName || 'Filled after selecting a sales order'}</div>
    <label htmlFor="amount">Payment Amount<span>*</span></label><div className={styles.amount}><b>₹</b><input id="amount" type="text" inputMode="decimal" pattern="\d+(\.\d{1,2})?" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.00" required /></div>
    <label htmlFor="mode">Payment Mode<span>*</span></label><select id="mode" value={mode} onChange={(e) => setMode(e.target.value)} required><option value="">Select payment mode</option>{['Bank Transfer', 'UPI', 'Credit Card', 'Debit Card', 'Other'].map((item) => <option key={item}>{item}</option>)}</select>
    <label htmlFor="shot">Payment Screenshot <em>Optional</em></label><label className={styles.upload} htmlFor="shot"><b>{file ? 'Image selected' : 'Add screenshot'}</b><small>{file ? file.name : 'JPEG, PNG, WebP or HEIC · Max 10 MB'}</small></label><input className={styles.file} id="shot" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={(e) => setFile(e.target.files?.[0] || null)} />
    <input className={styles.trap} name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />{error && <p className={styles.error} role="alert">{error}</p>}<button className={styles.primary} disabled={busy || !token}>{busy ? 'Submitting…' : 'Submit payment'}</button><p className={styles.secure}>🔒 Secure submission · Details go directly to BSM Accounts</p>
  </form></section></main>
}
