'use client'

import { useState } from 'react'
import type { Payment, PaymentStatus } from '@/lib/payments'

export function PaymentsClient({ initialPayments }: { initialPayments: Payment[] }) {
  const [payments, setPayments] = useState(initialPayments)
  const [open, setOpen] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [salesOrderNumber, setSalesOrderNumber] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

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
      setCustomerName(''); setSalesOrderNumber(''); setFile(null); setOpen(false)
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
    {open && <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="add-payment-title"><section className="order-modal card payment-modal"><div className="modal-head"><div><p className="eyebrow">New record</p><h1 id="add-payment-title">Add Payment</h1></div><button className="drawer-close" type="button" aria-label="Close" disabled={busy} onClick={() => setOpen(false)}>×</button></div><form className="payment-form" onSubmit={addPayment}><label>Customer name<input required autoFocus value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Enter customer name" /></label><label>Sales order number<input required value={salesOrderNumber} onChange={(e) => setSalesOrderNumber(e.target.value)} placeholder="e.g. SO-12345" /></label><label>Payment screenshot<input required type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} /><span className="field-help">PNG, JPG or other image, up to 15 MB</span></label>{error && <div className="form-error">{error}</div>}<div className="payment-form-actions"><button type="button" className="btn light" disabled={busy} onClick={() => setOpen(false)}>Cancel</button><button type="submit" className="btn red" disabled={busy}>{busy ? 'Uploading…' : 'Add Payment'}</button></div></form></section></div>}
  </section>
}
