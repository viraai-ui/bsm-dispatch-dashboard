#!/usr/bin/env node

const DEFAULT_ORIGIN = 'https://dispatch.bsmindia.com'
const origin = (process.env.PRODUCTION_ORIGIN || DEFAULT_ORIGIN).replace(/\/$/, '')
const timeoutMs = Number(process.env.RELEASE_AUDIT_TIMEOUT_MS || 20_000)

async function getJson(path) {
  const response = await fetch(`${origin}${path}`, {
    headers: { Accept: 'application/json' },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`)
  return response.json()
}

async function verifyProductionMedia() {
  const health = await getJson('/api/public/database/health')
  if (health.ok !== true || health.media?.ready !== true || health.media?.status !== 'available') {
    throw new Error(`production media is not ready (${JSON.stringify(health.media || null)})`)
  }

  let sampled = false
  if (Number(health.mediaCount) > 0) {
    const search = await getJson('/api/public/database/search?limit=50&page=1')
    for (const item of search.items || []) {
      const detail = await getJson(`/api/public/database/orders/${encodeURIComponent(item.id)}?snapshotVersion=${encodeURIComponent(search.snapshotVersion || health.snapshotVersion || '')}`)
      const capability = detail.media?.[0]?.url
      if (!capability) continue
      const response = await fetch(new URL(capability, origin), {
        headers: { Range: 'bytes=0-0' },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (response.status !== 206) {
        await response.body?.cancel()
        throw new Error(`public media byte-range sample returned HTTP ${response.status}, expected 206`)
      }
      const reader = response.body?.getReader()
      const first = reader ? await reader.read() : { value: null }
      await reader?.cancel()
      if (!first.value?.byteLength) throw new Error('public media byte-range sample returned no bytes')
      sampled = true
      break
    }
    if (!sampled) throw new Error('production reports media, but no public media capability could be sampled from the first 50 records')
  }

  console.log(`Production media verification passed: ${health.mediaCount} attachment(s), status available${sampled ? ', no-cookie byte-range sample passed' : ''}.`)
}

if (require.main === module) {
  verifyProductionMedia().catch((error) => {
    console.error(`PRODUCTION MEDIA VERIFICATION FAILED: ${error.message}`)
    process.exit(1)
  })
}

module.exports = { verifyProductionMedia }
