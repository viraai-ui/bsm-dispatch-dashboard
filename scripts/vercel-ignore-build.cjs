#!/usr/bin/env node
'use strict'

// Vercel semantics: exit 0 cancels the build; exit 1 continues it.
// This script deliberately fails open: only a proven, non-empty diff containing
// exclusively runtime-read operational data is safe to skip.
const { spawnSync } = require('node:child_process')

const OPERATIONAL_FILES = new Set([
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
])
const isOperational = (path) => OPERATIONAL_FILES.has(path) || path.startsWith('data/media-uploads/')
const git = (args) => spawnSync('git', args, { encoding: 'utf8' })
const build = (reason) => { console.log(`[vercel-ignore] BUILD: ${reason}`); process.exit(1) }

try {
  const target = process.env.VERCEL_GIT_COMMIT_SHA || 'HEAD'
  if (git(['cat-file', '-e', `${target}^{commit}`]).status !== 0) build('deployment commit is unavailable')

  let parentResult = git(['rev-parse', '--verify', `${target}^`])
  if (parentResult.status !== 0) {
    // Vercel may provide a depth-one checkout. Fetch only enough history to
    // resolve the deployment commit's parent; inability to do so must build.
    const fetched = git(['fetch', '--no-tags', '--depth=2', 'origin', target])
    if (fetched.status !== 0) build('parent unavailable and shallow fetch failed')
    parentResult = git(['rev-parse', '--verify', `${target}^`])
  }
  if (parentResult.status !== 0) build('initial commit or parent unavailable')
  const parent = parentResult.stdout.trim()
  if (!/^[0-9a-f]{40,64}$/i.test(parent)) build('invalid parent revision')

  const diff = git(['diff', '--name-only', '-z', parent, target, '--'])
  if (diff.status !== 0) build('git comparison failed')
  const paths = diff.stdout.split('\0').filter(Boolean)
  if (!paths.length) build('empty or indeterminate diff')
  const unsafe = paths.filter((path) => !isOperational(path))
  if (unsafe.length) build(`deployment-relevant change: ${unsafe.join(', ')}`)

  console.log(`[vercel-ignore] SKIP: ${paths.length} operational data file(s) only`)
  process.exit(0)
} catch (error) {
  build(`comparison error: ${error instanceof Error ? error.message : String(error)}`)
}
