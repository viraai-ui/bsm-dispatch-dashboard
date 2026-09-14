const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
for (const relative of ['scripts/audit-serial-sheet-coverage.cjs', 'src/lib/serial-sheet-backup.ts']) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8')
  assert.match(source, /'Sr\. No\.25-26'/, `${relative} must use the exact legacy worksheet alias`)
  assert.doesNotMatch(source, /'Sr\.No\.25-26'/, `${relative} must not retain the nonexistent legacy worksheet alias`)
}

const audit = fs.readFileSync(path.join(root, 'scripts/audit-serial-sheet-coverage.cjs'), 'utf8')
assert.match(audit, /legacyDuplicateSheetSerialCount/)
assert.match(audit, /activeYearDuplicateSheetSerialCount/)
assert.match(audit, /nonSerialRepeatedValues/)
console.log('serial sheet audit config regression: ok')