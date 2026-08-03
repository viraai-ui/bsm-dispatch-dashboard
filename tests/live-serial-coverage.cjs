const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const https = require('node:https')

const base = process.env.BSM_DISPATCH_BASE_URL || 'https://dispatch.bsmindia.com'
const login = process.env.BSM_ADMIN_LOGIN || 'admin@bsmindia.com'
const password = process.env.BSM_ADMIN_PASSWORD || '1231'
const repo = process.env.GITHUB_REPO_FULL || 'viraai-ui/bsm-dispatch-dashboard'

function ghApi(path) {
  return JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', maxBuffer: 60 * 1024 * 1024 }))
}

function readUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'user-agent': 'bsm-dispatch-serial-coverage' } }, (res) => {
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
  if (meta.download_url) return JSON.parse(await readUrl(meta.download_url))
  if (meta.git_url) {
    const blob = ghApi(meta.git_url.replace('https://api.github.com', ''))
    return JSON.parse(Buffer.from(blob.content || '', 'base64').toString('utf8'))
  }
  throw new Error(`Could not read ${path}`)
}

async function fetchText(path, options = {}) {
  const response = await fetch(base + path, options)
  return { response, text: await response.text() }
}

async function run() {
  const workflow = await githubJson('data/workflow-store.json')
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
  JSON.parse(ordersApi.text)

  const database = await fetchText('/database', { headers: { cookie } })
  assert.equal(database.response.status, 200, '/database should return 200')
  const missingDatabaseSerials = workflowSerials.filter((serial) => !database.text.includes(serial))
  assert.deepEqual(missingDatabaseSerials, [], 'every workflow serial must appear in production /database')

  console.log(`Live serial coverage passed: ${workflowSerials.length} workflow serials appear in /database`)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
