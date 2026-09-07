const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const { readFileSync, existsSync } = require('node:fs')
const { resolve } = require('node:path')

const root = resolve(__dirname, '..')
const guard = resolve(root, 'scripts/assert-media-read-config.cjs')
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('R2_')))

function check(env) {
  return spawnSync(process.execPath, [guard], { cwd: root, env: { ...cleanEnv, ...env }, encoding: 'utf8' })
}

async function run() {
  const productionWithoutReadConfig = check({ VERCEL_ENV: 'production' })
  assert.notEqual(productionWithoutReadConfig.status, 0, 'production guard must remain fail-closed when the snapshot needs R2 reads')
  assert.match(productionWithoutReadConfig.stderr, /DEPLOYMENT BLOCKED/)

  const productionWithPublicOrigin = check({ VERCEL_ENV: 'production', R2_PUBLIC_BASE_URL: 'https://media.example.test' })
  assert.equal(productionWithPublicOrigin.status, 0, productionWithPublicOrigin.stderr)
  assert.match(productionWithPublicOrigin.stdout, /public-origin reads/)

  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
  assert.equal(pkg.scripts['audit:release'], 'node scripts/audit-release.cjs')
  assert.equal(pkg.scripts['build:audit'], undefined, 'misleading production-env build entry point must stay removed')
  assert.match(pkg.scripts['test:serials:legacy'], /^tsx /, 'legacy serial test must use a TypeScript-aware ESM runner')
  assert.match(pkg.scripts['test:core-hardening'], /^tsx /, 'core hardening test must use a TypeScript-aware ESM runner')
  assert.ok(pkg.devDependencies.tsx, 'tsx must be pinned in devDependencies')

  const auditScript = readFileSync(resolve(root, 'scripts/audit-release.cjs'), 'utf8')
  assert.doesNotMatch(auditScript, /env pull|\.env\.audit|dummy|VERCEL_ENV\s*[:=]\s*['"]production/i)
  assert.match(auditScript, /delete localBuildEnv\.VERCEL_ENV/)
  assert.match(auditScript, /scripts\/verify-production-media\.cjs/)
  assert.ok(!existsSync(resolve(root, 'scripts/build-with-production-env.cjs')))

  const originalFetch = global.fetch
  global.fetch = async () => new Response(JSON.stringify({ ok: true, mediaCount: 3, media: { ready: false, status: 'unavailable' } }), { status: 200, headers: { 'content-type': 'application/json' } })
  try {
    const { verifyProductionMedia } = require('../scripts/verify-production-media.cjs')
    await assert.rejects(verifyProductionMedia(), /production media is not ready/, 'production health verification must fail closed')
  } finally {
    global.fetch = originalFetch
  }

  console.log('Audit preflight regression passed: strict production guard, fail-closed production health, local-only build, and Node 25 test runners')
}

run().catch((error) => { console.error(error); process.exit(1) })
