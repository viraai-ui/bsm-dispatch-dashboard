import { apiError, apiOk } from '@/lib/api'
import { serialDatabaseConfigured, serialLedgerHealth } from '@/lib/serial-ledger'
import { listWorkflows } from '@/lib/workflow-store'
import { createR2UploadTarget, ensureR2BrowserCors, r2Configured } from '@/lib/r2'
import { isAuthorizedCron } from '@/lib/cron-auth'

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return apiError('Unauthorized', 401)
  try {
    if (!serialDatabaseConfigured()) return apiError('Authoritative serial database is not configured', 503)
    const [ledger, workflows] = await Promise.all([serialLedgerHealth(), listWorkflows()])
    const r2Cors = r2Configured()
      ? await ensureR2BrowserCors(createR2UploadTarget(`health/cors-${Date.now()}.txt`, 'text/plain', 60, 1).uploadUrl)
      : { corsReady: false as const, corsError: 'R2 is not configured' }
    const machines = Object.values(workflows).flatMap(order => Object.values(order.machines || {}))
    const zohoBacklog = machines.filter(machine => machine.serialNumber && machine.zohoBackupStatus !== 'synced').length
    const zohoErrors = machines.filter(machine => machine.zohoBackupStatus === 'error').length
    const checks = { counterMatchesMaximum: ledger.counterMatchesMaximum, zeroUnexplainedGaps: ledger.unexplainedGaps.length === 0, workflowMirrorsCurrent: ledger.pendingMirrors === 0, zohoBackupCurrent: zohoBacklog === 0, uploadTargetsConfigured: r2Configured(), uploadBrowserCorsReady: r2Cors.corsReady, workflowStoreConfigured: Boolean(process.env.GITHUB_TOKEN) }
    const healthy = Object.values(checks).every(Boolean)
    const report = { healthy, checkedAt: new Date().toISOString(), checks, r2: r2Cors, ledger, zoho: { backlog: zohoBacklog, errors: zohoErrors }, workflowOrders: Object.keys(workflows).length }
    return healthy ? apiOk(report) : Response.json({ ok: false, ...report }, { status: 503 })
  } catch (error) {
    console.error('Daily production audit failed', error)
    return apiError(error instanceof Error ? error.message : 'Daily audit failed', 500)
  }
}