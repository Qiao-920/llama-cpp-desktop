import test from 'node:test'
import assert from 'node:assert/strict'
import * as runtimePolicy from '../desktop/lib/runtime-policy.mjs'

const { DEFAULT_HOST, runtimeWarnings, assertNoCoreArgConflicts, serviceUrls } = runtimePolicy

test('defaults to loopback host', () => assert.equal(DEFAULT_HOST, '127.0.0.1'))
test('warns for public bind, high context, and short timeout', () => {
  const ids = runtimeWarnings({ host: '0.0.0.0', ctx_size: 65537, request_timeout_ms: 29999 }).map(item => item.id)
  assert.deepEqual(ids, ['public-host', 'high-context', 'short-timeout'])
})
test('rejects extra args that override UI-owned values', () => {
  assert.throws(() => assertNoCoreArgConflicts('--port 9000 --ctx-size=131072'), /--port, --ctx-size/)
})
test('rejects quoted UI-owned flags after shell-style splitting', () => {
  assert.throws(() => assertNoCoreArgConflicts('"--host" 0.0.0.0'), /--host/)
})
test('canonicalizes common llama-server aliases before rejecting UI-owned overrides', () => {
  assert.throws(
    () => assertNoCoreArgConflicts('-c 4096 -m model.gguf -t 8 -b 256 -ub 128 -ngl 99 --gpu-layers 99'),
    /--ctx-size, --model, --threads, --batch-size, --ubatch-size, --n-gpu-layers/,
  )
})
test('reports the configured listener and usable local URL separately', () => {
  assert.deepEqual(serviceUrls({ host: '0.0.0.0', port: 8080 }), {
    listenBaseUrl: 'http://0.0.0.0:8080',
    localBaseUrl: 'http://127.0.0.1:8080',
    chatCompletionsUrl: 'http://127.0.0.1:8080/v1/chat/completions'
  })
})
test('formats IPv6 listener and loopback URLs with brackets', () => {
  assert.deepEqual(serviceUrls({ host: '::', port: 8080 }), {
    listenBaseUrl: 'http://[::]:8080',
    localBaseUrl: 'http://127.0.0.1:8080',
    chatCompletionsUrl: 'http://127.0.0.1:8080/v1/chat/completions'
  })
  assert.deepEqual(serviceUrls({ host: '::1', port: 8080 }), {
    listenBaseUrl: 'http://[::1]:8080',
    localBaseUrl: 'http://[::1]:8080',
    chatCompletionsUrl: 'http://[::1]:8080/v1/chat/completions'
  })
})
test('validates start prerequisites before persistence', () => {
  const config = {
    launch_mode: 'direct',
    llama_server_path: 'C:\\llama-server.exe',
    model: 'C:\\missing.gguf',
  }
  assert.throws(() => runtimePolicy.assertStartableServerConfig(config, filePath => filePath !== config.model), /模型文件/)
})
