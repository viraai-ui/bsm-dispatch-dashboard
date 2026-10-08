import { neon } from '@neondatabase/serverless'
import bundledPacking from '../../data/media-proof-store.json'
import bundledLoading from '../../data/loading-video-store.json'
import type { MediaProofRecord, MediaProofStore, MediaStage } from './media-proof'

let client: ReturnType<typeof neon> | null = null
let ready: Promise<void> | null = null

function databaseUrl() { return process.env.DATABASE_URL || process.env.NEON_DATABASE_URL || '' }
export function mediaProofDatabaseConfigured() { return Boolean(databaseUrl()) }
function db() {
  const url = databaseUrl()
  if (!url) return null
  return client ||= neon(url)
}

const bundled: Record<MediaStage, MediaProofStore> = {
  packing: bundledPacking as MediaProofStore,
  loading: bundledLoading as MediaProofStore,
}

async function ensureSchema() {
  const sql = db()
  if (!sql) return false
  ready ||= (async () => {
    await sql`CREATE TABLE IF NOT EXISTS media_proof_records (
      stage text NOT NULL CHECK (stage IN ('packing', 'loading')),
      order_id text NOT NULL,
      record jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (stage, order_id)
    )`
    // The deployed JSON snapshots are the migration baseline. ON CONFLICT is
    // deliberately non-destructive, so all existing and subsequently written data survives deploys.
    for (const stage of ['packing', 'loading'] as const) {
      const seed = Object.entries(bundled[stage].records || {}).map(([orderId, record]) => ({ order_id: orderId, record }))
      if (seed.length) await sql`INSERT INTO media_proof_records (stage, order_id, record)
        SELECT ${stage}, item.order_id, item.record
        FROM jsonb_to_recordset(${JSON.stringify(seed)}::jsonb) AS item(order_id text, record jsonb)
        ON CONFLICT (stage, order_id) DO NOTHING`
    }
  })().catch((error) => { ready = null; throw error })
  await ready
  return true
}

export async function readMediaProofDatabase(stage: MediaStage): Promise<MediaProofStore> {
  const sql = db()
  if (!sql || !(await ensureSchema())) return structuredClone(bundled[stage])
  const rows = (await sql`SELECT order_id, record FROM media_proof_records WHERE stage = ${stage}`) as Array<{ order_id: string; record: MediaProofRecord }>
  const records = Object.fromEntries(rows.map((row) => [String(row.order_id), row.record]))
  return { records }
}

export async function writeMediaProofRecord(stage: MediaStage, record: MediaProofRecord) {
  const sql = db()
  if (!sql) throw new Error('Media metadata database is not configured')
  await ensureSchema()
  await sql`INSERT INTO media_proof_records (stage, order_id, record, updated_at)
    VALUES (${stage}, ${record.orderId}, ${JSON.stringify(record)}::jsonb, now())
    ON CONFLICT (stage, order_id) DO UPDATE SET record = excluded.record, updated_at = now()`
}

export async function replaceMediaProofDatabase(stage: MediaStage, store: MediaProofStore) {
  const sql = db()
  if (!sql) throw new Error('Media metadata database is not configured')
  await ensureSchema()
  for (const record of Object.values(store.records)) await writeMediaProofRecord(stage, record)
  const retainedIds = Object.keys(store.records)
  if (retainedIds.length) await sql`DELETE FROM media_proof_records WHERE stage = ${stage} AND NOT (order_id = ANY(${retainedIds}))`
  else await sql`DELETE FROM media_proof_records WHERE stage = ${stage}`
}
