const snapshot = require('../data/public-database-snapshot.json')

const requiresR2 = Object.values(snapshot.media || {}).some((ref) => ref.source === 'r2')
const credentials = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'].every((name) => Boolean((process.env[name] || '').trim()))
let publicOrigin = false
try {
  const url = new URL((process.env.R2_PUBLIC_BASE_URL || '').trim())
  publicOrigin = url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash
} catch {}

if (process.env.VERCEL_ENV === 'production' && requiresR2 && !credentials && !publicOrigin) {
  console.error('DEPLOYMENT BLOCKED: the public database snapshot contains R2 attachments, but neither complete R2 credentials nor R2_PUBLIC_BASE_URL is configured.')
  process.exit(1)
}
console.log(`Media read configuration guard: ${requiresR2 ? (credentials ? 'signed R2 reads' : publicOrigin ? 'public-origin reads' : 'not required outside production') : 'no R2 references'}`)