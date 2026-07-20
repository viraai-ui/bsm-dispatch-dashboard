import { apiOk } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { githubReadJson, githubWriteJson, listProcessedOrders, upsertOrderWorkflow, type MachineWorkflow } from '@/lib/workflow-store'
import { readSyncedOrdersStore } from '@/lib/synced-orders'
import type { MachineUnit, Order, OrderLineItem } from '@/types/domain'

type CompletedStore = { completed: Record<string, { completedAt: string; order: Order; machineIds?: string[] }> }
const COMPLETED_PATH = 'data/packaging-completed-store.json'

export async function GET() {
  const auth = await requireUser(['Admin', 'Operations', 'Dispatch'])
  if (!auth.ok) return auth.response
  const processed = await listProcessedOrders()
  const synced = await readSyncedOrdersStore()
  const { data: completed } = await githubReadJson<CompletedStore>(COMPLETED_PATH, { completed: {} })
  const orders = processed
    .filter((item) => Boolean(item.processedOrder))
    .map((item) => {
      const processedIds = new Set(Object.values(item.machines || {}).filter((machine) => machine.processedAt && !machine.dispatchedAt).map((machine) => machine.machineUnitId))
      const order = enrichDescriptions(item.processedOrder as Order, synced.orders[item.salesOrderId], item.machines || {})
      return { ...order, machines: order.machines.filter((machine) => processedIds.has(machine.id)), dispatchPriority: item.dispatchPriority || 'regular' }
    })
    .filter((order) => order.machines.length > 0)
  return apiOk({ orders, completedCount: Object.keys(completed.completed).length })
}

export async function POST(request: Request) {
  const auth = await requireUser(['Admin', 'Operations', 'Dispatch'])
  if (!auth.ok) return auth.response
  const body = await request.json()
  const order = body.order as Order
  if (!order?.id) return Response.json({ ok: false, error: 'Missing order' }, { status: 400 })
  const completedAt = new Date().toISOString()
  const machineIds = selectedMachineIds(order, body.machineIds)
  if (!machineIds.length) return Response.json({ ok: false, error: 'Missing machine units' }, { status: 400 })
  const { data: completed } = await githubReadJson<CompletedStore>(COMPLETED_PATH, { completed: {} })
  const existingIds = new Set(completed.completed[order.id]?.machineIds || [])
  machineIds.forEach((id) => existingIds.add(id))
  completed.completed[order.id] = { completedAt, order: { ...order, machines: mergeCompletedMachines(completed.completed[order.id]?.order?.machines, order.machines) }, machineIds: [...existingIds] }
  await githubWriteJson(COMPLETED_PATH, completed, 'Mark packaging completed')
  await upsertOrderWorkflow(order.id, (current) => {
    const machines = { ...(current?.machines || {}) }
    for (const machineId of machineIds) if (machines[machineId]) machines[machineId] = { ...machines[machineId], dispatchedAt: completedAt }
    const processedOrder = current?.processedOrder || order
    return current ? { ...current, machines, processedOrder } : { salesOrderId: order.id, salesOrderNumber: order.salesOrderNumber, status: 'processed', processedOrder, machines }
  })
  return apiOk({ completedAt, machineIds })
}

function selectedMachineIds(order: Order, ids?: string[]) {
  const requested = new Set((ids || []).filter(Boolean))
  const source = requested.size ? order.machines.filter((machine) => requested.has(machine.id)) : order.machines
  return source.map((machine) => machine.id)
}

function mergeCompletedMachines(existing: MachineUnit[] = [], next: MachineUnit[] = []) {
  const byId = new Map(existing.map((machine) => [machine.id, machine]))
  for (const machine of next) byId.set(machine.id, machine)
  return [...byId.values()]
}

function enrichDescriptions(order: Order, synced?: Order, workflowMachines: Record<string, MachineWorkflow> = {}): Order {
  if (!synced) return order
  const lineDescriptions = new Map((synced.lineItems || []).map((item) => [item.id, item.description || '']))
  const liveMachines = new Map((synced.machines || []).map((machine) => [machine.id, machine]))
  return {
    ...order,
    lineItems: mergeLineItemDescriptions(order.lineItems || [], synced.lineItems || []),
    machines: (order.machines || []).map((machine) => {
      const live = liveMachines.get(machine.id)
      const saved = workflowMachines[machine.id]
      return { ...machine, itemDescription: machine.itemDescription || live?.itemDescription || lineDescriptions.get(machine.lineItemId) || '', dispatchNote: saved?.dispatchNote || machine.dispatchNote || '' }
    }),
  }
}

function mergeLineItemDescriptions(current: OrderLineItem[], synced: OrderLineItem[]) {
  const syncedById = new Map(synced.map((item) => [item.id, item]))
  return current.map((item) => ({ ...item, description: item.description || syncedById.get(item.id)?.description || '' }))
}
