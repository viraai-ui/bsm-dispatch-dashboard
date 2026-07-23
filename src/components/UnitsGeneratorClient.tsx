'use client'

import { useEffect, useMemo, useState } from 'react'
import { jsPDF } from 'jspdf'
import type { Order } from '@/types/domain'

function safeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim() || 'units-labels'
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
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
  const selectedOrder = sortedOrders.find((order) => order.salesOrderNumber === salesOrderInput || order.id === salesOrderInput) || null
  const [customerName, setCustomerName] = useState('')
  const [address, setAddress] = useState('')
  const [contact, setContact] = useState('')
  const [machineSelect, setMachineSelect] = useState('')
  const [manualMachine, setManualMachine] = useState('')
  const [totalUnitsInput, setTotalUnitsInput] = useState('1')
  const [unitMachines, setUnitMachines] = useState<string[]>([''])
  const [message, setMessage] = useState('')

  const totalUnits = clampUnits(totalUnitsInput)
  const filteredOrders = useMemo(() => {
    const query = salesOrderInput.trim().toLowerCase()
    return sortedOrders.filter((order) => !query || order.salesOrderNumber.toLowerCase().includes(query) || order.customerName.toLowerCase().includes(query)).slice(0, 12)
  }, [salesOrderInput, sortedOrders])
  const machineOptions = useMemo(() => uniqueValues(selectedOrder ? [
    ...selectedOrder.machines.map((machine) => machine.itemName),
    ...selectedOrder.lineItems.map((item) => item.itemName),
  ] : []), [selectedOrder])
  const defaultMachineName = manualMachine.trim() || machineSelect.trim()

  useEffect(() => {
    setUnitMachines((prev) => Array.from({ length: Math.max(0, totalUnits) }, (_, index) => prev[index] || defaultMachineName || ''))
  }, [totalUnits, defaultMachineName])

  const handleSalesOrderInput = (value: string) => {
    setSalesOrderInput(value)
    setSalesOrderOpen(true)
    const order = sortedOrders.find((item) => item.salesOrderNumber === value || item.id === value)
    if (!order) return
    setCustomerName(order.customerName || '')
    setAddress(order.shippingAddress || '')
    setContact(order.customerPhone || '')
    const firstMachine = uniqueValues([...order.machines.map((machine) => machine.itemName), ...order.lineItems.map((item) => item.itemName)])[0] || ''
    setMachineSelect(firstMachine)
    setManualMachine('')
    setMessage('')
  }

  const chooseSalesOrder = (order: Order) => {
    handleSalesOrderInput(order.salesOrderNumber)
    setSalesOrderOpen(false)
  }

  const fillAllUnits = () => {
    const name = defaultMachineName
    if (!name) { setMessage('Select or type a machine/item first.'); return }
    setUnitMachines(Array.from({ length: totalUnits }, () => name))
    setMessage('Machine/item filled for all units.')
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
    for (let index = 1; index <= totalUnits; index += 1) {
      if (index > 1) doc.addPage('a4', 'landscape')
      drawUnitLabel(doc, {
        pageW,
        pageH,
        customerName: customerName.trim(),
        address: address.trim(),
        contact: contact.trim(),
        machineName: unitMachines[index - 1].trim(),
        unitIndex: index,
        totalUnits,
      })
    }
    doc.save(`${safeFileName(salesOrderInput || customerName)}-units-${totalUnits}.pdf`)
    setMessage(`Downloaded ${totalUnits} A4 landscape page${totalUnits === 1 ? '' : 's'}.`)
  }

  return <section className="units-generator card">
    <div className="units-generator-head">
      <div><h1 className="h1">Units Generator</h1></div>
      <button className="btn red units-primary-action" type="button" onClick={generatePdf}>Generate / Download PDF</button>
    </div>

    {message && <div className={message.includes('Downloaded') || message.includes('filled') ? 'form-success' : 'form-error'}>{message}</div>}

    <div className="units-form-grid">
      <label className="sales-order-combo"><span>Sales Order Number</span><input autoComplete="off" role="combobox" aria-expanded={salesOrderOpen} value={salesOrderInput} onFocus={() => setSalesOrderOpen(true)} onBlur={() => window.setTimeout(() => setSalesOrderOpen(false), 140)} onChange={(event) => handleSalesOrderInput(event.target.value)} placeholder="Type or select sales order" /><button className="sales-order-toggle" type="button" aria-label="Show sales orders" onMouseDown={(event) => event.preventDefault()} onClick={() => setSalesOrderOpen((open) => !open)}>⌄</button>{salesOrderOpen && filteredOrders.length > 0 && <div className="sales-order-dropdown">{filteredOrders.map((order) => <button type="button" key={order.id} onMouseDown={(event) => event.preventDefault()} onClick={() => chooseSalesOrder(order)}><strong>{order.salesOrderNumber}</strong><span>{order.customerName}</span></button>)}</div>}</label>
      <label><span>Total Units / Boxes</span><input inputMode="numeric" pattern="[0-9]*" value={totalUnitsInput} onChange={(event) => setTotalUnitsInput(event.target.value.replace(/[^0-9]/g, ''))} placeholder="Enter units" /></label>
      <label><span>Customer Name</span><input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Customer / Receiver name" /></label>
      <label><span>Contact Number</span><input value={contact} onChange={(event) => setContact(event.target.value)} placeholder="Customer contact" /></label>
      <label className="span-2"><span>Address</span><textarea value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Delivery address" rows={2} /></label>
      <label><span>Machine / Item Dropdown</span><select value={machineSelect} onChange={(event) => setMachineSelect(event.target.value)}><option value="">Select machine/item</option>{machineOptions.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
      <label><span>Manual Machine / Item</span><input value={manualMachine} onChange={(event) => setManualMachine(event.target.value)} placeholder="Manual machine/item" /></label>
    </div>

    <div className="units-table-head"><h2>Unit Level Machine Names</h2><button className="btn light" type="button" onClick={fillAllUnits}>Fill all units</button></div>
    <div className="units-table-wrap">
      <table className="units-table"><thead><tr><th>Unit</th><th>Machine / Item Name</th></tr></thead><tbody>{unitMachines.map((name, index) => <tr key={index}><td>{index + 1}/{Math.max(1, totalUnits)}</td><td><input value={name} onChange={(event) => updateUnitMachine(index, event.target.value)} placeholder={`Machine/item for unit ${index + 1}`} /></td></tr>)}</tbody></table>
    </div>

    <div className="units-preview-wrap">
      <div className="units-preview-label"><span>Preview</span><strong>1/{Math.max(1, totalUnits)}</strong></div>
      <div className="unit-label-preview">
        <div className="unit-to">To,</div>
        <div className="unit-label-body">
          <h2>{customerName || 'CUSTOMER NAME'}</h2>
          <p>{address || 'Customer address will appear here'}</p>
          <p className="unit-contact">Contact: {contact || '—'}</p>
          <h3>{unitMachines[0] || defaultMachineName || 'Machine / Item Name'}</h3>
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

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(34)
  doc.text(`${unitIndex}/${totalUnits}`, pageW / 2, 158, { align: 'center' })

  doc.setLineWidth(0.45)
  doc.line(22, pageH - 36, pageW - 22, pageH - 36)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text('From: Bengal Shoe Machinery Pvt. Ltd.', 24, pageH - 22)
  doc.text('+91 9560603252', pageW - 24, pageH - 22, { align: 'right' })
}
