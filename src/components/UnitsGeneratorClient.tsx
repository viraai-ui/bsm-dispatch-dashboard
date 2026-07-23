'use client'

import { useEffect, useMemo, useState } from 'react'
import { jsPDF } from 'jspdf'
import type { Order } from '@/types/domain'

type LabelSize = 'a4' | 'a5'

function safeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim() || 'units-labels'
}

function clampUnits(value: string) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.min(200, Math.floor(parsed)))
}

export function UnitsGeneratorClient({ orders }: { orders: Order[] }) {
  const sortedOrders = useMemo(() => [...orders].sort((a, b) => b.salesOrderNumber.localeCompare(a.salesOrderNumber)), [orders])
  const [salesOrderInput, setSalesOrderInput] = useState('')
  const [salesOrderOpen, setSalesOrderOpen] = useState(false)
  const [labelSize, setLabelSize] = useState<LabelSize>('a4')
  const [customerName, setCustomerName] = useState('')
  const [address, setAddress] = useState('')
  const [contact, setContact] = useState('')
  const [totalUnitsInput, setTotalUnitsInput] = useState('1')
  const [unitMachines, setUnitMachines] = useState<string[]>([''])
  const [message, setMessage] = useState('')

  const totalUnits = clampUnits(totalUnitsInput)
  const filteredOrders = useMemo(() => {
    const query = salesOrderInput.trim().toLowerCase()
    return sortedOrders.filter((order) => !query || order.salesOrderNumber.toLowerCase().includes(query) || order.customerName.toLowerCase().includes(query)).slice(0, 12)
  }, [salesOrderInput, sortedOrders])

  useEffect(() => {
    setUnitMachines((prev) => Array.from({ length: Math.max(0, totalUnits) }, (_, index) => prev[index] || ''))
  }, [totalUnits])

  const handleSalesOrderInput = (value: string) => {
    setSalesOrderInput(value)
    setSalesOrderOpen(true)
    const order = sortedOrders.find((item) => item.salesOrderNumber === value || item.id === value)
    if (!order) return
    setCustomerName(order.customerName || '')
    setAddress(order.shippingAddress || '')
    setContact(order.customerPhone || '')
    setMessage('')
  }

  const chooseSalesOrder = (order: Order) => {
    handleSalesOrderInput(order.salesOrderNumber)
    setSalesOrderOpen(false)
  }

  const updateUnitMachine = (index: number, value: string) => {
    setUnitMachines((prev) => prev.map((item, itemIndex) => itemIndex === index ? value : item))
  }

  const validate = () => {
    if (!customerName.trim()) return 'Customer name is required.'
    if (!address.trim()) return 'Address is required.'
    if (totalUnits < 1) return 'Total units must be at least 1.'
    if (totalUnits > 200) return 'Please keep one PDF batch under 200 units.'
    if (unitMachines.some((name) => !name.trim())) return 'Machine/item name is required for every unit.'
    return ''
  }

  const generatePdf = () => {
    const error = validate()
    if (error) { setMessage(error); return }
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true })
    const pageW = 297
    const pageH = 210
    const labelsPerPage = labelSize === 'a5' ? 2 : 1
    for (let index = 0; index < totalUnits; index += 1) {
      if (index > 0 && index % labelsPerPage === 0) doc.addPage('a4', 'landscape')
      const slot = labelSize === 'a5' ? index % 2 : 0
      drawUnitLabel(doc, {
        pageW,
        pageH,
        labelSize,
        slot,
        customerName: customerName.trim(),
        address: address.trim(),
        contact: contact.trim(),
        machineName: unitMachines[index].trim(),
        unitIndex: index + 1,
        totalUnits,
      })
    }
    doc.save(`${safeFileName(salesOrderInput || customerName)}-units-${totalUnits}-${labelSize.toUpperCase()}.pdf`)
    setMessage(`Downloaded ${labelSize.toUpperCase()} label PDF.`)
  }

  return <section className="units-generator card">
    <div className="units-generator-head">
      <div><h1 className="h1">Units Generator</h1></div>
      <button className="btn red units-primary-action" type="button" onClick={generatePdf}>Generate / Download PDF</button>
    </div>

    {message && <div className={message.includes('Downloaded') ? 'form-success' : 'form-error'}>{message}</div>}

    <div className="units-form-grid">
      <label className="sales-order-combo"><span>Sales Order Number</span><input autoComplete="off" role="combobox" aria-expanded={salesOrderOpen} value={salesOrderInput} onFocus={() => setSalesOrderOpen(true)} onBlur={() => window.setTimeout(() => setSalesOrderOpen(false), 140)} onChange={(event) => handleSalesOrderInput(event.target.value)} placeholder="Type or select sales order" /><button className="sales-order-toggle" type="button" aria-label="Show sales orders" onMouseDown={(event) => event.preventDefault()} onClick={() => setSalesOrderOpen((open) => !open)}>⌄</button>{salesOrderOpen && filteredOrders.length > 0 && <div className="sales-order-dropdown">{filteredOrders.map((order) => <button type="button" key={order.id} onMouseDown={(event) => event.preventDefault()} onClick={() => chooseSalesOrder(order)}><strong>{order.salesOrderNumber}</strong><span>{order.customerName}</span></button>)}</div>}</label>
      <label><span>Total Units / Boxes</span><input inputMode="numeric" pattern="[0-9]*" value={totalUnitsInput} onChange={(event) => setTotalUnitsInput(event.target.value.replace(/[^0-9]/g, ''))} placeholder="Enter units" /></label>
      <label><span>Label Size</span><select value={labelSize} onChange={(event) => setLabelSize(event.target.value as LabelSize)}><option value="a4">A4 — 1 label per sheet</option><option value="a5">A5 — 2 labels per sheet</option></select></label>
      <label><span>Customer Name</span><input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Customer / Receiver name" /></label>
      <label className="contact-wide"><span>Contact Number</span><input value={contact} onChange={(event) => setContact(event.target.value)} placeholder="Customer contact" /></label>
      <label className="span-2"><span>Address</span><textarea value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Delivery address" rows={2} /></label>
    </div>

    <div className="units-table-head"><h2>Unit Level Machine Names</h2></div>
    <div className="units-table-wrap">
      <table className="units-table"><thead><tr><th>Unit</th><th>Machine / Item Name</th></tr></thead><tbody>{unitMachines.map((name, index) => <tr key={index}><td>{index + 1}/{Math.max(1, totalUnits)}</td><td><input value={name} onChange={(event) => updateUnitMachine(index, event.target.value)} placeholder={`Machine/item for unit ${index + 1}`} /></td></tr>)}</tbody></table>
    </div>

    <div className="units-preview-wrap">
      <div className="units-preview-label"><span>Preview</span><strong>{labelSize.toUpperCase()} · 1/{Math.max(1, totalUnits)}</strong></div>
      <div className={`unit-label-preview ${labelSize === 'a5' ? 'a5-preview' : ''}`}>
        <div className="unit-to">To,</div>
        <div className="unit-label-body">
          <h2>{customerName || 'CUSTOMER NAME'}</h2>
          <p>{address || 'Customer address will appear here'}</p>
          <p className="unit-contact">Contact: {contact || '—'}</p>
          <h3>{unitMachines[0] || 'Machine / Item Name'}</h3>
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
  labelSize: LabelSize
  slot: number
  customerName: string
  address: string
  contact: string
  machineName: string
  unitIndex: number
  totalUnits: number
}

