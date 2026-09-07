const test = require('node:test')
const assert = require('node:assert/strict')
const { execFileSync, spawnSync } = require('node:child_process')
const { mkdtempSync, writeFileSync, mkdirSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')

const script = join(__dirname, '..', 'scripts', 'vercel-ignore-build.cjs')
const operationalFiles = [
  'data/auth-users-store.json',
  'data/dispatch-priority-store.json',
  'data/dispatch-store.json',
  'data/loading-video-store.json',
  'data/media-proof-store.json',
  'data/operational-lifecycle-baseline.json',
  'data/packaging-completed-store.json',
  'data/payment-notifications.json',
  'data/payment-order-index.json',
  'data/payment-push-subscriptions.json',
  'data/payments.json',
  'data/ready-to-ship-store.json',
  'data/synced-confirmed-orders-store.json',
  'data/transporters-store.json',
  'data/wooden-packing-store.json',
  'data/workflow-store.json',
  'data/media-uploads/proof.mp4',
]

function git(cwd, ...args) { return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim() }
function fixture() {
  const cwd = mkdtempSync(join(tmpdir(), 'vercel-ignore-'))
  git(cwd, 'init', '-q'); git(cwd, 'config', 'user.email', 'test@example.com'); git(cwd, 'config', 'user.name', 'Test')
  write(cwd, 'src/app.ts', 'initial\n'); git(cwd, 'add', '.'); git(cwd, 'commit', '-qm', 'initial')
  return cwd
}
function write(cwd, path, value) { mkdirSync(join(cwd, path, '..'), { recursive: true }); writeFileSync(join(cwd, path), value) }
function commit(cwd, path, value) { write(cwd, path, value); git(cwd, 'add', path); git(cwd, 'commit', '-qm', path); return git(cwd, 'rev-parse', 'HEAD') }
function decide(cwd, env = {}) { return spawnSync(process.execPath, [script], { cwd, env: { ...process.env, ...env }, encoding: 'utf8' }) }

test('skips every operational writer path and legacy media uploads', () => {
  for (const path of operationalFiles) {
    const cwd = fixture(); const sha = commit(cwd, path, '{}\n'); const result = decide(cwd, { VERCEL_GIT_COMMIT_SHA: sha })
    assert.equal(result.status, 0, `${path}: ${result.stdout}${result.stderr}`)
  }
})
test('skips a commit containing multiple data-only changes', () => {
  const cwd = fixture(); write(cwd, operationalFiles[1], '{}'); write(cwd, operationalFiles[2], '{}'); git(cwd, 'add', '.'); git(cwd, 'commit', '-qm', 'data')
  assert.equal(decide(cwd).status, 0)
})
test('builds source-only, mixed, and non-runtime snapshot changes', () => {
  for (const paths of [['src/app.ts'], ['data/payments.json', 'src/app.ts'], ['data/public-database-snapshot.json']]) {
    const cwd = fixture(); paths.forEach((p) => write(cwd, p, `${p}\n`)); git(cwd, 'add', '.'); git(cwd, 'commit', '-qm', 'change')
    assert.equal(decide(cwd).status, 1, paths.join(','))
  }
})
test('resolves the parent in a Vercel-style depth-one checkout', () => {
  const source = fixture(); commit(source, 'data/payments.json', '{}')
  const bare = mkdtempSync(join(tmpdir(), 'vercel-ignore-remote-'))
  git(bare, 'init', '--bare', '-q'); git(source, 'remote', 'add', 'origin-test', bare); git(source, 'push', '-q', 'origin-test', 'HEAD:main')
  const shallow = mkdtempSync(join(tmpdir(), 'vercel-ignore-shallow-'))
  execFileSync('git', ['clone', '-q', '--depth=1', '--branch=main', `file://${bare}`, shallow])
  assert.equal(decide(shallow).status, 0)
})

test('fails open for initial commit, unknown SHA, and comparison errors', () => {
  const initial = fixture(); assert.equal(decide(initial).status, 1)
  const cwd = fixture(); commit(cwd, 'data/payments.json', '{}'); assert.equal(decide(cwd, { VERCEL_GIT_COMMIT_SHA: 'deadbeef' }).status, 1)
  assert.equal(decide(tmpdir()).status, 1)
})
