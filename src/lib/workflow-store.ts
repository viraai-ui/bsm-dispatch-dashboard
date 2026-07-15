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
  processedOrder?: Order
  machines: Record<string, MachineWorkflow>
}

type Store = { orders: Record<string, OrderWorkflow> }
const STORE_PATH = 'data/workflow-store.json'

function ghConfig() {
  return {
    token: process.env.GITHUB_TOKEN || '',
    owner: process.env.GITHUB_OWNER || 'viraai-ui',
    repo: process.env.GITHUB_REPO || 'bsm-dispatch-dashboard',
  }
}

async function githubRequest(path: string, init: RequestInit = {}) {
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

async function readStoreWithSha(): Promise<{ store: Store; sha?: string }> {
  try {
    const data = await githubRequest(`/contents/${STORE_PATH}`)
    const json = Buffer.from(data.content || '', 'base64').toString('utf8')
    return { store: JSON.parse(json || '{"orders":{}}'), sha: data.sha }
  } catch (error) {
    return { store: { orders: {} } }
  }
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

export async function listProcessedOrders() {
  const { store } = await readStoreWithSha()
  return Object.values(store.orders).filter((order) => order.status === 'processed')
}

export async function upsertOrderWorkflow(orderId: string, updater: (current: OrderWorkflow | null) => OrderWorkflow) {
  const { store, sha } = await readStoreWithSha()
  const next = updater(store.orders[orderId] || null)
  store.orders[orderId] = next
  await writeStore(store, sha)
  return next
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
