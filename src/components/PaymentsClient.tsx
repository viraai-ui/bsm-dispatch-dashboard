'use client'

import { useEffect, useMemo, useState } from 'react'
import { sortPayments, type Payment, type PaymentMode, type PaymentStatus } from '@/lib/payments'
import type { AppRole } from '@/lib/auth'

type OrderSuggestion = { id: string; salesOrderNumber: string; customerName: string }

const PAYMENT_MODES: PaymentMode[] = ['Bank Transfer', 'UPI', 'Credit Card', 'Debit Card', 'Other']
const formatAmount = (amount?: number) => amount == null ? '—' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount)
const formatPaymentDate = (date: string) => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(date))

export function PaymentsClient({ initialPayments, userRole }: { initialPayments: Payment[]; userRole: AppRole }) {
  const [payments, setPayments] = useState(() => sortPayments(initialPayments))
  const [open, setOpen] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [salesOrderNumber, setSalesOrderNumber] = useState('')
  const [selectedOrderNumber, setSelectedOrderNumber] = useState('')
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('Bank Transfer')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [orders, setOrders] = useState<OrderSuggestion[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [ordersLoaded, setOrdersLoaded] = useState(false)
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [activeSuggestion, setActiveSuggestion] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')
  const [updatingPaymentId, setUpdatingPaymentId] = useState('')
  const [pushState, setPushState] = useState<'checking' | 'unsupported' | 'prompt' | 'enabled' | 'denied' | 'error'>('checking')
  const [pushBusy, setPushBusy] = useState(false)
  const isAdmin = userRole === 'Admin'
  const isAccounts = userRole === 'Accounts'

  useEffect(() => {
    if (!isAdmin && !isAccounts) return
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) { setPushState('unsupported'); return }
    navigator.serviceWorker.register('/payment-push-sw.js').then((registration) => registration.pushManager.getSubscription()).then((subscription) => {
      if (subscription) setPushState('enabled')
      else if (Notification.permission === 'denied') setPushState('denied')
      else setPushState(localStorage.getItem('payment-push-consent-dismissed') ? 'checking' : 'prompt')
    }).catch(() => setPushState('error'))
  }, [isAdmin, isAccounts])

  async function enablePush() {
    setPushBusy(true); setError('')
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) throw new Error('Notifications are not supported in this browser. On iPhone/iPad, install this site to your Home Screen first.')
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { setPushState(permission === 'denied' ? 'denied' : 'prompt'); localStorage.setItem('payment-push-consent-dismissed', '1'); return }
      const configResponse = await fetch('/api/payments/push-subscription', { cache: 'no-store' })
      const config = await configResponse.json().catch(() => ({}))
      if (!configResponse.ok || !config.ok) throw new Error(config.error || 'Notifications are not configured')
      const registration = await navigator.serviceWorker.ready
      const key = config.data.publicKey.replace(/-/g, '+').replace(/_/g, '/')
      const padding = '='.repeat((4 - key.length % 4) % 4)
      const applicationServerKey = Uint8Array.from(atob(key + padding), (character) => character.charCodeAt(0))
      const subscription = await registration.pushManager.getSubscription() || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
      const response = await fetch('/api/payments/push-subscription', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subscription: subscription.toJSON() }) })
      const json = await response.json().catch(() => ({}))
      if (!response.ok || !json.ok) throw new Error(json.error || 'Could not enable notifications')
      localStorage.removeItem('payment-push-consent-dismissed'); setPushState('enabled')
    } catch (reason) { setPushState('error'); setError(reason instanceof Error ? reason.message : 'Could not enable notifications') }
    finally { setPushBusy(false) }
  }

  useEffect(() => {
    if (!open || ordersLoaded || ordersLoading) return
    setOrdersLoading(true)
    fetch('/api/orders', { cache: 'no-store' })
      .then(async (response) => {
        const json = await response.json().catch(() => ({}))
        if (!response.ok || !json.ok) throw new Error(json.error || 'Could not load open sales orders')
        setOrders(Array.isArray(json.data?.paymentOrderSuggestions) ? json.data.paymentOrderSuggestions : [])
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Could not load open sales orders'))
      .finally(() => { setOrdersLoading(false); setOrdersLoaded(true) })
  }, [open, ordersLoaded, ordersLoading])

  const matchingOrders = useMemo(() => {
    const query = salesOrderNumber.trim().toLowerCase()
    return orders.filter((order) => !query || order.salesOrderNumber.toLowerCase().includes(query) || order.customerName.toLowerCase().includes(query)).slice(0, 50)
  }, [orders, salesOrderNumber])

  function selectOrder(order: OrderSuggestion) {
    setSalesOrderNumber(order.salesOrderNumber)
    setSelectedOrderNumber(order.salesOrderNumber)
    setCustomerName(order.customerName)
    setSuggestionsOpen(false)
  }

  function handleOrderKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' && matchingOrders.length) { event.preventDefault(); setSuggestionsOpen(true); setActiveSuggestion((index) => Math.min(index + 1, matchingOrders.length - 1)) }
    else if (event.key === 'ArrowUp' && matchingOrders.length) { event.preventDefault(); setActiveSuggestion((index) => Math.max(index - 1, 0)) }
    else if (event.key === 'Enter' && suggestionsOpen && matchingOrders[activeSuggestion]) { event.preventDefault(); selectOrder(matchingOrders[activeSuggestion]) }
    else if (event.key === 'Escape') setSuggestionsOpen(false)
  }

  function resetForm() {
    setCustomerName(''); setSalesOrderNumber(''); setSelectedOrderNumber(''); setPaymentAmount(''); setPaymentMode('Bank Transfer'); setFile(null)
  }

  async function syncOpenOrders() {
    setSyncing(true); setError(''); setSyncMessage('')
    try {
      const response = await fetch('/api/orders', { method: 'POST', cache: 'no-store' })
      const json = await response.json().catch(() => ({}))
      if (!response.ok || !json.ok) throw new Error(json.error || 'Could not sync open Zoho sales orders')
      const latest = Array.isArray(json.data?.paymentOrderSuggestions) ? json.data.paymentOrderSuggestions : []
      setOrders(latest); setOrdersLoaded(true); setSelectedOrderNumber(''); setSalesOrderNumber(''); setCustomerName('')
      setSyncMessage(`Synced ${latest.length} open Zoho sales order${latest.length === 1 ? '' : 's'}.`)
      setSuggestionsOpen(open)
    } catch (reason) {
      setOrders([]); setOrdersLoaded(true)
      setError(reason instanceof Error ? reason.message : 'Could not sync open Zoho sales orders')
    } finally { setSyncing(false) }
  }

  async function addPayment(event: React.FormEvent) {
    event.preventDefault()
    const amount = Number(paymentAmount)
    if (!selectedOrderNumber || selectedOrderNumber !== salesOrderNumber) { setError('Select an open sales order from the suggestions.'); return }
    if (!Number.isFinite(amount) || amount <= 0) { setError('Enter a valid payment amount greater than zero.'); return }
    setBusy(true); setError('')
    try {
      let screenshot = {}
      if (file) {
        const targetResponse = await fetch('/api/payments/upload-target', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: file.name, type: file.type, size: file.size, salesOrderNumber }) })
        const targetJson = await targetResponse.json().catch(() => ({}))
        if (!targetResponse.ok || !targetJson.ok) throw new Error(targetJson.error || 'Could not prepare upload')
        const uploadResponse = await fetch(targetJson.data.uploadUrl, { method: 'PUT', headers: { 'content-type': file.type }, body: file })
        if (!uploadResponse.ok) throw new Error('Screenshot upload failed')
        screenshot = { screenshotUrl: targetJson.data.publicUrl, screenshotKey: targetJson.data.key, screenshotName: file.name }
      }
      const response = await fetch('/api/payments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ customerName, salesOrderNumber, paymentAmount: amount, paymentMode, ...screenshot }) })
      const json = await response.json().catch(() => ({}))
      if (!response.ok || !json.ok) throw new Error(json.error || 'Could not add payment')
      setPayments((items) => sortPayments([json.data.payment, ...items]))
      resetForm(); setOpen(false)
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not add payment') }
    finally { setBusy(false) }
  }

  async function setStatus(id: string, status: PaymentStatus) {
    if (!isAdmin && !isAccounts) return
    const previous = payments
    setError(''); setUpdatingPaymentId(id)
    setPayments((items) => sortPayments(items.map((item) => item.id === id ? { ...item, status } : item)))
    try {
      const response = await fetch('/api/payments', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, status }) })
      const json = await response.json().catch(() => ({}))
      if (!response.ok || !json.ok) throw new Error(json.error || 'Could not update status')
      setPayments((items) => sortPayments(items.map((item) => item.id === id ? json.data.payment : item)))
    } catch (reason) {
      setPayments(previous); setError(reason instanceof Error ? reason.message : 'Could not update status')
    } finally { setUpdatingPaymentId('') }
  }

  return <section className="payments-page">
    <header className="payments-header"><div><p className="eyebrow">Finance</p><h1>Payments</h1><p className="muted">Track customer payment proofs and receipt status.</p></div><div className="payments-header-actions"><button className="notification-bell" type="button" disabled={pushBusy || pushState === 'enabled'} onClick={() => void enablePush()} aria-label="Payment notification settings" title={pushState === 'enabled' ? 'Notifications enabled' : 'Enable notifications'}><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg></button>{isAdmin && <><button className="payment-sync-button" type="button" disabled={syncing} onClick={() => void syncOpenOrders()} aria-label="Sync open Zoho sales orders" title={syncing ? 'Syncing open Zoho sales orders' : 'Sync open Zoho sales orders'}><span aria-hidden="true" className={syncing ? 'payment-sync-icon spinning' : 'payment-sync-icon'}>↻</span></button><span className="payment-action-gap" aria-hidden="true" /><button className="btn red" onClick={() => { setError(''); setSyncMessage(''); setOpen(true) }}>+ Add Payment</button></>}</div></header>
    {(isAdmin || isAccounts) && pushState !== 'enabled' && pushState !== 'checking' && <div className="notification-consent"><div><strong>Get new payment alerts</strong><span>{pushState === 'unsupported' ? 'This browser does not support Web Push. On iPhone/iPad, install the site to your Home Screen, then try again.' : pushState === 'denied' ? 'Notifications are blocked. Allow them in your browser settings, then use the bell.' : 'Enable mobile or desktop notifications when a new payment needs approval.'}</span></div>{pushState !== 'unsupported' && pushState !== 'denied' && <button className="btn red" type="button" disabled={pushBusy} onClick={() => void enablePush()}>{pushBusy ? 'Enabling…' : 'Enable notifications'}</button>}<button className="drawer-close" aria-label="Dismiss notification prompt" type="button" onClick={() => { localStorage.setItem('payment-push-consent-dismissed', '1'); setPushState('checking') }}>×</button></div>}
    {syncMessage && <div className="form-success payments-error">{syncMessage}</div>}
    {error && !open && <div className="form-error payments-error">{error}</div>}
    <div className="card payments-card">
      {payments.length === 0 ? <div className="payments-empty"><strong>No payments added yet</strong><span>Payment records will appear here after you add the first record.</span></div> : <><div className="payments-table-wrap"><table className="payments-table"><thead><tr><th>Date</th><th>Sales Order</th><th>Customer Name</th><th>Mode</th><th>Amount</th><th>Screenshot</th><th className="payments-actions-heading"><span>Action / Status</span></th></tr></thead><tbody>{payments.map((payment) => <tr key={payment.id} className={payment.status === 'Payment Received' ? 'payment-row-received' : 'payment-row-pending'}><td>{formatPaymentDate(payment.createdAt)}</td><td>{payment.salesOrderNumber}</td><td>{payment.customerName}</td><td>{payment.paymentMode || '—'}</td><td>{formatAmount(payment.paymentAmount)}</td><td>{payment.screenshotKey || payment.screenshotUrl ? <a className="payment-proof-link" href={payment.screenshotKey ? `/api/r2/view?key=${encodeURIComponent(payment.screenshotKey)}` : payment.screenshotUrl} target="_blank" rel="noreferrer">View</a> : <span className="payment-no-attachment">—</span>}</td><td className="payment-status-cell"><div className="payment-status-control"><select className={`payment-status-select ${payment.status === 'Payment Received' ? 'received' : 'pending'}`} aria-label={`Status for ${payment.salesOrderNumber}`} title="Update payment status" value={payment.status} disabled={updatingPaymentId === payment.id} onChange={(event) => void setStatus(payment.id, event.target.value as PaymentStatus)}><option value="Pending">Pending</option><option value="Payment Received">Payment Received</option></select></div></td></tr>)}</tbody></table></div><div className="payment-mobile-list">{payments.map((payment) => { const proofUrl = payment.screenshotKey ? `/api/r2/view?key=${encodeURIComponent(payment.screenshotKey)}` : payment.screenshotUrl; return <article key={payment.id} className={`payment-mobile-card ${payment.status === 'Payment Received' ? 'received' : 'pending'}`}><div className="payment-mobile-top"><time dateTime={payment.createdAt}>{formatPaymentDate(payment.createdAt)}</time><select className={`payment-mobile-status ${payment.status === 'Payment Received' ? 'received' : 'pending'}`} aria-label={`Status for ${payment.salesOrderNumber}`} value={payment.status} disabled={updatingPaymentId === payment.id} onChange={(event) => void setStatus(payment.id, event.target.value as PaymentStatus)}><option value="Pending">Pending</option><option value="Payment Received">Payment Received</option></select></div><div className="payment-mobile-primary"><h2>{payment.salesOrderNumber}</h2><p>{payment.customerName}</p></div><div className="payment-mobile-details"><span>{payment.paymentMode || 'Mode unavailable'}</span><strong>{formatAmount(payment.paymentAmount)}</strong></div><div className="payment-mobile-footer">{proofUrl ? <a className="payment-mobile-proof" href={proofUrl} target="_blank" rel="noreferrer"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg>View Screenshot</a> : <span className="payment-mobile-no-proof"><span aria-hidden="true">—</span> No screenshot</span>}</div></article> })}</div></>}
    </div>
    {isAdmin && open && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="add-payment-title"><section className="order-modal card payment-modal"><div className="modal-head"><div><p className="eyebrow">New record</p><h1 id="add-payment-title">Add Payment</h1></div><button className="drawer-close" type="button" aria-label="Close" disabled={busy} onClick={() => setOpen(false)}>×</button></div>
      <form className="payment-form" onSubmit={addPayment}>
        <label>Sales Order Number<div className="payment-order-combobox"><input required autoFocus role="combobox" autoComplete="off" aria-autocomplete="list" aria-expanded={suggestionsOpen} aria-controls="payment-order-options" aria-activedescendant={suggestionsOpen && matchingOrders[activeSuggestion] ? `payment-order-${matchingOrders[activeSuggestion].id}` : undefined} value={salesOrderNumber} onFocus={() => setSuggestionsOpen(true)} onBlur={() => setTimeout(() => setSuggestionsOpen(false), 100)} onKeyDown={handleOrderKeyDown} onChange={(event) => { setSalesOrderNumber(event.target.value); setSelectedOrderNumber(''); setCustomerName(''); setActiveSuggestion(0); setSuggestionsOpen(true) }} placeholder="Search SO number or customer" />{suggestionsOpen && <div className="payment-order-options" id="payment-order-options" role="listbox">{ordersLoading ? <div className="payment-order-message">Loading open Zoho orders…</div> : matchingOrders.length ? matchingOrders.map((order, index) => <button id={`payment-order-${order.id}`} role="option" aria-selected={index === activeSuggestion} className={index === activeSuggestion ? 'active' : ''} type="button" key={order.id} onMouseDown={(event) => event.preventDefault()} onClick={() => selectOrder(order)}><strong>{order.salesOrderNumber}</strong><span>{order.customerName}</span></button>) : <div className="payment-order-message">No matching open sales orders</div>}</div>}</div></label>
        <label>Customer Name<input required readOnly value={customerName} placeholder="Filled after selecting a sales order" /></label>
        <label>Payment Amount (₹)<input required type="text" inputMode="decimal" pattern="[0-9]+(?:\.[0-9]{1,2})?" value={paymentAmount} onChange={(event) => { const nextAmount = event.target.value; if (/^\d*(?:\.\d{0,2})?$/.test(nextAmount)) setPaymentAmount(nextAmount) }} placeholder="Enter payment amount" /></label>
        <label>Payment Mode<select required value={paymentMode} onChange={(event) => setPaymentMode(event.target.value as PaymentMode)}>{PAYMENT_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}</select></label>
        <label><span className="payment-field-label">Payment Screenshot <span className="field-help">(optional)</span></span><input type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions"><button className="btn" type="button" disabled={busy} onClick={() => setOpen(false)}>Cancel</button><button className="btn red" type="submit" disabled={busy}>{busy ? 'Uploading…' : 'Submit Payment'}</button></div>
      </form>
    </section></div>}
  </section>
}
