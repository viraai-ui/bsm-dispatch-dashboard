const assert = require('node:assert/strict')
const { spawn } = require('node:child_process')

const base = 'http://127.0.0.1:4178'
const env = { ...process.env, PORT: '4178' }
const server = spawn('npm', ['run', 'start', '--', '-p', '4178'], { env, stdio: ['ignore', 'pipe', 'pipe'] })

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)) }
async function fetchText(path, options) {
  const response = await fetch(base + path, options)
  return { response, text: await response.text() }
}

async function login(login = 'admin@bsmindia.com', password = '1231') {
  const response = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ login, password }) })
  assert.equal(response.status, 200, 'login should return 200')
  return response.headers.get('set-cookie').split(';')[0]
}

async function waitForServer() {
  for (let i = 0; i < 30; i += 1) {
    try {
      const response = await fetch(base + '/')
      if (response.status === 200) return
    } catch {}
    await wait(500)
  }
  throw new Error('Server did not start')
}

async function run() {
  await waitForServer()
  const cookie = await login()

  for (const path of ['/', '/orders', '/orders/so-1001', '/orders/so-1002', '/m/262700001', '/m/qr-262700001', '/packaging-tv', '/wooden-packing', '/media-proof', '/vehicle-dispatch', '/database', '/settings', '/api/orders', '/api/sync/status']) {
    const { response } = await fetchText(path, { headers: { cookie } })
    assert.equal(response.status, 200, `${path} should return 200`)
  }

  for (const path of ['/orders/not-real', '/m/not-real']) {
    const { response } = await fetchText(path)
    assert.equal(response.status, 404, `${path} should return 404`)
  }

  const invalidGenerate = await fetchText('/api/orders/not-real/generate-serials', { method: 'POST', headers: { cookie } })
  assert.equal(invalidGenerate.response.status, 404, 'invalid generate serial order should 404')

  const partialGenerate = await fetchText('/api/orders/so-1002/generate-serials', { method: 'POST', headers: { cookie } })
  assert.equal(partialGenerate.response.status, 200, 'partially shipped open order can generate next batch serials')

  const validGenerate = await fetchText('/api/orders/so-1001/generate-serials', { method: 'POST', headers: { cookie } })
  assert.equal(validGenerate.response.status, 200, 'valid generate serial endpoint should 200')
  assert.match(validGenerate.text, /"mock":true/, 'mock action should declare mock mode')

  const webhook = await fetchText('/api/webhooks/zoho/sales-order', { method: 'POST', body: '{}' })
  assert.equal(webhook.response.status, 401, 'production webhook should fail closed without secret')

  const so1003Passport = await fetchText('/m/262700005')
  assert.match(so1003Passport.text, /href="\/orders\/so-1003"/, 'SO-1003 passport should link back to SO-1003')

  console.log('Smoke tests passed')
}

run().finally(() => server.kill('SIGTERM'))
