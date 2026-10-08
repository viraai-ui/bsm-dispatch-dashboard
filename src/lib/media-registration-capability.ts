import crypto from 'node:crypto'
import type { Order } from '@/types/domain'
import type { MediaStage } from './media-proof'

type Capability = { v: 1; exp: number; stage: MediaStage; orderId: string; machineId: string; r2Key: string; order: Order }

function secret() {
  const value = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || process.env.R2_SECRET_ACCESS_KEY
  if (!value) throw new Error('Media registration signing secret is not configured')
  return value
}

function signature(payload: string) {
  return crypto.createHmac('sha256', secret()).update(`media-registration:${payload}`).digest('base64url')
}

export function issueMediaRegistrationCapability(input: Omit<Capability, 'v' | 'exp'>, ttlMs = 20 * 60_000) {
  const payload = Buffer.from(JSON.stringify({ v: 1, exp: Date.now() + ttlMs, ...input } satisfies Capability)).toString('base64url')
  return `${payload}.${signature(payload)}`
}

export function verifyMediaRegistrationCapability(token: string, expected: Pick<Capability, 'stage' | 'orderId' | 'machineId' | 'r2Key'>) {
  const [payload, supplied, extra] = String(token || '').split('.')
  if (!payload || !supplied || extra) return null
  const wanted = signature(payload)
  const left = Buffer.from(supplied)
  const right = Buffer.from(wanted)
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null
  try {
    const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Capability
    if (value.v !== 1 || value.exp < Date.now() || value.stage !== expected.stage || value.orderId !== expected.orderId || value.machineId !== expected.machineId || value.r2Key !== expected.r2Key) return null
    if (!value.order || value.order.id !== expected.orderId || !value.order.salesOrderNumber || !Array.isArray(value.order.machines)) return null
    return value.order
  } catch { return null }
}
