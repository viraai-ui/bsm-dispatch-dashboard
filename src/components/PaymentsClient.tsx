'use client'

import { useEffect, useMemo, useState } from 'react'
import type { Payment, PaymentStatus } from '@/lib/payments'

export function PaymentsClient({ initialPayments }: { initialPayments: Payment[] }) {
  type OrderSuggestion = { id: string; salesOrderNumber: string; customerName: string }
  const [payments, setPayments] = useState(initialPayments)
  const [open, setOpen] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [salesOrderNumber, setSalesOrderNumber] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [orders, setOrders] = useState<OrderSuggestion[]>([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [ordersLoaded, setOrdersLoaded] = useState(false)
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [activeSuggestion, setActiveSuggestion] = useState(0)
  const [customerEdited, setCustomerEdited] = useState(false)

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
    if (!customerEdited) setCustomerName(order.customerName)
    setSuggestionsOpen(false)
  }

  function handleOrderKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' && matchingOrders.length) { event.preventDefault(); setSuggestionsOpen(true); setActiveSuggestion((index) => Math.min(index + 1, matchingOrders.length - 1)) }
    else if (event.key === 'ArrowUp' && matchingOrders.length) { event.preventDefault(); setActiveSuggestion((index) => Math.max(index - 1, 0)) }
    else if (event.key === 'Enter' && suggestionsOpen && matchingOrders[activeSuggestion]) { event.preventDefault(); selectOrder(matchingOrders[activeSuggestion]) }
    else if (event.key === 'Escape') setSuggestionsOpen(false)
  }

  async function addPayment(event: React.FormEvent) {
    event.preventDefault()
    if (!file) { setError('Select a payment screenshot.'); return }
    setBusy(true); setError('')
    try {
      const targetResponse = await fetch('/api/payments/upload-target', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: file.name, type: file.type, size: file.size, salesOrderNumber }) })
      const targetJson = await targetResponse.json().catch(() => ({}))
      if (!targetResponse.ok || !targetJson.ok) throw new Error(targetJson.error || 'Could not prepare upload')
      const uploadResponse = await fetch(targetJson.data.uploadUrl, { method: 'PUT', headers: { 'content-type': file.type }, body: file })
      if (!uploadResponse.ok) throw new Error('Screenshot upload failed')
      const response = await fetch('/api/payments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ customerName, salesOrderNumber, screenshotUrl: targetJson.data.publicUrl, screenshotKey: targetJson.data.key, screenshotName: file.name }) })
      const json = await response.json().catch(() => ({}))
      if (!response.ok || !json.ok) throw new Error(json.error || 'Could not add payment')
      setPayments((items) => [json.data.payment, ...items])
      setCustomerName(''); setCustomerEdited(false); setSalesOrderNumber(''); setFile(null); setOpen(false)
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
    <header className="payments-header"><div><p className="eyebrow">Finance</p><h1>Payments</h1><p className="muted">Track customer payment proofs and receipt status.</p></div><button className="btn red" onClick={() => { setError(''); setOpen(true) }}>+ Add Payment</button></header>
    {error && !open && <div className="form-error payments-error">{error}</div>}
    <div className="card payments-card">
      {payments.length === 0 ? <div className="payments-empty"><strong>No payments added yet</strong><span>Payment records will appear here after you upload the first screenshot.</span></div> : <div className="payments-table-wrap"><table className="payments-table"><thead><tr><th>Customer</th><th>Sales Order</th><th>Screenshot</th><th>Added</th><th className="payments-actions-heading">Actions / Status</th></tr></thead><tbody>{payments.map((payment) => <tr key={payment.id}><td data-label="Customer"><strong>{payment.customerName}</strong></td><td data-label="Sales Order">{payment.salesOrderNumber}</td><td data-label="Screenshot"><a className="payment-proof-link" href={payment.screenshotUrl} target="_blank" rel="noreferrer">View screenshot ↗</a></td><td data-label="Added">{new Date(payment.createdAt).toLocaleDateString()}</td><td data-label="Actions / Status" className="payment-status-cell"><select aria-label={`Status for ${payment.customerName}`} className={payment.status === 'Payment Received' ? 'payment-status received' : 'payment-status pending'} value={payment.status} onChange={(event) => void setStatus(payment.id, event.target.value as PaymentStatus)}><option>Pending</option><option>Payment Received</option></select></td></tr>)}</tbody></table></div>}
    </div>
    {open && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="add-payment-title"><section className="order-modal card payment-modal"><div className="modal-head"><div><p className="eyebrow">New record</p><h1 id="add-payment-title">Add Payment</h1></div><button className="drawer-close" type="button" aria-label="Close" disabled={busy} onClick={() => setOpen(false)}>×</button></div><form className="payment-form" onSubmit={addPayment}><label>Customer name<input required autoFocus value={customerName} onChange={(e) => { setCustomerName(e.target.value); setCustomerEdited(true) }} placeholder="Enter customer name" /></label><label>Sales order number<div className="payment-order-combobox"><input required role="combobox" aria-autocomplete="list" aria-expanded={suggestionsOpen} aria-controls="payment-order-options" aria-activedescendant={suggestionsOpen && matchingOrders[activeSuggestion] ? `payment-order-${matchingOrders[activeSuggestion].id}` : undefined} value={salesOrderNumber} onFocus={() => setSuggestionsOpen(true)} onBlur={() => setTimeout(() => setSuggestionsOpen(false), 100)} onKeyDown={handleOrderKeyDown} onChange={(e) => { setSalesOrderNumber(e.target.value); setActiveSuggestion(0); setSuggestionsOpen(true) }} placeholder="Search SO number or customer" />{suggestionsOpen && <div className="payment-order-options" id="payment-order-options" role="listbox">{ordersLoading ? <div className="payment-order-message">Loading open Zoho orders…</div> : matchingOrders.length ? matchingOrders.map((order, index) => <button id={`payment-order-${order.id}`} role="option" aria-selected={index === activeSuggestion} className={index === activeSuggestion ? 'active' : ''} type="button" key={order.id} onMouseDown={(event) => event.preventDefault()} onClick={() => selectOrder(order)}><strong>{order.salesOrderNumber}</strong><span>{order.customerName}</span></button>) : <div className="payment-order-message">No matching open sales orders</div>}</div>}</div><span className="field-help">Only open Zoho sales orders are suggested; you can search by order or customer.</span></label><label>Payment screenshot<input required type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} /><span className="field-help">PNG, JPG or other image, up to 15 MB</span></label>{error && <div className="form-error">{error}</div>}<div className="payment-form-actions"><button type="button" className="btn light" disabled={busy} onClick={() => setOpen(false)}>Cancel</button><button type="submit" className="btn red" disabled={busy}>{busy ? 'Uploading…' : 'Add Payment'}</button></div></form></section></div>}
  </section>
}
