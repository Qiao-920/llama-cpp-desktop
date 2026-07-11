import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
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

test('readiness checklist treats validation configExists false as stale config path', () => {
  const rows = readinessChecklist({
    config: {
      config_path: 'C:\\llama\\missing-config.toml',
    },
    validation: { configExists: false, serverExists: true, modelExists: true },
  })

  const configRow = rows.find(row => row.id === 'config')
  assert.equal(configRow.state, 'blocked')
  assert.equal(configRow.action, '选择 config.toml')
})

test('model capability labels text-only and vision projection configured setups', () => {
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
      mode: 'vision-configured',
      label: '视觉投影已配置',
      risk: 'warning',
      detail: 'LLaVA · 已配置 mmproj，需实测模型支持后再确认图片理解。',
    },
  )
})

test('model capability treats mmproj on a text model as configured projection, not guaranteed image understanding', () => {
  const capability = modelCapability({
    config: { model: 'D:\\models\\qwen-text.gguf', mmproj: 'D:\\models\\stale-mmproj.gguf' },
    modelInfo: { family: 'Qwen' },
  })

  assert.equal(capability.mode, 'vision-configured')
  assert.equal(capability.label, '视觉投影已配置')
  assert.equal(capability.risk, 'warning')
  assert.match(capability.detail, /已配置 mmproj/)
  assert.match(capability.detail, /需实测模型支持/)
  assert.doesNotMatch(JSON.stringify(capability), /视觉就绪|图片理解可用/)
})

test('model capability labels vision-hinted models without mmproj as needing projection', () => {
  const capability = modelCapability({
    config: { model: 'D:\\models\\llava.gguf', mmproj: '' },
    modelInfo: { modalities: ['image'], family: 'LLaVA' },
  })

  assert.equal(capability.mode, 'vision-needs-mmproj')
  assert.equal(capability.label, '需要 mmproj')
  assert.equal(capability.risk, 'warning')
  assert.match(capability.detail, /需要视觉投影文件/)
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

test('terminal diagnosis covers running, noisy, hidden, and empty terminal states', () => {
  const running = terminalDiagnosis({
    status: { state: 'running', message: 'ready at http://127.0.0.1:8080' },
    logs: { entries: [{ line: 'server ready' }], dropped: 0, truncated: 0 },
    terminalView: { entries: [{ line: 'server ready' }], hidden: 0, excluded: 0 },
  })
  assert.equal(running.label, '运行中')
  assert.equal(running.risk, 'good')
  assert.match(running.detail, /ready at http:\/\/127\.0\.0\.1:8080/)
  assert.match(running.detail, /1 条运行日志/)

  const noisy = terminalDiagnosis({
    status: { state: 'running', message: 'ready' },
    logs: { entries: [{ line: 'server ready' }], dropped: 3, truncated: 2 },
    terminalView: { entries: [{ line: 'server ready' }], hidden: 0, excluded: 14 },
  })
  assert.equal(noisy.risk, 'warning')
  assert.match(noisy.detail, /已排除 14 条/)
  assert.match(noisy.detail, /丢弃 3 条/)
  assert.match(noisy.detail, /截断 2 条/)

  const hidden = terminalDiagnosis({
    status: { state: 'starting', message: '' },
    logs: { entries: [{ line: 'loading model' }], dropped: 0, truncated: 0 },
    terminalView: { entries: [{ line: 'loading model' }], hidden: 520, excluded: 1 },
  })
  assert.equal(hidden.label, '启动中')
  assert.equal(hidden.risk, 'normal')
  assert.match(hidden.detail, /已隐藏 520 条/)

  const empty = terminalDiagnosis({
    status: { state: 'stopped', message: '' },
    logs: { entries: [] },
    terminalView: { entries: [], hidden: 0, excluded: 0 },
  })
  assert.equal(empty.label, '未运行')
  assert.equal(empty.risk, 'warning')
  assert.equal(empty.nextAction, '确认配置后启动服务。')
  assert.match(empty.detail, /0 条运行日志/)
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

test('runtime product copy used by Task 2 surfaces readable Chinese labels and actions', () => {
  const rows = readinessChecklist({
    config: { config_path: 'C:\\llama\\config.toml', model: 'D:\\models\\qwen.gguf' },
    validation: { configExists: true, serverExists: true, modelExists: false },
    status: { state: 'running', url: 'http://127.0.0.1:8080' },
    dirty: true,
  })
  const copy = JSON.stringify(rows)

  assert.match(copy, /配置文件/)
  assert.match(copy, /已找到配置文件/)
  assert.match(copy, /模型文件/)
  assert.match(copy, /选择 GGUF 模型/)
  assert.match(copy, /服务运行/)
  assert.match(copy, /服务正在运行/)
  assert.match(copy, /保存状态/)
  assert.match(copy, /保存当前配置/)
  assert.doesNotMatch(copy, /閰|嶇|鏂|妯|瀷|杩|绔|鐘/)
})

test('model capability copy distinguishes text, projection-configured, and mmproj-needed states in readable Chinese', () => {
  const textOnly = modelCapability({
    config: { mmproj: '' },
    modelInfo: { modalities: ['text'], family: 'Qwen' },
  })
  const visionReady = modelCapability({
    config: { mmproj: 'D:\\models\\mmproj.gguf' },
    modelInfo: { modalities: ['vision'], family: 'LLaVA' },
  })
  const needsMmproj = modelCapability({
    config: { mmproj: '' },
    modelInfo: { modalities: ['vision'], family: 'LLaVA' },
  })

  assert.equal(textOnly.label, '文本模型')
  assert.equal(visionReady.label, '视觉投影已配置')
  assert.equal(needsMmproj.label, '需要 mmproj')
  assert.doesNotMatch(JSON.stringify([textOnly, visionReady, needsMmproj]), /閰|嶇|鏂|妯|瀷|杩|绔|鐘/)
})

test('chat and model info surfaces include Task 2 product sections', async () => {
  const source = await readFile(new URL('../renderer/app.js', import.meta.url), 'utf8')

  assert.match(source, /readinessChecklist/)
  assert.match(source, /modelCapability/)
  assert.match(source, /运行检查/)
  assert.match(source, /模型能力/)
})

test('image support UI copy stays cautious about mmproj and unconfirmed model support', async () => {
  const source = await readFile(new URL('../renderer/app.js', import.meta.url), 'utf8')

  assert.match(source, /已配置 mmproj，需实测模型支持/)
  assert.match(source, /需要 mmproj/)
  assert.match(source, /未确认支持/)
  assert.doesNotMatch(source, /图片理解可用/)
})

test('terminal panel surfaces diagnostic summary and copy export action', async () => {
  const source = await readFile(new URL('../renderer/app.js', import.meta.url), 'utf8')

  assert.match(source, /terminalDiagnosis/)
  assert.match(source, /diagnosticBundleText/)
  assert.match(source, /data-action="copy-terminal-diagnostics"/)
  assert.match(source, /诊断摘要/)
  assert.match(source, /原始日志明细/)
})

test('terminal screen grid keeps console as the flexible fifth row', async () => {
  const source = await readFile(new URL('../renderer/styles.css', import.meta.url), 'utf8')
  const terminalBlocks = [...source.matchAll(/\.terminal-screen\s*\{[^}]*grid-template-rows:\s*([^;]+);/g)]

  assert.ok(terminalBlocks.length > 0, 'expected .terminal-screen grid row declarations')
  for (const block of terminalBlocks) {
    assert.match(block[1], /auto\s+auto\s+auto\s+auto\s+minmax\(0,\s*1fr\)/)
  }
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
