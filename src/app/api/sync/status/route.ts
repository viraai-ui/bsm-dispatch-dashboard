import { apiOk } from '@/lib/api'
import { requireUser } from '@/lib/auth'
import { serialDatabaseConfigured, serialLedgerHealth } from '@/lib/serial-ledger'
import { serialSheetConfigured } from '@/lib/serial-sheet-backup'
import { readSyncedOrdersStore } from '@/lib/synced-orders'
import { listWorkflows } from '@/lib/workflow-store'
import { r2Configured } from '@/lib/r2'
import { workDriveConfigured } from '@/lib/workdrive'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireUser(['Admin', 'Operations'])
  if (!auth.ok) return auth.response
  const checkedAt = new Date().toISOString()
  const [ordersResult, workflowResult, ledgerResult] = await Promise.allSettled([
    withTimeout(readSyncedOrdersStore(), 8_000, 'order store'),
    withTimeout(listWorkflows(), 8_000, 'workflow store'),
    serialDatabaseConfigured() ? withTimeout(serialLedgerHealth(), 8_000, 'serial ledger') : Promise.resolve(null),
  ])
  const orders = ordersResult.status === 'fulfilled' ? ordersResult.value : null
  const workflows = workflowResult.status === 'fulfilled' ? workflowResult.value : null
  const ledger = ledgerResult.status === 'fulfilled' ? ledgerResult.value : null
  const machines = workflows ? Object.values(workflows).flatMap((workflow) => Object.values(workflow.machines || {})) : []
  const zohoPending = machines.filter((machine) => machine.zohoBackupStatus === 'pending' || machine.zohoBackupStatus === 'error')
  const components = {
    database: component(Boolean(ledger), serialDatabaseConfigured(), ledgerResult),
    workflowMirror: { status: !workflows ? 'unhealthy' : ledger && ledger.pendingMirrors > 0 ? 'degraded' : 'healthy', orderCount: workflows ? Object.keys(workflows).length : null, pending: ledger?.pendingMirrors ?? null, oldestPendingAt: ledger?.oldestPendingMirrorAt ?? null, error: rejected(workflowResult) },
    orderSync: { status: !orders ? 'unhealthy' : orders.lastError ? 'degraded' : 'healthy', orderCount: orders?.orderIds.length ?? null, lastSuccessfulAt: orders?.lastSuccessfulSyncAt ?? null, lastAttemptAt: orders?.lastAttemptAt ?? null, running: orders?.syncing ?? false, error: orders?.lastError || rejected(ordersResult) },
    zohoSerialQueue: { status: !workflows ? 'unknown' : zohoPending.length ? 'degraded' : 'healthy', configured: serialSheetConfigured(), pending: zohoPending.length, oldestPendingAt: zohoPending.map((m) => m.zohoBackupQueuedAt).filter((v): v is string => Boolean(v)).sort()[0] || null },
    r2: { status: r2Configured() ? 'configured' : 'not_configured', configured: r2Configured() },
    workDrive: { status: workDriveConfigured() ? 'configured' : 'not_configured', configured: workDriveConfigured() },
  }
  const unhealthy = Object.values(components).some((entry) => entry.status === 'unhealthy')
  const degraded = Object.values(components).some((entry) => entry.status === 'degraded' || entry.status === 'not_configured')
  return apiOk({ status: unhealthy ? 'unhealthy' : degraded ? 'degraded' : 'healthy', checkedAt, freshness: { authoritative: true, cached: false }, components, ledger })
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string) {
  return Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms))])
}
function rejected(result: PromiseSettledResult<unknown>) { return result.status === 'rejected' ? (result.reason instanceof Error ? result.reason.message : 'health check failed') : null }
function component(ok: boolean, configured: boolean, result: PromiseSettledResult<unknown>) { return { status: !configured ? 'not_configured' : ok ? 'healthy' : 'unhealthy', configured, error: rejected(result) } }
