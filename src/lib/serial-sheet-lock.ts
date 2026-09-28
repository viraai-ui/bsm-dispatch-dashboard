import { Pool } from 'pg'
let pool: Pool | undefined

/** Transaction-scoped lock works with Neon's pooled URL; no persistent schema change. */
export async function withSerialSheetLock<T>(work: () => Promise<T>): Promise<T | null> {
  const connectionString = process.env.DATABASE_URL || process.env.NEON_DATABASE_URL
  if (!connectionString) throw new Error('Serial Sheet reconciliation requires its database lock')
  pool ||= new Pool({ connectionString, max: 2, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 10_000 })
  const client = await pool.connect()
  try {
    await client.query('begin')
    const lock = await client.query('select pg_try_advisory_xact_lock($1) as acquired', [0x42534e])
    if (!lock.rows[0]?.acquired) return null
    return await work()
  } finally {
    try { await client.query('rollback') } finally { client.release() }
  }
}
