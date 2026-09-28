// Scoped operator runner: never invokes append/replace or changes workflow state.
// node --env-file=.env.production.local --import tsx scripts/backfill-serial-vendors.ts <private-before-directory> --apply
import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { withSerialSheetLock } from '../src/lib/serial-sheet-lock'
import { updateSerialVendorsInZohoSheet } from '../src/lib/serial-sheet-backup'
import type { MachineUnit } from '../src/types/domain'
const require = createRequire(import.meta.url)
const verifier = require('./verify-serial-vendors.cjs')
async function main() {
  const dir = process.argv[2]
  if (!dir || process.argv[3] !== '--apply') throw new Error('Requires private backup directory and explicit --apply')
  const approved = JSON.parse(fs.readFileSync(path.join(dir, 'vendor-report.json'), 'utf8')).diff
  const original = JSON.parse(fs.readFileSync(path.join(dir, 'sheet-raw.json'), 'utf8'))
  const journal: unknown[] = []
  const save = (name: string, value: unknown) => fs.writeFileSync(path.join(dir, name), JSON.stringify(value, null, 2), { mode: 0o600 })
  const result = await withSerialSheetLock(async () => {
    const snapshot = await verifier.readSnapshot()
    assert.deepEqual(verifier.cells(snapshot), verifier.cells(original), 'Sheet changed since approval; rerun dry-run')
    const sources = verifier.workflowSources(verifier.readWorkflow())
    const fresh = verifier.inspect(snapshot, sources)
    assert.deepEqual(fresh.diff, approved, 'Workflow source changed since approval')
    save('locked-dry-run.json', fresh)
    for (let i = 0; i < approved.length; i += 20) {
      const batch = approved.slice(i, i + 20)
      // Revalidate source authority each batch; never use an Inventory fallback.
      const current = verifier.workflowSources(verifier.readWorkflow())
      for (const item of batch) assert.equal(current.filter((s: any) => s.serial === item.serial && s.vendor === item.after).length, 1, 'Authority changed')
      const machines = batch.map((item: any) => ({ serialNumber: item.serial, vendor: item.after })) as MachineUnit[]
      const response = await updateSerialVendorsInZohoSheet(machines)
      journal.push({ at: new Date().toISOString(), offset: i, response })
      save('write-journal.json', journal)
      console.log(JSON.stringify({ offset: i, ...response }))
      if (!response.configured || response.errors.length) throw new Error('Batch failed; inspect private journal, no blind retry')
    }
    const after = await verifier.readSnapshot()
    save('locked-after.json', after)
    const beforeCells = verifier.cells(original), afterCells = verifier.cells(after)
    const changed = [...new Set([...Object.keys(beforeCells), ...Object.keys(afterCells)])].filter(key => JSON.stringify(beforeCells[key]) !== JSON.stringify(afterCells[key]))
    assert.deepEqual(changed.sort(), approved.map((x: any) => `${x.row}:${x.column}`).sort(), 'Unapproved cell differences')
    for (const item of approved) assert.equal(String(afterCells[`${item.row}:${item.column}`]?.content), item.after)
    const final = verifier.inspect(after, sources)
    assert.equal(final.physicalRows, fresh.physicalRows)
    assert.equal(final.diff.length, 0)
    const repeat = await updateSerialVendorsInZohoSheet(approved.map((x: any) => ({ serialNumber: x.serial, vendor: x.after })) as MachineUnit[])
    assert.equal(repeat.synced, 0)
    assert.equal(repeat.errors.length, 0)
    save('acceptance.json', { changed: changed.length, physicalRows: final.physicalRows, unknown: final.unknown.length, conflicts: final.conflicts, repeat, samples: final.samples })
    return { changed: changed.length, repeat: repeat.synced }
  })
  if (!result) throw new Error('Lock busy; no writes')
  console.log(JSON.stringify(result))
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
