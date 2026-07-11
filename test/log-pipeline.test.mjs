import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  appendVisibleLogs,
  createLogChunkBuffers,
  flushLogChunkBuffer,
  isImportantRuntimeLine,
  processBufferedLogChunk,
  processLogChunk,
  selectVisibleTerminalLogs,
} from '../desktop/lib/log-pipeline.mjs'

const rendererSource = readFileSync(new URL('../renderer/app.js', import.meta.url), 'utf8')

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
  assert.equal(isImportantRuntimeLine('request chat-123: 2 messages -> http://127.0.0.1:8080/v1/chat/completions'), true)
  assert.equal(isImportantRuntimeLine('stream done: 42 approx tokens, 1.2s'), true)
  assert.equal(isImportantRuntimeLine('plain application output'), false)
})

test('reports terminal relevance exclusions and entries hidden by the 520-line visible cap', () => {
  const result = selectVisibleTerminalLogs(
    [
      { source: 'stdout', line: 'plain application output' },
      ...Array.from({ length: 521 }, (_, index) => ({
        source: 'stdout',
        line: `server listening line ${index}`,
      })),
    ],
    520,
  )

  assert.equal(result.entries.length, 520)
  assert.equal(result.excluded, 1)
  assert.equal(result.hidden, 1)
  assert.equal(result.entries[0].line, 'server listening line 1')
})

test('terminal summary reports entries excluded by the relevance filter', () => {
  assert.match(rendererSource, /terminalView\.excluded/)
})

test('buffers split filter patterns independently for each source', () => {
  const buffers = createLogChunkBuffers()
  const results = [
    processBufferedLogChunk(buffers, 'stdout', 'http: streamed '),
    processBufferedLogChunk(buffers, 'stderr', 'que start_loop: wai'),
    processBufferedLogChunk(buffers, 'stdout', 'chunk: data: {"choices":[]}\n'),
    processBufferedLogChunk(buffers, 'stderr', 'ting for new tasks\n'),
  ]

  assert.deepEqual(results.flatMap(result => result.entries), [])
  assert.equal(results.reduce((count, result) => count + result.filtered, 0), 2)
  assert.deepEqual(flushLogChunkBuffer(buffers, 'stdout').entries, [])
  assert.deepEqual(flushLogChunkBuffer(buffers, 'stderr').entries, [])
})

test('truncates a split long line when its pending buffer is flushed', () => {
  const buffers = createLogChunkBuffers()
  const line = `server: ${'x'.repeat(500)}`

  const first = processBufferedLogChunk(buffers, 'stdout', line.slice(0, 200))
  const second = processBufferedLogChunk(buffers, 'stdout', line.slice(200))
  const flushed = flushLogChunkBuffer(buffers, 'stdout')

  assert.deepEqual(first.entries, [])
  assert.deepEqual(second.entries, [])
  assert.equal(flushed.entries.length, 1)
  assert.equal(flushed.truncated, 1)
  assert.match(flushed.entries[0].line, /^server: x+ \.\.\. \[truncated \d+ chars\]$/)
})
