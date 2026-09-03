// Process-local invalidation for the public read model. All durable business
// mutations pass through githubWriteJson, so the instance handling a mutation
// can refresh immediately. Other/cold instances are covered by the bounded
// freshness check in public-database-snapshot.ts.
let revision = 0

export function publicDatabaseRevision() { return revision }
export function markPublicDatabaseDirty() { revision += 1 }
