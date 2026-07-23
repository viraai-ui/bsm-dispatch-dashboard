'use client'

import { useMemo, useState } from 'react'
import { jsPDF } from 'jspdf'
import type { Order } from '@/types/domain'

function safeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim() || 'units-labels'
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

export function UnitsGeneratorClient({ orders }: { orders: Order[] }) {
  const sortedOrders = useMemo(() => [...orders].sort((a, b) => b.salesOrderNumber.localeCompare(a.salesOrderNumber)), [orders])
  const [orderId, setOrderId] = useState('')
  const selectedOrder = sortedOrders.find((order) => order.id === orderId) || null
  const [customerName, setCustomerName] = useState('')
  const [address, setAddress] = useState('')
  const [contact, setContact] = useState('')
  const [machineSelect, setMachineSelect] = useState('')
  const [manualMachine, setManualMachine] = useState('')
  const [totalUnits, setTotalUnits] = useState(1)
  const [message, setMessage] = useState('')

  const machineOptions = useMemo(() => uniqueValues(selectedOrder ? [
    ...selectedOrder.machines.map((machine) => machine.itemName),
    ...selectedOrder.lineItems.map((item) => item.itemName),
  ] : []), [selectedOrder])

  const machineName = manualMachine.trim() || machineSelect.trim()

  const handleOrderChange = (nextId: string) => {
    setOrderId(nextId)
    const order = sortedOrders.find((item) => item.id === nextId)
    if (!order) return
    setCustomerName(order.customerName || '')
    setAddress(order.shippingAddress || '')
    setContact(order.customerPhone || '')
    const firstMachine = uniqueValues([...order.machines.map((machine) => machine.itemName), ...order.lineItems.map((item) => item.itemName)])[0] || ''
    setMachineSelect(firstMachine)
    setManualMachine('')
    setMessage('')
  }

  const validate = () => {
    if (!customerName.trim()) return 'Customer name is required.'
    if (!address.trim()) return 'Address is required.'
    if (!machineName) return 'Select a machine/item or write it manually.'
    if (!Number.isFinite(totalUnits) || totalUnits < 1) return 'Total units must be at least 1.'
    if (totalUnits > 200) return 'Please keep one PDF batch under 200 units.'
    return ''
  }

  const generatePdf = () => {
    const error = validate()
    if (error) { setMessage(error); return }
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true })
    const pageW = 297
    const pageH = 210
    for (let index = 1; index <= totalUnits; index += 1) {
      if (index > 1) doc.addPage('a4', 'landscape')
      drawUnitLabel(doc, {
        pageW,
        pageH,
        customerName: customerName.trim(),
        address: address.trim(),
        contact: contact.trim(),
        machineName,
        unitIndex: index,
        totalUnits,
      })
    }
    doc.save(`${safeFileName(selectedOrder?.salesOrderNumber || customerName)}-units-${totalUnits}.pdf`)
    setMessage(`Generated ${totalUnits} A4 landscape page${totalUnits === 1 ? '' : 's'}.`)
  }

  return <section className="units-generator card">
    <div className="units-generator-head">
      <div>
        <span className="eyebrow">Transport labels</span>
        <h1 className="h1">Units Generator</h1>
        <p className="muted">Create numbered A4 landscape stickers for cartons, boxes and transport units.</p>
      </div>
      <button className="btn red" type="button" onClick={generatePdf}>Generate PDF</button>
    </div>

    {message && <div className={message.includes('Generated') ? 'form-success' : 'form-error'}>{message}</div>}

    <div className="units-form-grid">
      <label><span>Sales Order Number</span><select value={orderId} onChange={(event) => handleOrderChange(event.target.value)}><option value="">Manual / Select Sales Order</option>{sortedOrders.map((order) => <option key={order.id} value={order.id}>{order.salesOrderNumber} — {order.customerName}</option>)}</select></label>
      <label><span>Total Units / Boxes</span><input type="number" min="1" max="200" value={totalUnits} onChange={(event) => setTotalUnits(Math.max(1, Number(event.target.value || 1)))} /></label>
      <label><span>Customer Name</span><input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Customer / Receiver name" /></label>
      <label><span>Contact Number</span><input value={contact} onChange={(event) => setContact(event.target.value)} placeholder="Customer contact" /></label>
      <label className="span-2"><span>Address</span><textarea value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Delivery address" rows={3} /></label>
      <label><span>Machine / Item Dropdown</span><select value={machineSelect} onChange={(event) => setMachineSelect(event.target.value)}><option value="">Select machine/item</option>{machineOptions.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
      <label><span>Manual Machine / Item</span><input value={manualMachine} onChange={(event) => setManualMachine(event.target.value)} placeholder="Optional manual override" /></label>
    </div>

    <div className="units-preview-wrap">
      <div className="units-preview-label">
        <span>Preview</span>
        <strong>{Math.max(1, totalUnits) ? `1/${Math.max(1, totalUnits)}` : '1/1'}</strong>
      </div>
      <div className="unit-label-preview">
        <div className="unit-to">To,</div>
        <div className="unit-label-body">
          <h2>{customerName || 'CUSTOMER NAME'}</h2>
          <p>{address || 'Customer address will appear here'}</p>
          <p className="unit-contact">Contact: {contact || '—'}</p>
          <h3>{machineName || 'Machine / Item Name'}</h3>
          <div className="unit-count">1/{Math.max(1, totalUnits)}</div>
          <div className="unit-from"><span>From: Bengal Shoe Machinery Pvt. Ltd.</span><strong>+91 9560603252</strong></div>
        </div>
      </div>
    </div>
  </section>
}

type DrawLabelInput = {
  pageW: number
  pageH: number
  customerName: string
  address: string
  contact: string
  machineName: string
  unitIndex: number
  totalUnits: number
}

function drawUnitLabel(doc: jsPDF, input: DrawLabelInput) {
  const { pageW, pageH, customerName, address, contact, machineName, unitIndex, totalUnits } = input
  doc.setFillColor(255, 255, 255)
  doc.rect(0, 0, pageW, pageH, 'F')
  doc.setDrawColor(10, 10, 10)
  doc.setLineWidth(0.8)
  doc.roundedRect(12, 12, pageW - 24, pageH - 24, 4, 4)

  doc.setTextColor(0, 0, 0)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(18)
  doc.text('To,', 24, 34)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(customerName.length > 34 ? 22 : 27)
  doc.text(customerName.toUpperCase(), pageW / 2, 50, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(15)
  const addressLines = doc.splitTextToSize(address, pageW - 62).slice(0, 4)
  doc.text(addressLines, pageW / 2, 68, { align: 'center', lineHeightFactor: 1.25 })

  doc.setFontSize(14)
  doc.text(`Contact: ${contact || '—'}`, pageW / 2, 96, { align: 'center' })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(machineName.length > 42 ? 22 : 28)
  const machineLines = doc.splitTextToSize(machineName, pageW - 70).slice(0, 2)
  doc.text(machineLines, pageW / 2, 120, { align: 'center', lineHeightFactor: 1.15 })

  doc.setFontSize(34)
  doc.text(`${unitIndex}/${totalUnits}`, pageW / 2, 158, { align: 'center' })

  doc.setLineWidth(0.45)
  doc.line(22, pageH - 36, pageW - 22, pageH - 36)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text('From: Bengal Shoe Machinery Pvt. Ltd.', 24, pageH - 22)
  doc.text('+91 9560603252', pageW - 24, pageH - 22, { align: 'right' })
}
