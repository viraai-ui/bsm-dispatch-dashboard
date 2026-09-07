#!/usr/bin/env node
const { spawnSync } = require('node:child_process')
const { resolve } = require('node:path')

const root = resolve(__dirname, '..')

function run(command, args, env = process.env) {
  console.log(`\n> ${command} ${args.join(' ')}`)
  const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

run('npm', ['run', 'test:audit-preflight'])
run('npm', ['run', 'test:serials:legacy'])
run('npm', ['run', 'test:core-hardening'])
run('npm', ['run', 'typecheck'])
run(process.execPath, ['scripts/verify-production-media.cjs'])

// This is intentionally a local build. Actual Vercel production builds retain
// VERCEL_ENV=production and therefore remain protected by the strict prebuild guard.
const localBuildEnv = { ...process.env }
delete localBuildEnv.VERCEL_ENV
delete localBuildEnv.VERCEL_TARGET_ENV
run('npm', ['run', 'build'], localBuildEnv)

console.log('\nRelease audit passed: tests, typecheck, production media readiness, and local build verified.')
