import test from 'node:test'
import assert from 'node:assert/strict'
import { appendVisibleLogs, isImportantRuntimeLine, processLogChunk } from '../desktop/lib/log-pipeline.mjs'

test('filters streamed JSON, prompt, code echo, and idle polling', () => {
  const input = ['http: streamed chunk: data: {"choices":[]}', 'prompt: <|im_start|>user', '<div>echo</div>', 'body { color: red; }', 'const answer = 1;', 'que start_loop: waiting for new tasks'].join('\n')
  const result = processLogChunk('stdout', input)
  assert.deepEqual(result.entries, [])
  assert.equal(result.filtered, 6)
})

test('keeps CPU CUDA Metal listener and error lines', () => {
  const input = ['CPU backend loaded', 'CUDA0 ready', 'Metal device selected', 'server listening at 127.0.0.1:8080', 'error: port in use'].join('\n')
  assert.equal(processLogChunk('stdout', input).entries.length, 5)
})

test('tracks filtered truncated and capacity-dropped counts separately', () => {
  let state = { entries: [], filtered: 2, truncated: 1, dropped: 0 }
  state = appendVisibleLogs(state, Array.from({ length: 521 }, (_, index) => ({ source: 'stdout', line: `line ${index}` })), 520)
  assert.equal(state.entries.length, 520)
  assert.deepEqual({ filtered: state.filtered, truncated: state.truncated, dropped: state.dropped }, { filtered: 2, truncated: 1, dropped: 1 })
})

test('recognizes the runtime lines retained by the terminal', () => {
  assert.equal(isImportantRuntimeLine('CUDA0 ready'), true)
  assert.equal(isImportantRuntimeLine('server listening at 127.0.0.1:8080'), true)
  assert.equal(isImportantRuntimeLine('plain application output'), false)
})
