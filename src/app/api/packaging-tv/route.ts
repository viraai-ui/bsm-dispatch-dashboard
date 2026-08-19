import { apiOk } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { githubReadJson, githubWriteJson, listProcessedOrders, upsertOrderWorkflow, type MachineWorkflow } from '@/lib/workflow-store'
import { readSyncedOrdersStore } from '@/lib/synced-orders'
import { isMachineLineItem } from '@/lib/item-classification'
import type { MachineUnit, Order, OrderLineItem } from '@/types/domain'
import { loadOperationalProjection } from '@/lib/operational-orders'

type CompletedStore = { completed: Record<string, { completedAt: string; order: Order; machineIds?: string[] }> }
type PriorityStore = { priorities: Record<string, { priority: 'urgent' | 'regular'; sortOrder?: number; updatedAt: string }> }
const COMPLETED_PATH = 'data/packaging-completed-store.json'
const PRIORITY_PATH = 'data/dispatch-priority-store.json'

export async function GET(request: Request) {
  const auth = await requireUser(['Admin', 'Operations', 'Dispatch'])
  if (!auth.ok) return auth.response
  const [allProcessed, projection] = await Promise.all([listProcessedOrders(), loadOperationalProjection()])
  const processed = allProcessed.filter((item) => projection.byId[item.salesOrderId]?.showInDispatch)
  const synced = await readSyncedOrdersStore()
  const { data: completed } = await githubReadJson<CompletedStore>(COMPLETED_PATH, { completed: {} })
  const { data: priorityStore } = await githubReadJson<PriorityStore>(PRIORITY_PATH, { priorities: {} })
  const orders = processed
    .filter((item) => Boolean(item.processedOrder))
    .map((item) => {
      const processedIds = new Set(Object.values(item.machines || {}).filter((machine) => machine.processedAt && !machine.dispatchedAt).map((machine) => machine.machineUnitId))
      const order = enrichDescriptions(item.processedOrder as Order, synced.orders[item.salesOrderId], item.machines || {})
      const savedPriority = priorityStore.priorities?.[item.salesOrderId]
      return stripInternalVendor({
        ...order,
        machines: order.machines.filter((machine) => processedIds.has(machine.id)),
        dispatchPriority: savedPriority?.priority || item.dispatchPriority || 'regular',
        dispatchSortOrder: savedPriority?.sortOrder ?? item.dispatchSortOrder,
      })
    })
    .filter((order) => !completed.completed[order.id])
    .filter((order) => order.machines.length > 0 || hasDispatchLineItems(order))
  const debug = new URL(request.url).searchParams.get('debug') === '1'
  return apiOk({ orders, completedCount: Object.keys(completed.completed).length, ...(debug ? { debug: { processedCount: processed.length, processed: processed.map((item) => ({ id: item.salesOrderId, so: item.salesOrderNumber, hasProcessedOrder: Boolean(item.processedOrder), machineCount: Object.keys(item.machines || {}).length, pendingMachineCount: Object.values(item.machines || {}).filter((machine) => machine.processedAt && !machine.dispatchedAt).length, completed: Boolean(completed.completed[item.salesOrderId]) })) } } : {}) })
}

