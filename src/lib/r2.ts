import crypto from 'node:crypto'

export type R2UploadTarget = {
  key: string
  uploadUrl: string
  publicUrl: string
  expiresAt: string
  storageProvider: 'r2'
}

const REGION = 'auto'
const SERVICE = 's3'

function r2Config() {
  const accountId = process.env.R2_ACCOUNT_ID || ''
  const accessKeyId = process.env.R2_ACCESS_KEY_ID || ''
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || ''
  const bucket = process.env.R2_BUCKET || ''
  const endpoint = (process.env.R2_ENDPOINT || (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '')).replace(/\/$/, '')
  const publicBaseUrl = (process.env.R2_PUBLIC_BASE_URL || `${endpoint}/${bucket}`).replace(/\/$/, '')
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !endpoint) throw new Error('Cloudflare R2 is not configured')
  return { accessKeyId, secretAccessKey, bucket, endpoint, publicBaseUrl }
}

export function r2Configured() {
  return Boolean(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY && process.env.R2_BUCKET)
}

export function buildR2Key(parts: { salesOrderNumber: string; machineName: string; machineId: string; originalName: string; mimeType: string }) {
  const extension = parts.originalName.includes('.') ? parts.originalName.split('.').pop() : mimeExtension(parts.mimeType)
  const date = new Date().toISOString().slice(0, 10)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  return ['media-proof', date, safeSegment(parts.salesOrderNumber), `${safeSegment(parts.machineName)}-${safeSegment(parts.machineId)}-${stamp}${extension ? `.${extension}` : ''}`].join('/')
}

export function createR2UploadTarget(key: string, contentType: string, expiresInSeconds = 900): R2UploadTarget {
  const { accessKeyId, secretAccessKey, bucket, endpoint, publicBaseUrl } = r2Config()
  const now = new Date()
  const amzDate = toAmzDate(now)
  const dateStamp = amzDate.slice(0, 8)
  const host = new URL(endpoint).host
  const credentialScope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`
  const encodedKey = key.split('/').map(encodeURIComponent).join('/')
  const canonicalUri = `/${bucket}/${encodedKey}`
  const query: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresInSeconds),
    'X-Amz-SignedHeaders': 'content-type;host',
  }
  const canonicalQuery = canonicalQueryString(query)
  const canonicalHeaders = `content-type:${contentType || 'application/octet-stream'}\nhost:${host}\n`
  const canonicalRequest = ['PUT', canonicalUri, canonicalQuery, canonicalHeaders, 'content-type;host', 'UNSIGNED-PAYLOAD'].join('\n')
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256Hex(canonicalRequest)].join('\n')
  const signature = hmacHex(signingKey(secretAccessKey, dateStamp), stringToSign)
  const uploadUrl = `${endpoint}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`
  return { key, uploadUrl, publicUrl: `${publicBaseUrl}/${encodedKey}`, expiresAt: mediaExpiresAt(now), storageProvider: 'r2' }
}

export async function deleteR2Object(key: string | null | undefined) {
  if (!key) return false
  const { accessKeyId, secretAccessKey, bucket, endpoint } = r2Config()
  const now = new Date()
  const amzDate = toAmzDate(now)
  const dateStamp = amzDate.slice(0, 8)
  const host = new URL(endpoint).host
  const encodedKey = key.split('/').map(encodeURIComponent).join('/')
  const canonicalUri = `/${bucket}/${encodedKey}`
  const credentialScope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:UNSIGNED-PAYLOAD\nx-amz-date:${amzDate}\n`
  const canonicalRequest = ['DELETE', canonicalUri, '', canonicalHeaders, 'host;x-amz-content-sha256;x-amz-date', 'UNSIGNED-PAYLOAD'].join('\n')
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256Hex(canonicalRequest)].join('\n')
  const signature = hmacHex(signingKey(secretAccessKey, dateStamp), stringToSign)
  const response = await fetch(`${endpoint}${canonicalUri}`, {
    method: 'DELETE',
    headers: {
      Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=${signature}`,
      'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
      'x-amz-date': amzDate,
    },
    cache: 'no-store',
  })
  if (response.status === 404) return false
  if (!response.ok) throw new Error(`Cloudflare R2 delete failed: HTTP ${response.status}`)
  return true
}

function mediaExpiresAt(now: Date) { return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString() }
function safeSegment(value: string) { return value.replace(/[^a-zA-Z0-9._ -]/g, '').replace(/\s+/g, ' ').trim().slice(0, 90) || 'video' }
function mimeExtension(type: string) { if (type.includes('mp4')) return 'mp4'; if (type.includes('quicktime')) return 'mov'; if (type.includes('webm')) return 'webm'; return '' }
function toAmzDate(date: Date) { return date.toISOString().replace(/[:-]|\.\d{3}/g, '') }
function sha256Hex(value: string) { return crypto.createHash('sha256').update(value).digest('hex') }
function hmac(key: crypto.BinaryLike, value: string) { return crypto.createHmac('sha256', key).update(value).digest() }
function hmacHex(key: crypto.BinaryLike, value: string) { return crypto.createHmac('sha256', key).update(value).digest('hex') }
function signingKey(secret: string, dateStamp: string) { return hmac(hmac(hmac(hmac(`AWS4${secret}`, dateStamp), REGION), SERVICE), 'aws4_request') }
function canonicalQueryString(query: Record<string, string>) { return Object.keys(query).sort().map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(query[key])}`).join('&') }
