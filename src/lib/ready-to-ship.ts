import type { MachineUnit, Order } from '@/types/domain'
import { githubReadJson, githubWriteJson } from './workflow-store'
import { readMediaProofStore, type MediaUpload } from './media-proof'

const COMPLETED_PATH = 'data/packaging-completed-store.json'
const TRANSPORTERS_PATH = 'data/transporters-store.json'

type CompletedStore = { completed: Record<string, { completedAt: string; order: Order; machineIds?: string[] }> }

export type ReadyToShipItem = {
  id: string
  orderId: string
  salesOrderNumber: string
  customerName: string
  deliveryDate?: string
  completedAt?: string
  readyAt?: string
  machine: MachineUnit
  videos: MediaUpload[]
}

export type Transporter = {
  id: string
  name: string
  phone: string
  notes?: string
  createdAt: string
}

export type TransporterStore = { transporters: Transporter[] }

export async function listReadyToShipItems() {
  const [{ data: completedStore }, packingStore] = await Promise.all([
    githubReadJson<CompletedStore>(COMPLETED_PATH, { completed: {} }),
    readMediaProofStore('packing'),
  ])
  const items: ReadyToShipItem[] = []
  for (const [orderId, completed] of Object.entries(completedStore.completed || {})) {
    const order = completed.order
    if (!order) continue
    const allowedMachineIds = new Set(completed.machineIds?.length ? completed.machineIds : (order.machines || []).map((machine) => machine.id))
    const record = packingStore.records[orderId]
    if (!record) continue
    for (const machine of order.machines || []) {
      if (!allowedMachineIds.has(machine.id)) continue
      const videos = record.units?.[machine.id]?.videos || []
      if (!videos.length) continue
      const readyAt = videos.reduce((latest, video) => !latest || video.uploadedAt > latest ? video.uploadedAt : latest, '')
      items.push({
        id: `${orderId}-${machine.id}`,
        orderId,
        salesOrderNumber: order.salesOrderNumber,
        customerName: order.customerName,
        deliveryDate: order.deliveryDate,
        completedAt: completed.completedAt,
        readyAt,
        machine,
        videos,
      })
    }
  }
  return items.sort((a, b) => Date.parse(b.readyAt || b.completedAt || '') - Date.parse(a.readyAt || a.completedAt || ''))
}

export async function readTransportersStore() {
  const { data } = await githubReadJson<TransporterStore>(TRANSPORTERS_PATH, { transporters: [] })
  return { transporters: Array.isArray(data.transporters) ? data.transporters : [] }
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