function drawUnitLabel(doc: jsPDF, input: DrawLabelInput) {
  const { pageW, pageH, labelSize, slot, customerName, address, contact, machineName, unitIndex, totalUnits } = input
  const labelX = 0
  const labelY = labelSize === 'a5' ? slot * (pageH / 2) : 0
  const labelW = pageW
  const labelH = labelSize === 'a5' ? pageH / 2 : pageH
  const margin = labelSize === 'a5' ? 7 : 12
  const x = labelX + margin
  const y = labelY + margin
  const w = labelW - margin * 2
  const h = labelH - margin * 2
  const centerX = labelX + labelW / 2

  if (slot === 0 || labelSize === 'a4') {
    doc.setFillColor(255, 255, 255)
    doc.rect(0, 0, pageW, pageH, 'F')
  }
  if (labelSize === 'a5' && slot === 1) {
    doc.setDrawColor(180, 180, 180)
    doc.setLineWidth(0.25)
    doc.line(8, pageH / 2, pageW - 8, pageH / 2)
  }

  doc.setDrawColor(10, 10, 10)
  doc.setLineWidth(0.75)
  doc.roundedRect(x, y, w, h, 4, 4)

  doc.setTextColor(0, 0, 0)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(labelSize === 'a5' ? 11 : 18)
  doc.text('To,', x + 10, y + (labelSize === 'a5' ? 12 : 22))

  const contentTop = y + (labelSize === 'a5' ? 18 : 34)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(labelSize === 'a5' ? (customerName.length > 34 ? 15 : 18) : (customerName.length > 34 ? 27 : 34))
  doc.text(customerName.toUpperCase(), centerX, contentTop, { align: 'center' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(labelSize === 'a5' ? 10.5 : 18)
  const addressLines = doc.splitTextToSize(address, labelW - (labelSize === 'a5' ? 42 : 58)).slice(0, labelSize === 'a5' ? 2 : 4)
  doc.text(addressLines, centerX, contentTop + (labelSize === 'a5' ? 11 : 22), { align: 'center', lineHeightFactor: 1.18 })

  doc.setFontSize(labelSize === 'a5' ? 9.5 : 16)
  doc.text(`Contact: ${contact || '—'}`, centerX, y + h * (labelSize === 'a5' ? 0.48 : 0.45), { align: 'center' })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(labelSize === 'a5' ? (machineName.length > 42 ? 14 : 18) : (machineName.length > 42 ? 27 : 36))
  const machineLines = doc.splitTextToSize(machineName, labelW - (labelSize === 'a5' ? 44 : 66)).slice(0, 2)
  doc.text(machineLines, centerX, y + h * (labelSize === 'a5' ? 0.61 : 0.61), { align: 'center', lineHeightFactor: 1.05 })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(labelSize === 'a5' ? 17 : 36)
  doc.text(`${unitIndex}/${totalUnits}`, centerX, y + h * (labelSize === 'a5' ? 0.77 : 0.79), { align: 'center' })

  const footerY = y + h - (labelSize === 'a5' ? 7 : 15)
  doc.setLineWidth(0.4)
  doc.line(x + 8, footerY - (labelSize === 'a5' ? 6 : 12), x + w - 8, footerY - (labelSize === 'a5' ? 6 : 12))
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(labelSize === 'a5' ? 8.5 : 15)
  doc.text('From: Bengal Shoe Machinery Pvt. Ltd.', x + 10, footerY)
  doc.text('+91 9560603252', x + w - 10, footerY, { align: 'right' })
}