export async function POST(request: Request) {
  const auth = await requireUser(['Admin', 'Operations', 'Dispatch'])
  if (!auth.ok) return auth.response
  const body = await request.json()
  if (body.action === 'priority') {
    if (auth.user.role !== 'Admin' && auth.user.role !== 'Operations') return Response.json({ ok: false, error: 'Only Admin and Operations can move orders between dispatch columns' }, { status: 403 })
    const orderId = String(body.orderId || '')
    const priority = body.priority === 'urgent' ? 'urgent' : body.priority === 'regular' ? 'regular' : ''
    if (!orderId || !priority) return Response.json({ ok: false, error: 'Missing priority update' }, { status: 400 })
    const orderedIds: string[] = Array.isArray(body.orderedIds) ? body.orderedIds.map(String).filter(Boolean) : []
    const now = new Date().toISOString()
    const { data: priorityStore } = await githubReadJson<PriorityStore>(PRIORITY_PATH, { priorities: {} })
    const targetIds = orderedIds.length ? orderedIds : [orderId]
    targetIds.forEach((id: string, index: number) => {
      priorityStore.priorities[id] = { priority, sortOrder: index + 1, updatedAt: now }
    })
    await githubWriteJson(PRIORITY_PATH, priorityStore, `Update dispatch priority for ${orderId}`)
    await upsertOrderWorkflow(orderId, (current, store) => {
      if (!current) throw new Error('Order workflow not found')
      targetIds.forEach((id: string, index: number) => {
        if (store.orders[id]) store.orders[id] = { ...store.orders[id], dispatchPriority: priority, dispatchSortOrder: index + 1 }
      })
      return store.orders[orderId]
    })
    return apiOk({ orderId, dispatchPriority: priority, orderedIds })
  }
  if (body.action === 'reorder') {
    if (auth.user.role !== 'Admin' && auth.user.role !== 'Operations') return Response.json({ ok: false, error: 'Only Admin and Operations can reorder dispatch columns' }, { status: 403 })
    const priority = body.priority === 'urgent' ? 'urgent' : body.priority === 'regular' ? 'regular' : ''
    const orderedIds: string[] = Array.isArray(body.orderedIds) ? body.orderedIds.map(String).filter(Boolean) : []
    if (!priority || !orderedIds.length) return Response.json({ ok: false, error: 'Missing dispatch order update' }, { status: 400 })
    const now = new Date().toISOString()
    const { data: priorityStore } = await githubReadJson<PriorityStore>(PRIORITY_PATH, { priorities: {} })
    orderedIds.forEach((id: string, index: number) => {
      priorityStore.priorities[id] = { priority, sortOrder: index + 1, updatedAt: now }
    })
    await githubWriteJson(PRIORITY_PATH, priorityStore, `Reorder ${priority} dispatch column`)
    await upsertOrderWorkflow(orderedIds[0], (current, store) => {
      if (!current) throw new Error('Order workflow not found')
      orderedIds.forEach((id: string, index: number) => {
        if (store.orders[id]) store.orders[id] = { ...store.orders[id], dispatchPriority: priority, dispatchSortOrder: index + 1 }
      })
      return store.orders[orderedIds[0]]
    })
    return apiOk({ priority, orderedIds })
  }
  const order = body.order as Order
  if (!order?.id) return Response.json({ ok: false, error: 'Missing order' }, { status: 400 })
  const completedAt = new Date().toISOString()
  const machineIds = selectedMachineIds(order, body.machineIds)
  const nonMachineOnlyOrder = order.machines.length === 0 && hasDispatchLineItems(order)
  if (!machineIds.length && !nonMachineOnlyOrder) return Response.json({ ok: false, error: 'Missing machine units' }, { status: 400 })
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

function hasDispatchLineItems(order: Order) {
  return (order.lineItems || []).some((item) => item.dispatchCategory !== 'freight' && !isMachineLineItem(item))
}

function mergeCompletedMachines(existing: MachineUnit[] = [], next: MachineUnit[] = []) {
  const byId = new Map(existing.map((machine) => [machine.id, machine]))
  for (const machine of next) byId.set(machine.id, machine)
  return [...byId.values()]
}

function stripInternalVendor<T extends Order>(order: T): T {
  return { ...order, machines: (order.machines || []).map((machine) => ({ ...machine, vendor: undefined })) } as T
}

function enrichDescriptions(order: Order, synced?: Order, workflowMachines: Record<string, MachineWorkflow> = {}): Order {
  if (!synced) return order
  const lineDescriptions = new Map((synced.lineItems || []).map((item) => [item.id, item.description || '']))
  const liveMachines = new Map((synced.machines || []).map((machine) => [machine.id, machine]))
  return {
    ...order,
    salesperson: order.salesperson || synced.salesperson || '—',
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
