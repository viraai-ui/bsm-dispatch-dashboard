'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Payment, PaymentMode, PaymentStatus } from '@/lib/payments'
import type { AppRole } from '@/lib/auth'

type OrderSuggestion = { id: string; salesOrderNumber: string; customerName: string }

const PAYMENT_MODES: PaymentMode[] = ['Bank Transfer', 'UPI', 'Credit Card', 'Debit Card', 'Other']
const formatAmount = (amount?: number) => amount == null ? '—' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount)

export function PaymentsClient({ initialPayments, userRole }: { initialPayments: Payment[]; userRole: AppRole }) {
  const [payments, setPayments] = useState(initialPayments)
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
  const isAdmin = userRole === 'Admin'
  const isAccounts = userRole === 'Accounts'

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
    if (!file) { setError('Select a payment screenshot.'); return }
    setBusy(true); setError('')
    try {
      const targetResponse = await fetch('/api/payments/upload-target', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: file.name, type: file.type, size: file.size, salesOrderNumber }) })
      const targetJson = await targetResponse.json().catch(() => ({}))
      if (!targetResponse.ok || !targetJson.ok) throw new Error(targetJson.error || 'Could not prepare upload')
      const uploadResponse = await fetch(targetJson.data.uploadUrl, { method: 'PUT', headers: { 'content-type': file.type }, body: file })
      if (!uploadResponse.ok) throw new Error('Screenshot upload failed')
      const response = await fetch('/api/payments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ customerName, salesOrderNumber, paymentAmount: amount, paymentMode, screenshotUrl: targetJson.data.publicUrl, screenshotKey: targetJson.data.key, screenshotName: file.name }) })
      const json = await response.json().catch(() => ({}))
      if (!response.ok || !json.ok) throw new Error(json.error || 'Could not add payment')
      setPayments((items) => [json.data.payment, ...items])
      resetForm(); setOpen(false)
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not add payment') }
    finally { setBusy(false) }
  }

  async function setStatus(id: string, status: PaymentStatus) {
    const previous = payments
    setPayments((items) => items.map((item) => item.id === id ? { ...item, status } : item))
    const response = await fetch('/api/payments', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, status }) })
    const json = await response.json().catch(() => ({}))
    if (!response.ok || !json.ok) { setPayments(previous); setError(json.error || 'Could not update status') }
  }

  return <section className="payments-page">
    <header className="payments-header"><div><p className="eyebrow">Finance</p><h1>Payments</h1><p className="muted">Track customer payment proofs and receipt status.</p></div>{isAdmin && <div className="payments-header-actions"><button className="btn light" type="button" disabled={syncing} onClick={() => void syncOpenOrders()} aria-label="Sync open Zoho sales orders">{syncing ? '↻ Syncing…' : '↻ Sync Orders'}</button><button className="btn red" onClick={() => { setError(''); setSyncMessage(''); setOpen(true) }}>+ Add Payment</button></div>}</header>
    {syncMessage && <div className="form-success payments-error">{syncMessage}</div>}
    {error && !open && <div className="form-error payments-error">{error}</div>}
    <div className="card payments-card">
      {payments.length === 0 ? <div className="payments-empty"><strong>No payments added yet</strong><span>Payment records will appear here after you upload the first screenshot.</span></div> : <div className="payments-table-wrap"><table className="payments-table"><thead><tr><th>Customer</th><th>Sales Order</th><th>Amount</th><th>Mode</th><th>Screenshot</th><th>Added</th><th className="payments-actions-heading">Actions / Status</th></tr></thead><tbody>{payments.map((payment) => <tr key={payment.id}><td data-label="Customer"><strong>{payment.customerName}</strong></td><td data-label="Sales Order">{payment.salesOrderNumber}</td><td data-label="Amount">{formatAmount(payment.paymentAmount)}</td><td data-label="Mode">{payment.paymentMode || '—'}</td><td data-label="Screenshot"><a className="payment-proof-link" href={payment.screenshotUrl} target="_blank" rel="noreferrer">View screenshot ↗</a></td><td data-label="Added">{new Date(payment.createdAt).toLocaleDateString()}</td><td data-label="Actions / Status" className="payment-status-cell">{isAccounts && payment.status === 'Pending' ? <button className="btn payment-approve" type="button" onClick={() => void setStatus(payment.id, 'Payment Received')}>Mark Payment Received</button> : <span className={payment.status === 'Payment Received' ? 'payment-status received' : 'payment-status pending'}>{payment.status}</span>}</td></tr>)}</tbody></table></div>}
    </div>
    {isAdmin && open && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="add-payment-title"><section className="order-modal card payment-modal"><div className="modal-head"><div><p className="eyebrow">New record</p><h1 id="add-payment-title">Add Payment</h1></div><button className="drawer-close" type="button" aria-label="Close" disabled={busy} onClick={() => setOpen(false)}>×</button></div>
      <form className="payment-form" onSubmit={addPayment}>
        <label>Sales Order Number<div className="payment-order-combobox"><input required autoFocus role="combobox" autoComplete="off" aria-autocomplete="list" aria-expanded={suggestionsOpen} aria-controls="payment-order-options" aria-activedescendant={suggestionsOpen && matchingOrders[activeSuggestion] ? `payment-order-${matchingOrders[activeSuggestion].id}` : undefined} value={salesOrderNumber} onFocus={() => setSuggestionsOpen(true)} onBlur={() => setTimeout(() => setSuggestionsOpen(false), 100)} onKeyDown={handleOrderKeyDown} onChange={(event) => { setSalesOrderNumber(event.target.value); setSelectedOrderNumber(''); setCustomerName(''); setActiveSuggestion(0); setSuggestionsOpen(true) }} placeholder="Search SO number or customer" />{suggestionsOpen && <div className="payment-order-options" id="payment-order-options" role="listbox">{ordersLoading ? <div className="payment-order-message">Loading open Zoho orders…</div> : matchingOrders.length ? matchingOrders.map((order, index) => <button id={`payment-order-${order.id}`} role="option" aria-selected={index === activeSuggestion} className={index === activeSuggestion ? 'active' : ''} type="button" key={order.id} onMouseDown={(event) => event.preventDefault()} onClick={() => selectOrder(order)}><strong>{order.salesOrderNumber}</strong><span>{order.customerName}</span></button>) : <div className="payment-order-message">No matching open sales orders</div>}</div>}</div></label>
        <label>Customer Name<input required readOnly value={customerName} placeholder="Filled after selecting a sales order" /></label>
        <label>Payment Amount (₹)<input required type="number" min="0.01" step="0.01" inputMode="decimal" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} placeholder="Enter payment amount" /></label>
        <label>Payment Mode<select required value={paymentMode} onChange={(event) => setPaymentMode(event.target.value as PaymentMode)}>{PAYMENT_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}</select></label>
        <label>Payment Screenshot<input required type="file" accept="image/png,image/jpeg,image/webp,image/heic,image/heif" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions"><button className="btn" type="button" disabled={busy} onClick={() => setOpen(false)}>Cancel</button><button className="btn red" type="submit" disabled={busy}>{busy ? 'Uploading…' : 'Submit Payment'}</button></div>
      </form>
    </section></div>}
  </section>
}
