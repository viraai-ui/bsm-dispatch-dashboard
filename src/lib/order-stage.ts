import type { Order } from '@/types/domain'
import { githubReadJson, githubWriteJson, type OrderWorkflow } from './workflow-store'
import { readMediaProofStore } from './media-proof'

export type OrderStage = 'open' | 'processed' | 'packed' | 'media_uploaded' | 'partially_dispatched' | 'dispatched' | 'closed'
export type DispatchStore = { dispatched: Record<string, { dispatchedAt: string; order: Order }> }
export type CompletedStore = { completed: Record<string, { completedAt: string; order: Order; machineIds?: string[] }> }

const COMPLETED_PATH = 'data/packaging-completed-store.json'
const DISPATCH_PATH = 'data/dispatch-store.json'

export async function readCompletedStore() {
  const { data } = await githubReadJson<CompletedStore>(COMPLETED_PATH, { completed: {} })
  return { completed: data.completed || {} }
}

export async function readDispatchStore() {
  const { data } = await githubReadJson<DispatchStore>(DISPATCH_PATH, { dispatched: {} })
  return { dispatched: data.dispatched || {} }
}

export async function buildStageMap(workflows: Record<string, OrderWorkflow> = {}) {
  const completed = await readCompletedStore()
  const media = await readMediaProofStore()
  const dispatch = await readDispatchStore()
  const ids = new Set([...Object.keys(workflows), ...Object.keys(completed.completed), ...Object.keys(media.records), ...Object.keys(dispatch.dispatched)])
  const stages: Record<string, OrderStage> = {}
  for (const id of ids) {
    const workflow = workflows[id]
    const totalMachines = workflow?.processedOrder?.machines?.length || completed.completed[id]?.order?.machines?.length || dispatch.dispatched[id]?.order?.machines?.length || 0
    const dispatchedMachineCount = workflow ? Object.values(workflow.machines || {}).filter((machine) => machine.dispatchedAt).length : (completed.completed[id]?.machineIds?.length || 0)
    if (totalMachines > 0 && dispatchedMachineCount >= totalMachines) stages[id] = 'dispatched'
    else if (dispatchedMachineCount > 0) stages[id] = 'partially_dispatched'
    else if (dispatch.dispatched[id]) stages[id] = 'dispatched'
    else if (media.records[id]?.submittedAt) stages[id] = 'media_uploaded'
    else if (completed.completed[id]) stages[id] = 'packed'
    else if (workflow?.status === 'processed' || Object.values(workflow?.machines || {}).some((machine) => machine.processedAt)) stages[id] = 'processed'
    else stages[id] = 'open'
  }
  return stages
}

export async function markDispatched(order: Order) {
  const store = await readDispatchStore()
  store.dispatched[order.id] = { dispatchedAt: new Date().toISOString(), order: { ...order, dashboardStatus: 'Dispatched' } }
  await githubWriteJson(DISPATCH_PATH, store, `Mark ${order.salesOrderNumber} dispatched`)
  return store.dispatched[order.id]
}
