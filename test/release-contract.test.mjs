import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const gitignore = readFileSync('.gitignore', 'utf8')
const workflow = readFileSync('.github/workflows/release.yml', 'utf8')

test('ignores all dist variants', () => assert.match(gitignore, /^dist-\*\/$/m))

test('workflow validates strict semver tag against package version', () => {
  assert.match(workflow, /\^v\\d\+\\\.\\d\+\\\.\\d\+\$/)
  assert.match(workflow, /package\.json/)
  assert.match(workflow, /github\.ref_name/)
})

test('workflow uploads the configured exe and sha256 and generates notes', () => {
  assert.match(workflow, /dist\/Llama\.cpp-Desktop\.exe\r?\n/)
  assert.match(workflow, /dist\/Llama\.cpp-Desktop\.exe\.sha256/)
  assert.match(workflow, /generate_release_notes:\s*true/)
})
