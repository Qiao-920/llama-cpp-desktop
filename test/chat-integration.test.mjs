import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const mainSource = readFileSync(new URL('../desktop/main.mjs', import.meta.url), 'utf8')
const preloadSource = readFileSync(new URL('../desktop/preload.cjs', import.meta.url), 'utf8')
const rendererSource = readFileSync(new URL('../renderer/app.js', import.meta.url), 'utf8')

test('both chat IPC handlers use the shared request message pipeline', () => {
  const completion = mainSource.match(/ipcMain\.handle\('llama:chat-completion'[\s\S]*?\n  \}\)/)?.[0] || ''
  const stream = mainSource.match(/ipcMain\.handle\('llama:chat-stream'[\s\S]*?\n  \}\)/)?.[0] || ''
  assert.match(completion, /buildRequestMessages\(/)
  assert.match(stream, /buildRequestMessages\(/)
})

test('main and preload expose request-scoped chat cancellation', () => {
  assert.match(mainSource, /ipcMain\.handle\('llama:cancel-chat'/)
  assert.match(mainSource, /requestRegistry\.cancel\(/)
  assert.match(preloadSource, /cancelChat:\s*requestId\s*=>\s*ipcRenderer\.invoke\('llama:cancel-chat'/)
})

test('streaming forwards structured thinking separately from content', () => {
  assert.match(mainSource, /extractStreamDelta\(/)
  assert.match(mainSource, /thinkingDelta/)
  assert.match(rendererSource, /payload\.thinkingDelta/)
})

test('renderer keeps failed output local and offers a stop action while busy', () => {
  assert.match(rendererSource, /assistant\.localOnly\s*=\s*true/)
  assert.match(rendererSource, /assistant\.requestId\s*=\s*requestId/)
  assert.match(rendererSource, /data-action="cancel-chat"/)
  assert.match(rendererSource, /window\.llamaDesktop\.cancelChat\(requestId\)/)
})
