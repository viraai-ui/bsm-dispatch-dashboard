import { apiError, apiOk } from '@/lib/api'
import { serialDatabaseConfigured, serialLedgerHealth } from '@/lib/serial-ledger'
import { listWorkflows } from '@/lib/workflow-store'

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return apiError('Unauthorized', 401)
  try {
    if (!serialDatabaseConfigured()) return apiError('Authoritative serial database is not configured', 503)
    const [ledger, workflows] = await Promise.all([serialLedgerHealth(), listWorkflows()])
    const machines = Object.values(workflows).flatMap(order => Object.values(order.machines || {}))
    const zohoBacklog = machines.filter(machine => machine.serialNumber && machine.zohoBackupStatus !== 'synced').length
    const zohoErrors = machines.filter(machine => machine.zohoBackupStatus === 'error').length
    const checks = { counterMatchesMaximum: ledger.counterMatchesMaximum, zeroUnexplainedGaps: ledger.unexplainedGaps.length === 0, workflowMirrorsCurrent: ledger.pendingMirrors === 0, zohoBackupCurrent: zohoBacklog === 0, uploadTargetsConfigured: Boolean(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET_NAME), workflowStoreConfigured: Boolean(process.env.GITHUB_TOKEN) }
    const healthy = Object.values(checks).every(Boolean)
    const report = { healthy, checkedAt: new Date().toISOString(), checks, ledger, zoho: { backlog: zohoBacklog, errors: zohoErrors }, workflowOrders: Object.keys(workflows).length }
    return healthy ? apiOk(report) : Response.json({ ok: false, ...report }, { status: 503 })
  } catch (error) {
    console.error('Daily production audit failed', error)
    return apiError(error instanceof Error ? error.message : 'Daily audit failed', 500)
  }
}