import test from 'node:test'
import assert from 'node:assert/strict'
import {
  diagnosticBundleText,
  modelCapability,
  readinessChecklist,
  sessionBudget,
  terminalDiagnosis,
} from '../renderer/lib/product-insights.js'

test('readiness checklist turns config, validation, status, and dirty state into actionable rows', () => {
  const rows = readinessChecklist({
    config: {
      config_path: 'C:\\llama\\config.toml',
      llama_server_path: 'C:\\llama\\llama-server.exe',
      model: 'D:\\models\\qwen.gguf',
    },
    validation: { configExists: true, serverExists: false, modelExists: true },
    status: { state: 'stopped', url: 'http://127.0.0.1:8080' },
    dirty: true,
  })

  assert.deepEqual(rows.map(row => row.id), ['config', 'server', 'model', 'service', 'saved', 'endpoint'])
  assert.deepEqual(rows.map(row => row.state), ['ready', 'blocked', 'ready', 'pending', 'warning', 'ready'])
  assert.equal(rows.find(row => row.id === 'server').action, '选择 llama-server.exe')
  assert.equal(rows.find(row => row.id === 'saved').action, '保存当前配置')
})

test('model capability labels text-only and vision-ready setups', () => {
  assert.deepEqual(
    modelCapability({
      config: { model: 'D:\\models\\qwen-text.gguf', mmproj: '' },
      modelInfo: { modalities: ['text'], family: 'Qwen' },
    }),
    {
      mode: 'text',
      label: '文本模型',
      risk: 'normal',
      detail: 'Qwen · 未配置 mmproj，适合纯文本对话。',
    },
  )

  assert.deepEqual(
    modelCapability({
      config: { model: 'D:\\models\\llava.gguf', mmproj: 'D:\\models\\mmproj.gguf' },
      modelInfo: { modalities: ['text', 'vision'], family: 'LLaVA' },
    }),
    {
      mode: 'vision',
      label: '视觉就绪',
      risk: 'good',
      detail: 'LLaVA · 已配置 mmproj，可尝试图片理解。',
    },
  )
})

test('terminal diagnosis summarizes status, risk, and next action from state and log stats', () => {
  assert.deepEqual(
    terminalDiagnosis({
      status: { state: 'error', message: 'port already in use' },
      logs: { entries: [{ line: 'error: port already in use' }], dropped: 4, truncated: 1 },
      terminalView: { hidden: 2, excluded: 7 },
    }),
    {
      label: '启动异常',
      risk: 'high',
      nextAction: '检查端口占用或更换服务端口后重试。',
      detail: 'port already in use · 1 条运行日志，已隐藏 2 条，已排除 7 条，丢弃 4 条，截断 1 条。',
    },
  )
})

test('session budget reports configured context and approximate used tokens', () => {
  const budget = sessionBudget({
    config: { ctx_size: 4096 },
    messages: [
      { role: 'user', content: 'hello world', tokenCount: 12 },
      { role: 'assistant', content: 'short reply', usage: { total_tokens: 23 } },
      { role: 'user', content: 'fallback estimate' },
    ],
  })

  assert.equal(budget.contextTokens, 4096)
  assert.equal(budget.usedTokens, 38)
  assert.equal(budget.remainingTokens, 4058)
  assert.equal(budget.percentUsed, 1)
  assert.equal(budget.label, '38 / 4096 tokens')
})

test('diagnostic bundle emits compact Chinese text with status, endpoint, model basename, log stats, and recent terminal lines', () => {
  const text = diagnosticBundleText({
    config: { model: 'D:\\models\\Qwen3-8B.Q4_K_M.gguf' },
    status: { state: 'running', message: 'ready', url: 'http://127.0.0.1:8080' },
    logs: { entries: [{ line: 'server starting' }, { line: 'server ready' }], filtered: 3, truncated: 1, dropped: 0 },
    terminalView: { entries: [{ line: 'load model' }, { line: 'listening on 8080' }], hidden: 0, excluded: 5 },
  })

  assert.match(text, /状态：running - ready/)
  assert.match(text, /端点：http:\/\/127\.0\.0\.1:8080\/v1/)
  assert.match(text, /模型：Qwen3-8B\.Q4_K_M\.gguf/)
  assert.match(text, /日志：2 条，过滤 3 条，排除 5 条，截断 1 条，丢弃 0 条/)
  assert.match(text, /最近终端：\n- load model\n- listening on 8080/)
})
