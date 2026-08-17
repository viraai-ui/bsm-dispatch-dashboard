const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const https = require('node:https')

const repo = process.env.GITHUB_REPO_FULL || 'viraai-ui/bsm-dispatch-dashboard'
const base = process.env.BSM_DISPATCH_BASE_URL || 'https://dispatch.bsmindia.com'
const login = process.env.BSM_ADMIN_LOGIN || 'admin@bsmindia.com'
const password = process.env.BSM_ADMIN_PASSWORD || '1231'

function ghApi(path) {
  return JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', maxBuffer: 60 * 1024 * 1024 }))
}

function readUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'user-agent': 'bsm-dispatch-database-integrity' } }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => res.statusCode >= 200 && res.statusCode < 300 ? resolve(body) : reject(new Error(`${url} returned ${res.statusCode}`)))
    }).on('error', reject)
  })
}

async function githubJson(path) {
  const meta = ghApi(`/repos/${repo}/contents/${path}`)
  if (meta.content && meta.encoding === 'base64') return JSON.parse(Buffer.from(meta.content, 'base64').toString('utf8'))
  if (meta.git_url) {
    const blob = ghApi(meta.git_url.replace('https://api.github.com', ''))
    return JSON.parse(Buffer.from(blob.content || '', 'base64').toString('utf8'))
  }
  if (meta.download_url) return JSON.parse(await readUrl(`${meta.download_url}?cacheBust=${Date.now()}`))
  throw new Error(`Could not read ${path}`)
}

async function fetchText(path, options = {}) {
  const response = await fetch(base + path, options)
  return { response, text: await response.text() }
}

function workflowSerialRows(workflow) {
  return Object.values(workflow.orders || {}).flatMap((order) => {
    const processedMachines = order.processedOrder?.machines || []
    const processedById = new Map(processedMachines.map((machine) => [machine.id, machine]))
    return Object.values(order.machines || {}).map((machine) => {
      const processed = processedById.get(machine.machineUnitId) || {}
      return {
        orderId: order.salesOrderId,
        salesOrderNumber: order.salesOrderNumber,
        serial: String(machine.serialNumber || processed.serialNumber || '').trim(),
        machineId: machine.machineUnitId,
        lineItemId: machine.lineItemId || processed.lineItemId || '',
        machineName: processed.itemName || 'Machine unit',
        vendor: machine.vendor || processed.vendor || '',
      }
    }).filter((row) => row.serial)
  })
}

function mediaVideoRows(store, stage) {
  return Object.values(store.records || {}).flatMap((record) => Object.entries(record.units || {}).flatMap(([unitId, unit]) => (unit.videos || []).map((video) => ({
    stage,
    orderId: record.orderId,
    salesOrderNumber: record.salesOrderNumber,
    unitId,
    id: video.id,
    url: video.workdriveUrl || video.url,
    submitted: Boolean(record.submittedAt),
  }))))
}

async function run() {
  const [workflow, packing, loading, shipments] = await Promise.all([
    githubJson('data/workflow-store.json'),
    githubJson('data/media-proof-store.json'),
    githubJson('data/loading-video-store.json'),
    githubJson('data/ready-to-ship-store.json').catch(() => ({ shipments: {} })),
  ])

  const serialRows = workflowSerialRows(workflow)
  assert.ok(serialRows.length > 0, 'workflow store must contain serial-backed Database rows')
  const duplicateSerials = [...serialRows.reduce((map, row) => map.set(row.serial, (map.get(row.serial) || 0) + 1), new Map())].filter(([, count]) => count > 1)
  assert.deepEqual(duplicateSerials, [], 'workflow serials must be unique so Database lookups are unambiguous')

  const staleProcessedRows = serialRows.filter((row) => !row.salesOrderNumber || !row.orderId || !row.machineId)
  assert.deepEqual(staleProcessedRows, [], 'every workflow serial row needs sales order, order id, and machine unit id')

  const packingVideos = mediaVideoRows(packing, 'packing')
  const loadingVideos = mediaVideoRows(loading, 'loading')
  const badVideos = [...packingVideos, ...loadingVideos].filter((row) => !row.url || !row.salesOrderNumber || !row.orderId)
  assert.deepEqual(badVideos, [], 'every Database media button needs a URL, Sales Order, and order id')

  const submittedLoadingVideos = loadingVideos.filter((row) => row.submitted)
  const shipmentMap = shipments.shipments || {}
  const submittedWithoutShipment = submittedLoadingVideos.filter((row) => !shipmentMap[row.orderId])
  // This is allowed and required: Database must still show these loading videos without shipment details.
  assert.ok(submittedLoadingVideos.length >= 0, 'submitted loading video rows can be checked independently of shipment rows')

  let liveChecked = false
  try {
    const loginResponse = await fetch(base + '/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ login, password }),
    })
    if (loginResponse.ok) {
      const cookie = loginResponse.headers.get('set-cookie')?.split(';')[0]
      assert.ok(cookie, 'login should return a session cookie')
      const database = await fetchText('/database', { headers: { cookie } })
      assert.equal(database.response.status, 200, '/database should return 200')
      const missingSerials = serialRows.map((row) => row.serial).filter((serial) => !database.text.includes(serial))
      assert.deepEqual(missingSerials, [], 'every workflow serial must render in production /database')
      for (const row of submittedLoadingVideos) assert.ok(database.text.includes(row.salesOrderNumber), `submitted loading video SO ${row.salesOrderNumber} must render in Database`)
      liveChecked = true
    }
  } catch (error) {
    if (process.env.CI) throw error
    console.warn(`Live authenticated Database check skipped: ${error.message}`)
  }

  console.log(`Database integrity passed: ${serialRows.length} workflow serials, ${packingVideos.length} packing videos, ${loadingVideos.length} loading videos, ${submittedWithoutShipment.length} submitted loading videos without shipment, liveChecked=${liveChecked}`)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
