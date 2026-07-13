import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildChatRequestBody,
  buildRequestMessages,
  chatQualityDefaults,
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

test('quality defaults match llama.cpp web reasoning-friendly sampling', () => {
  assert.deepEqual(chatQualityDefaults('quality'), {
    chat_quality_mode: 'quality',
    chat_template_kwargs: '',
    temp: 1,
    top_k: 20,
    top_p: 0.95,
    min_p: 0.05,
    presence_penalty: 0,
    repeat_penalty: '',
    expand_thinking: false,
    timings_per_token: true,
  })
  assert.equal(chatQualityDefaults('fast').chat_template_kwargs, '{"enable_thinking": false}')
})

test('chat request body sends visible sampling controls and native timing request', () => {
  const body = buildChatRequestBody({
    model: 'G:/models/Qwen.gguf',
    temp: 1,
    top_k: 20,
    top_p: 0.95,
    min_p: 0.05,
    presence_penalty: 0,
    repeat_penalty: 1,
    n_predict: 512,
    chat_template_kwargs: '',
  }, [{ role: 'user', content: 'write code' }], true)

  assert.deepEqual(body, {
    model: 'Qwen.gguf',
    messages: [{ role: 'user', content: 'write code' }],
    temperature: 1,
    top_k: 20,
    top_p: 0.95,
    min_p: 0.05,
    presence_penalty: 0,
    repeat_penalty: 1,
    max_tokens: 512,
    stream: true,
    timings_per_token: true,
  })
  assert.equal('chat_template_kwargs' in body, false)
})

test('quality request avoids reasoning overkill for simple prompts', () => {
  const body = buildChatRequestBody({
    model: 'G:/models/Qwen.gguf',
    chat_quality_mode: 'quality',
    n_predict: -1,
    chat_template_kwargs: '',
  }, [{ role: 'user', content: '你好' }], true)

  assert.deepEqual(body.chat_template_kwargs, { enable_thinking: false })
  assert.equal(body.max_tokens, 512)
})

test('quality request keeps reasoning for substantial prompts with a bounded output', () => {
  const body = buildChatRequestBody({
    model: 'G:/models/Qwen.gguf',
    chat_quality_mode: 'quality',
    n_predict: -1,
    chat_template_kwargs: '',
  }, [{ role: 'user', content: '按照你的想法写一个粒子网页，要求完整 HTML、CSS 和 JavaScript，并解释设计思路。' }], true)

  assert.equal('chat_template_kwargs' in body, false)
  assert.equal(body.max_tokens, 4096)
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

test('replacing a request id aborts the previous request before registering the new one', () => {
  const registry = createRequestRegistry()
  const first = registry.start('same-id', 600000)
  const second = registry.start('same-id', 600000)

  assert.equal(first.aborted, true)
  assert.equal(first.reason?.name, 'AbortError')
  assert.equal(second.aborted, false)
  assert.equal(registry.cancel('same-id'), true)
  assert.equal(second.aborted, true)
  assert.equal(registry.cancel('same-id'), false)
})

test('finishing a superseded request does not unregister its replacement', () => {
  const registry = createRequestRegistry()
  const first = registry.start('same-id', 600000)
  const second = registry.start('same-id', 600000)

  assert.equal(registry.finish('same-id', first), false)
  assert.equal(registry.cancel('same-id'), true)
  assert.equal(second.aborted, true)
})

test('removes a timed-out request from the registry immediately', async () => {
  const registry = createRequestRegistry()
  const signal = registry.start('slow', 5)
  await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }))

  assert.equal(signal.aborted, true)
  assert.equal(signal.reason?.name, 'TimeoutError')
  assert.equal(registry.cancel('slow'), false)
})
