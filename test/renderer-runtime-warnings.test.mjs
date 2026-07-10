import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../renderer/app.js', import.meta.url), 'utf8')

test('refreshes unsaved setting warnings from the shared runtime policy', () => {
  assert.match(source, /import\s*\{\s*runtimeWarnings\s*\}\s*from\s*'\.\.\/desktop\/lib\/runtime-policy\.mjs'/)
  assert.match(source, /function refreshConfigWarnings\(\)[\s\S]*runtimeWarnings\(state\.config\)/)
  assert.match(source, /state\.dirty = true\s*;?\s*refreshConfigWarnings\(\)/)
})
