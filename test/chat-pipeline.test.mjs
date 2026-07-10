import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildRequestMessages,
  normalizeChatTemplateKwargs,
  extractStreamDelta,
  createRequestRegistry,
} from '../desktop/lib/chat-pipeline.mjs'

test('merges system messages at index zero and excludes local-only messages', () => {
  const result = buildRequestMessages([
    { role: 'user', content: 'one' },
    { role: 'system', content: 'alpha' },
    { role: 'assistant', content: 'broken', localOnly: true },
    { role: 'system', content: 'beta' },
  ])
  assert.deepEqual(result, [
    { role: 'system', content: 'alpha\n\nbeta' },
    { role: 'user', content: 'one' },
  ])
})

test('excludes failed partial assistant output from the next request', () => {
  const result = buildRequestMessages([
    { role: 'system', content: 'rules' },
    { role: 'user', content: 'question' },
    { role: 'assistant', content: 'partial answer', localOnly: true, state: 'failed' },
    { role: 'user', content: 'try again' },
  ])
  assert.deepEqual(result, [
    { role: 'system', content: 'rules' },
    { role: 'user', content: 'question' },
    { role: 'user', content: 'try again' },
  ])
})

test('normalizes JSON and CLI chat-template-kwargs forms', () => {
  assert.deepEqual(normalizeChatTemplateKwargs('{"enable_thinking":false}'), { enable_thinking: false })
  assert.deepEqual(
    normalizeChatTemplateKwargs('--chat-template-kwargs \'{\\"enable_thinking\\":false}\''),
    { enable_thinking: false },
  )
})

test('extracts structured reasoning fields without losing content', () => {
  assert.deepEqual(
    extractStreamDelta({ choices: [{ delta: { content: 'answer', reasoning_content: 'reason' } }] }),
    { content: 'answer', thinking: 'reason' },
  )
  assert.deepEqual(
    extractStreamDelta({ choices: [{ delta: { thinking: 'plan' } }] }),
    { content: '', thinking: 'plan' },
  )
})

test('cancels only the matching active request', () => {
  const registry = createRequestRegistry()
  const first = registry.start('first', 600000)
  const second = registry.start('second', 600000)
  assert.equal(registry.cancel('first'), true)
  assert.equal(first.aborted, true)
  assert.equal(second.aborted, false)
  registry.finish('second')
})

test('times out an active request and finish clears it', async () => {
  const registry = createRequestRegistry()
  const signal = registry.start('slow', 5)
  await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }))
  assert.equal(signal.aborted, true)
  assert.equal(signal.reason?.name, 'TimeoutError')
  assert.equal(registry.finish('slow'), true)
  assert.equal(registry.cancel('slow'), false)
})
