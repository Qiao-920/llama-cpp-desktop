import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const gitignore = readFileSync('.gitignore', 'utf8')
const workflow = readFileSync('.github/workflows/release.yml', 'utf8')
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'))
const builderConfig = readFileSync('electron-builder.yml', 'utf8')

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function readBuilderScalar(key) {
  const match = builderConfig.match(new RegExp(`^\\s*${key}:\\s*(.+)$`, 'm'))
  assert.ok(match, `electron-builder.yml must define ${key}`)
  return match[1].trim().replace(/^['"]|['"]$/g, '')
}

const builderProductName = readBuilderScalar('productName')
const artifactName = readBuilderScalar('artifactName')
const outputDirectory = readBuilderScalar('output')
const executableName = artifactName.replace('${ext}', 'exe')
const executablePath = `${outputDirectory}/${executableName}`
const checksumPath = `${executablePath}.sha256`
const releaseTitle = `${packageJson.productName} \${{ github.ref_name }}`

test('ignores all dist variants', () => assert.match(gitignore, /^dist-\*\/$/m))

test('workflow validates strict semver tag against package version', () => {
  assert.match(workflow, /\^v\\d\+\\\.\\d\+\\\.\\d\+\$/)
  assert.match(workflow, /package\.json/)
  assert.match(workflow, /github\.ref_name/)
  assert.match(workflow, /if \(\$tag -ne \$expectedTag\) \{/)
  assert.match(workflow, /throw "Release tag \$tag does not match package\.json version \$\(\$package\.version\)"/)
})

test('workflow release identity follows package and builder configuration', () => {
  assert.equal(packageJson.productName, builderProductName)
  assert.match(artifactName, /\$\{ext\}/)
  assert.match(workflow, new RegExp(`^\\s*name: ${escapeRegExp(releaseTitle)}\\s*$`, 'm'))
  assert.match(workflow, new RegExp(`Get-FileHash -LiteralPath "${escapeRegExp(executablePath)}"`))
  assert.match(workflow, new RegExp(`Set-Content -LiteralPath "${escapeRegExp(checksumPath)}"`))
  assert.match(workflow, new RegExp(`^\\s*${escapeRegExp(executablePath)}\\s*$`, 'm'))
  assert.match(workflow, new RegExp(`^\\s*${escapeRegExp(checksumPath)}\\s*$`, 'm'))
  assert.match(workflow, /generate_release_notes:\s*true/)
})
