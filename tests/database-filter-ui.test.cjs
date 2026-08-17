const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const css = fs.readFileSync(path.join(root, 'src/app/globals.css'), 'utf8')
const component = fs.readFileSync(path.join(root, 'src/components/DatabaseClient.tsx'), 'utf8')
const databasePage = fs.readFileSync(path.join(root, 'src/app/database/page.tsx'), 'utf8')
const publicPage = fs.readFileSync(path.join(root, 'src/app/crm-serial-database/page.tsx'), 'utf8')

assert.match(css, /\.database-filter-wrap\s*\{[^}]*white-space:\s*nowrap;/)
assert.match(css, /\.database-filter-wrap select\s*\{[^}]*min-height:\s*44px;[^}]*font-weight:\s*400;/)
assert.match(css, /\.database-filter-wrap select option\s*\{[^}]*font-weight:\s*400;/)
assert.match(component, /className="database-filter-wrap"/)
assert.match(databasePage, /<DatabaseClient/)
assert.match(publicPage, /<DatabaseClient/)

console.log('database filter UI regression checks passed')