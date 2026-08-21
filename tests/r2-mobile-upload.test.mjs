import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const route = await readFile(new URL('../src/app/api/r2/upload-target/route.ts', import.meta.url), 'utf8')

test('upload target repairs R2 CORS before returning a mobile browser target', () => {
  assert.match(route, /import \{[^}]*ensureR2Cors[^}]*\} from '@\/lib\/r2'/)
  assert.match(route, /const initial = await checkBrowserCors\(uploadUrl\)/)
  assert.match(route, /if \(initial\.corsReady\) return initial/)
  assert.match(route, /await ensureR2Cors\(\)[\s\S]*return await checkBrowserCors\(uploadUrl\)/)
  assert.match(route, /const cors = await ensureBrowserCors\(target\.uploadUrl\)/)
})