import type { MachineUnit, Order } from '@/types/domain'
import { githubReadJson, githubWriteJson } from './workflow-store'
import { readMediaProofStore, type MediaUpload } from './media-proof'
import { interaktConfigured, sendInteraktTemplate } from './interakt'

const COMPLETED_PATH = 'data/packaging-completed-store.json'
const TRANSPORTERS_PATH = 'data/transporters-store.json'
const SHIPMENTS_PATH = 'data/ready-to-ship-store.json'

type CompletedStore = { completed: Record<string, { completedAt: string; order: Order; machineIds?: string[] }> }

export type ReadyToShipItem = {
  id: string
  orderId: string
  salesOrderNumber: string
  customerName: string
  customerPhone?: string
  shippingAddress?: string
  salesperson?: string
  deliveryDate?: string
  completedAt?: string
  readyAt?: string
  machine: MachineUnit
  machines: MachineUnit[]
  videos: MediaUpload[]
  packingVideoUploaded: boolean
  shipment?: ShipmentRecord
}

export type Transporter = {
  id: string
  name: string
  phone: string
  notes?: string
  createdAt: string
}

export type ShipmentMessageStatus = 'not_configured' | 'sent' | 'failed' | 'skipped'
export type ShipmentRecord = {
  id: string
  itemId: string
  orderId: string
  machineId: string
  salesOrderNumber: string
  customerName: string
  customerPhone?: string
  salespersonName?: string
  salespersonPhone?: string
  transporterName: string
  transporterPhone?: string
  vehicleNumber: string
  driverName: string
  driverPhone: string
  expectedDelivery?: string
  notes?: string
  shippedAt: string
  messages: {
    customer: { status: ShipmentMessageStatus; phone?: string; error?: string; responseId?: string }
    salesperson: { status: ShipmentMessageStatus; phone?: string; error?: string; responseId?: string }
  }
}

export type TransporterStore = { transporters: Transporter[] }
export type ShipmentStore = { shipments: Record<string, ShipmentRecord> }

export async function listReadyToShipItems() {
  const [{ data: completedStore }, packingStore, shipmentStore] = await Promise.all([
    githubReadJson<CompletedStore>(COMPLETED_PATH, { completed: {} }),
    readMediaProofStore('packing'),
    readShipmentStore(),
  ])
  const items: ReadyToShipItem[] = []
  for (const [orderId, completed] of Object.entries(completedStore.completed || {})) {
    const order = completed.order
    if (!order) continue
    const allowedMachineIds = new Set(completed.machineIds?.length ? completed.machineIds : (order.machines || []).map((machine) => machine.id))
    const record = packingStore.records[orderId]
    const machines = (order.machines || []).filter((machine) => allowedMachineIds.has(machine.id))
    if (!machines.length) continue
    const videos = machines.flatMap((machine) => record?.units?.[machine.id]?.videos || [])
    const id = orderId
    const readyAt = videos.reduce((latest, video) => !latest || video.uploadedAt > latest ? video.uploadedAt : latest, completed.completedAt || '')
    items.push({
      id,
      orderId,
      salesOrderNumber: order.salesOrderNumber,
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      shippingAddress: order.shippingAddress,
      salesperson: order.salesperson,
      deliveryDate: order.deliveryDate,
      completedAt: completed.completedAt,
      readyAt,
      machine: machines[0],
      machines,
      videos,
      packingVideoUploaded: videos.length > 0 || Boolean(record?.submittedAt),
      shipment: shipmentStore.shipments[id],
    })
  }
  return items.sort((a, b) => Date.parse(b.shipment?.shippedAt || b.readyAt || b.completedAt || '') - Date.parse(a.shipment?.shippedAt || a.readyAt || a.completedAt || ''))
}

export async function readTransportersStore() {
  const { data } = await githubReadJson<TransporterStore>(TRANSPORTERS_PATH, { transporters: [] })
  return { transporters: Array.isArray(data.transporters) ? data.transporters : [] }
}

export async function readShipmentStore() {
  const { data } = await githubReadJson<ShipmentStore>(SHIPMENTS_PATH, { shipments: {} })
  return { shipments: data.shipments || {} }
}

