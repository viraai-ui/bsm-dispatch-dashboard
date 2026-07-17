import type { Order } from '@/types/domain'

export type MachineWorkflow = {
  machineUnitId: string
  lineItemId: string
  serialNumber?: string
  qrCode?: string
  qrToken?: string
  qrStatus: 'pending' | 'generated' | 'not_required'
  qrGeneratedAt?: string
  qrNotRequiredAt?: string
}

export type OrderWorkflow = {
  salesOrderId: string
  salesOrderNumber: string
  status: 'open' | 'partially_generated' | 'qr_generated' | 'qr_not_required' | 'processed'
  processedAt?: string
  dispatchPriority?: 'urgent' | 'regular'
  processedOrder?: Order
  machines: Record<string, MachineWorkflow>
}

type Store = { orders: Record<string, OrderWorkflow>; serialCounter?: number }
const STORE_PATH = 'data/workflow-store.json'
const INITIAL_SERIAL_COUNTER = 262700000

function ghConfig() {
  return {
    token: process.env.GITHUB_TOKEN || '',
    owner: process.env.GITHUB_OWNER || 'viraai-ui',
    repo: process.env.GITHUB_REPO || 'bsm-dispatch-dashboard',
  }
}

export async function githubRequest(path: string, init: RequestInit = {}) {
  const { token, owner, repo } = ghConfig()
  if (!token) throw new Error('Workflow database is not configured')
  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(init.headers || {}) },
    cache: 'no-store',
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.message || 'Workflow database request failed')
  return data
}

export async function githubReadJson<T>(path: string, fallback: T): Promise<{ data: T; sha?: string }> {
  try {
    const data = await githubRequest(`/contents/${path}`)
    const json = Buffer.from(data.content || '', 'base64').toString('utf8')
    return { data: JSON.parse(json || JSON.stringify(fallback)), sha: data.sha }
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message.includes('Not Found') || message.includes('not configured')) return { data: fallback }
    throw error
  }
}

export async function githubWriteJson<T>(path: string, data: T, message: string) {
  const current = await githubReadJson<T>(path, data)
  const body: Record<string, string> = { message, content: Buffer.from(JSON.stringify(data, null, 2)).toString('base64') }
  if (current.sha) body.sha = current.sha
  await githubRequest(`/contents/${path}`, { method: 'PUT', body: JSON.stringify(body) })
}

async function readStoreWithSha(): Promise<{ store: Store; sha?: string }> {
  const result = await githubReadJson<Store>(STORE_PATH, { orders: {}, serialCounter: INITIAL_SERIAL_COUNTER })
  return { store: { serialCounter: INITIAL_SERIAL_COUNTER, ...result.data, orders: result.data.orders || {} }, sha: result.sha }
}

async function writeStore(store: Store, sha?: string) {
  const body: Record<string, string> = { message: 'Update dispatch workflow store', content: Buffer.from(JSON.stringify(store, null, 2)).toString('base64') }
  if (sha) body.sha = sha
  await githubRequest(`/contents/${STORE_PATH}`, { method: 'PUT', body: JSON.stringify(body) })
}

export async function getOrderWorkflow(orderId: string) {
  const { store } = await readStoreWithSha()
  return store.orders[orderId] || null
}

export async function listWorkflows() {
  const { store } = await readStoreWithSha()
  return store.orders || {}
}

export async function listProcessedOrders() {
  const { store } = await readStoreWithSha()
  return Object.values(store.orders).filter((order) => order.status === 'processed')
}

export async function upsertOrderWorkflow(orderId: string, updater: (current: OrderWorkflow | null, store: Store) => OrderWorkflow) {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { store, sha } = await readStoreWithSha()
    const next = updater(store.orders[orderId] || null, store)
    store.orders[orderId] = next
    try {
      await writeStore(store, sha)
      return next
    } catch (error) {
      lastError = error
      const message = error instanceof Error ? error.message : ''
      if (!message.includes('sha') && !message.includes('409') && !message.includes('does not match')) break
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Workflow update conflict')
}

export async function allocateSerialNumbers(orderId: string, machineIds: string[]) {
  const uniqueIds = Array.from(new Set(machineIds.filter(Boolean)))
  if (!uniqueIds.length) return {} as Record<string, string>
  let allocated: Record<string, string> = {}
  await upsertOrderWorkflow(orderId, (current, store) => {
    const machines = { ...(current?.machines || {}) }
    let counter = Math.max(Number(store.serialCounter || INITIAL_SERIAL_COUNTER), INITIAL_SERIAL_COUNTER)
    allocated = {}
    for (const machineUnitId of uniqueIds) {
      const existing = machines[machineUnitId]?.serialNumber
      const serialNumber = existing || String(++counter)
      machines[machineUnitId] = {
        ...machines[machineUnitId],
        machineUnitId,
        lineItemId: machines[machineUnitId]?.lineItemId || '',
        serialNumber,
        qrToken: machines[machineUnitId]?.qrToken || serialNumber,
        qrStatus: machines[machineUnitId]?.qrStatus || 'pending',
      }
      allocated[machineUnitId] = serialNumber
    }
    store.serialCounter = counter
    return current ? { ...current, machines } : { salesOrderId: orderId, salesOrderNumber: '', status: 'open', machines }
  })
  return allocated
}

export function deriveWorkflowStatus(workflow: OrderWorkflow | null, totalMachines: number): OrderWorkflow['status'] {
  if (!workflow) return 'open'
  if (workflow.status === 'processed') return 'processed'
  const machines = Object.values(workflow.machines || {})
  const generated = machines.filter((machine) => machine.qrStatus === 'generated').length
  const notRequired = machines.filter((machine) => machine.qrStatus === 'not_required').length
  if (notRequired && generated === 0) return 'qr_not_required'
  if (totalMachines > 0 && generated >= totalMachines) return 'qr_generated'
  if (generated > 0) return 'partially_generated'
  return 'open'
}
