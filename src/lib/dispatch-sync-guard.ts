import { githubReadJson, githubWriteJson, isGitHubWriteConflict } from './workflow-store'

export const DISPATCH_GUARD_PATH = 'data/dispatch-sync-guard.json'
export const DISPATCH_DAILY_BUDGET = Math.max(1, Number(process.env.DISPATCH_ZOHO_DAILY_BUDGET || 1200))
export const DISPATCH_LEASE_MS = 5 * 60 * 1000

type GuardState = {
  version: 1
  dayIst: string
  used: number
  limit: number
  circuitUntil: string | null
  circuitReason: string | null
  lease: { owner: string; until: string } | null
  lastCallAt?: string
}

function dayIst(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}
function initial(now = new Date()): GuardState { return { version: 1, dayIst: dayIst(now), used: 0, limit: DISPATCH_DAILY_BUDGET, circuitUntil: null, circuitReason: null, lease: null } }
function normalized(value: Partial<GuardState>, now = new Date()): GuardState {
  const base = { ...initial(now), ...value, limit: DISPATCH_DAILY_BUDGET }
  if (base.dayIst !== dayIst(now)) return initial(now)
  return base
}
async function update(mutator: (state: GuardState) => GuardState) {
  let error: unknown
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current = await githubReadJson<GuardState>(DISPATCH_GUARD_PATH, initial())
    const next = mutator(normalized(current.data))
    try { await githubWriteJson(DISPATCH_GUARD_PATH, next, 'Update Dispatch Zoho safety guard', current.sha); return next }
    catch (caught) { error = caught; if (!isGitHubWriteConflict(caught)) throw caught }
  }
  throw error instanceof Error ? error : new Error('Dispatch guard update conflict')
}

export async function readDispatchGuard() {
  const { data } = await githubReadJson<GuardState>(DISPATCH_GUARD_PATH, initial())
  return normalized(data)
}

export async function acquireDispatchLease(owner = crypto.randomUUID()) {
  let acquired = false
  const state = await update((current) => {
    acquired = false
    const active = current.lease && new Date(current.lease.until).getTime() > Date.now()
    if (active && current.lease?.owner !== owner) return current
    acquired = true
    return { ...current, lease: { owner, until: new Date(Date.now() + DISPATCH_LEASE_MS).toISOString() } }
  })
  return { acquired, owner, state }
}
export async function releaseDispatchLease(owner: string) {
  await update((current) => current.lease?.owner === owner ? { ...current, lease: null } : current)
}

/** Atomically reserves one Dispatch business API call. Rejection performs zero provider calls. */
export async function consumeDispatchCall() {
  let allowed = false
  const state = await update((current) => {
    allowed = false
    if (current.circuitUntil && new Date(current.circuitUntil).getTime() > Date.now()) return current
    if (current.used >= current.limit) return current
    allowed = true
    return { ...current, used: current.used + 1, lastCallAt: new Date().toISOString() }
  })
  if (!allowed) {
    if (state.circuitUntil && new Date(state.circuitUntil).getTime() > Date.now()) throw new Error(`DISPATCH_ZOHO_CIRCUIT_OPEN_UNTIL_${state.circuitUntil}`)
    throw new Error(`DISPATCH_ZOHO_DAILY_BUDGET_EXHAUSTED_${state.used}_OF_${state.limit}`)
  }
  return state
}

export async function openDispatchCircuit(until: Date, reason: string) {
  return update((current) => ({ ...current, circuitUntil: until.toISOString(), circuitReason: reason.slice(0, 300) }))
}

export function providerResetAt(response: Response) {
  const now = Date.now()
  const retry = response.headers.get('retry-after')
  if (retry) {
    const seconds = Number(retry)
    if (Number.isFinite(seconds)) return new Date(now + Math.max(1, seconds) * 1000)
    const date = new Date(retry); if (Number.isFinite(date.getTime())) return date
  }
  const raw = Number(response.headers.get('x-rate-limit-reset'))
  // Zoho Inventory reports this header as seconds remaining, not an epoch.
  if (Number.isFinite(raw) && raw > 0) return new Date(raw > 10_000_000_000 ? raw : now + raw * 1000)
  return new Date(now + 60 * 60 * 1000)
}
