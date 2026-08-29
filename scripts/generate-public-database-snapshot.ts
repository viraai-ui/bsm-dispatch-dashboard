import { writeFile, rename } from 'node:fs/promises'
import { buildPublicDatabaseSnapshot } from '../src/lib/public-database-snapshot'

async function main() {
  const target = new URL('../data/public-database-snapshot.json', import.meta.url)
  const temporary = new URL(`../data/.public-database-snapshot.${process.pid}.tmp`, import.meta.url)
  const snapshot = await buildPublicDatabaseSnapshot()
  if (snapshot.rows.length < 1 || Object.keys(snapshot.details).length !== snapshot.rows.length) throw new Error('Refusing to replace last-known-good with incomplete snapshot')
  await writeFile(temporary, JSON.stringify(snapshot))
  await rename(temporary, target)
  console.log(JSON.stringify({ snapshotVersion:snapshot.snapshotVersion, rows:snapshot.rows.length, media:Object.keys(snapshot.media).length }))
}
main().catch(error => { console.error(error); process.exitCode = 1 })
