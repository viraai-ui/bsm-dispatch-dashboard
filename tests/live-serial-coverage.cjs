const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')

const base = process.env.BSM_DISPATCH_BASE_URL || 'https://dispatch.bsmindia.com'
const login = process.env.BSM_ADMIN_LOGIN || 'admin@bsmindia.com'
const password = process.env.BSM_ADMIN_PASSWORD || '1231'

function githubJson(path) {
  const output = execFileSync('gh', ['api', `repos/viraai-ui/bsm-dispatch-dashboard/contents/${path}`, '--jq', '.content'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 })
  return JSON.parse(Buffer.from(output.trim(), 'base64').toString('utf8'))
}

async function fetchText(path, options = {}) {
  const response = await fetch(base + path, options)
  return { response, text: await response.text() }
}

async function run() {
  const workflow = githubJson('data/workflow-store.json')
  const workflowSerials = Object.values(workflow.orders || {})
    .flatMap((order) => Object.values(order.machines || {}).map((machine) => String(machine.serialNumber || '').trim()).filter(Boolean))
  assert.ok(workflowSerials.length > 0, 'workflow store should contain serial numbers')

  const loginResponse = await fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ login, password }),
  })
  assert.equal(loginResponse.status, 200, 'production login should succeed')
  const cookie = loginResponse.headers.get('set-cookie')?.split(';')[0]
  assert.ok(cookie, 'production login should return a session cookie')

  const ordersApi = await fetchText('/api/orders', { headers: { cookie } })
  assert.equal(ordersApi.response.status, 200, '/api/orders should return 200')
  const ordersJson = JSON.parse(ordersApi.text)
  const apiSerials = new Set(ordersJson.data.orders.flatMap((order) => (order.machines || []).map((machine) => String(machine.serialNumber || '').trim()).filter(Boolean)))
  const missingApiSerials = workflowSerials.filter((serial) => !apiSerials.has(serial))
  assert.deepEqual(missingApiSerials, [], 'every workflow serial must appear in production /api/orders')

  const database = await fetchText('/database', { headers: { cookie } })
  assert.equal(database.response.status, 200, '/database should return 200')
  const missingDatabaseSerials = workflowSerials.filter((serial) => !database.text.includes(serial))
  assert.deepEqual(missingDatabaseSerials, [], 'every workflow serial must appear in production /database')

  console.log(`Live serial coverage passed: ${workflowSerials.length} workflow serials appear in /api/orders and /database`)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
