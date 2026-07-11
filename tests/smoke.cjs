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

  for (const path of ['/', '/orders', '/orders/so-1001', '/orders/so-1002', '/m/262700001', '/m/qr-262700001', '/packaging-tv', '/qr-serial', '/wooden-packing', '/media-proof', '/vehicle-dispatch', '/machine-lookup', '/sync-monitor', '/settings', '/api/orders', '/api/sync/status']) {
    const { response } = await fetchText(path)
    assert.equal(response.status, 200, `${path} should return 200`)
  }

  for (const path of ['/orders/not-real', '/m/not-real']) {
    const { response } = await fetchText(path)
    assert.equal(response.status, 404, `${path} should return 404`)
  }

  const invalidGenerate = await fetchText('/api/orders/not-real/generate-serials', { method: 'POST' })
  assert.equal(invalidGenerate.response.status, 404, 'invalid generate serial order should 404')

  const reviewGenerate = await fetchText('/api/orders/so-1002/generate-serials', { method: 'POST' })
  assert.equal(reviewGenerate.response.status, 409, 'review-required order should block serial generation')

  const validGenerate = await fetchText('/api/orders/so-1001/generate-serials', { method: 'POST' })
  assert.equal(validGenerate.response.status, 200, 'valid generate serial endpoint should 200')
  assert.match(validGenerate.text, /"mock":true/, 'mock action should declare mock mode')

  const webhook = await fetchText('/api/webhooks/zoho/sales-order', { method: 'POST', body: '{}' })
  assert.equal(webhook.response.status, 401, 'production webhook should fail closed without secret')

  const so1003Passport = await fetchText('/m/262700005')
  assert.match(so1003Passport.text, /href="\/orders\/so-1003"/, 'SO-1003 passport should link back to SO-1003')

  console.log('Smoke tests passed')
}

run().finally(() => server.kill('SIGTERM'))