export async function addTransporter(input: { name: string; phone: string; notes?: string }) {
  const name = input.name.trim()
  const phone = input.phone.trim()
  if (!name) throw new Error('Transporter name is required')
  if (!phone) throw new Error('Transporter phone is required')
  const store = await readTransportersStore()
  const transporter: Transporter = {
    id: `tr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name,
    phone,
    notes: input.notes?.trim() || '',
    createdAt: new Date().toISOString(),
  }
  store.transporters = [transporter, ...store.transporters]
  await githubWriteJson(TRANSPORTERS_PATH, store, `Add transporter ${name}`)
  return transporter
}

export async function deleteTransporter(id: string) {
  const store = await readTransportersStore()
  const before = store.transporters.length
  store.transporters = store.transporters.filter((item) => item.id !== id)
  if (store.transporters.length === before) throw new Error('Transporter not found')
  await githubWriteJson(TRANSPORTERS_PATH, store, 'Delete transporter')
  return store
}

export async function processShipment(input: {
  itemId: string
  vehicleNumber: string
  driverName: string
  driverPhone: string
  transporterName: string
  transporterPhone?: string
  expectedDelivery?: string
  notes?: string
  customerPhone?: string
  salespersonName?: string
  salespersonPhone?: string
  sendWhatsapp?: boolean
}) {
  const item = (await listReadyToShipItems()).find((entry) => entry.id === input.itemId)
  if (!item) throw new Error('Ready to Ship machine not found')
  const vehicleNumber = input.vehicleNumber.trim()
  const driverName = input.driverName.trim()
  const driverPhone = input.driverPhone.trim()
  const transporterName = input.transporterName.trim()
  if (!vehicleNumber) throw new Error('Vehicle number is required')
  if (!driverName) throw new Error('Driver name is required')
  if (!driverPhone) throw new Error('Driver phone is required')
  if (!transporterName) throw new Error('Transporter name is required')

  const record: ShipmentRecord = {
    id: `ship-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    itemId: item.id,
    orderId: item.orderId,
    machineId: item.machine.id,
    salesOrderNumber: item.salesOrderNumber,
    customerName: item.customerName,
    customerPhone: input.customerPhone?.trim() || item.customerPhone || '',
    salespersonName: input.salespersonName?.trim() || item.salesperson || '',
    salespersonPhone: input.salespersonPhone?.trim() || '',
    transporterName,
    transporterPhone: input.transporterPhone?.trim() || '',
    vehicleNumber,
    driverName,
    driverPhone,
    expectedDelivery: input.expectedDelivery?.trim() || '',
    notes: input.notes?.trim() || '',
    shippedAt: new Date().toISOString(),
    messages: {
      customer: { status: input.sendWhatsapp ? 'skipped' : 'skipped', phone: input.customerPhone?.trim() || item.customerPhone || '' },
      salesperson: { status: input.sendWhatsapp ? 'skipped' : 'skipped', phone: input.salespersonPhone?.trim() || '' },
    },
  }

  if (input.sendWhatsapp) await sendShipmentMessages(record, item.machines.map((machine) => machine.itemName).join(', ') || item.machine.itemName)

  const store = await readShipmentStore()
  store.shipments[item.id] = record
  await githubWriteJson(SHIPMENTS_PATH, store, `Ship ${item.salesOrderNumber} ${item.machine.itemName}`)
  return record
}

async function sendShipmentMessages(record: ShipmentRecord, machineName: string) {
  if (!interaktConfigured()) {
    record.messages.customer.status = record.customerPhone ? 'not_configured' : 'skipped'
    record.messages.salesperson.status = record.salespersonPhone ? 'not_configured' : 'skipped'
    record.messages.customer.error = record.customerPhone ? 'Interakt environment variables are not configured' : 'Customer phone missing'
    record.messages.salesperson.error = record.salespersonPhone ? 'Interakt environment variables are not configured' : 'Salesperson phone missing'
    return
  }
  const values = [record.customerName, record.salesOrderNumber, machineName, record.vehicleNumber, record.driverName, record.driverPhone, record.expectedDelivery || '—']
  if (record.customerPhone) {
    try {
      const response = await sendInteraktTemplate({ phone: record.customerPhone, templateName: process.env.INTERAKT_DISPATCH_CUSTOMER_TEMPLATE || '', bodyValues: values, callbackData: record.id })
      record.messages.customer = { status: 'sent', phone: record.customerPhone, responseId: response.id }
    } catch (error) {
      record.messages.customer = { status: 'failed', phone: record.customerPhone, error: error instanceof Error ? error.message : 'Customer WhatsApp failed' }
    }
  } else record.messages.customer = { status: 'skipped', error: 'Customer phone missing' }

  if (record.salespersonPhone) {
    try {
      const response = await sendInteraktTemplate({ phone: record.salespersonPhone, templateName: process.env.INTERAKT_DISPATCH_SALESPERSON_TEMPLATE || '', bodyValues: [record.salespersonName || 'Salesperson', record.customerName, record.salesOrderNumber, machineName, record.vehicleNumber, record.driverName, record.driverPhone, record.expectedDelivery || '—'], callbackData: record.id })
      record.messages.salesperson = { status: 'sent', phone: record.salespersonPhone, responseId: response.id }
    } catch (error) {
      record.messages.salesperson = { status: 'failed', phone: record.salespersonPhone, error: error instanceof Error ? error.message : 'Salesperson WhatsApp failed' }
    }
  } else record.messages.salesperson = { status: 'skipped', error: 'Salesperson phone missing' }
}
