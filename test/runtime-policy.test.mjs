import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_HOST, runtimeWarnings, assertNoCoreArgConflicts, serviceUrls } from '../desktop/lib/runtime-policy.mjs'

test('defaults to loopback host', () => assert.equal(DEFAULT_HOST, '127.0.0.1'))
test('warns for public bind, high context, and short timeout', () => {
  const ids = runtimeWarnings({ host: '0.0.0.0', ctx_size: 65537, request_timeout_ms: 29999 }).map(item => item.id)
  assert.deepEqual(ids, ['public-host', 'high-context', 'short-timeout'])
})
test('rejects extra args that override UI-owned values', () => {
  assert.throws(() => assertNoCoreArgConflicts('--port 9000 --ctx-size=131072'), /--port, --ctx-size/)
})
test('reports the configured listener and usable local URL separately', () => {
  assert.deepEqual(serviceUrls({ host: '0.0.0.0', port: 8080 }), {
    listenBaseUrl: 'http://0.0.0.0:8080',
    localBaseUrl: 'http://127.0.0.1:8080',
    chatCompletionsUrl: 'http://127.0.0.1:8080/v1/chat/completions'
  })
})
