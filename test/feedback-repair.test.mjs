import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  clientSmokePlan,
  downloadGuidance,
  environmentIntegrity,
  firstRunSteps,
  hardwareRecommendation,
  integrationGuide,
  modelCapabilityCatalog,
  modelRecommendation,
  performanceHints,
  portDiagnosis,
  portRepairPlan,
  releaseCandidateChecklist,
  shouldShowFirstRunWizard,
  startupDiagnosis,
  supportBundleText,
} from '../renderer/lib/feedback-repair.js'

test('startup diagnosis identifies a CUDA runtime-only folder and gives a concrete next action', () => {
  const diagnosis = startupDiagnosis({
    config: {
      llama_bin_dir: 'D:\\llama\\cudart-llama-bin-win-cu12',
      llama_server_path: 'D:\\llama\\cudart-llama-bin-win-cu12\\llama-server.exe',
      model: 'D:\\models\\qwen.gguf',
    },
    validation: {
      serverExists: false,
      modelExists: true,
      runtimePackageKind: 'cuda-runtime-only',
      serverDirExists: true,
    },
  })

  assert.equal(diagnosis.level, 'blocked')
  assert.equal(diagnosis.title, '选到的是 CUDA 运行库包')
  assert.match(diagnosis.detail, /cudart/)
  assert.match(diagnosis.action, /完整 llama.cpp Windows 包/)
})

test('startup diagnosis prioritizes missing model and unsaved config after server is ready', () => {
  const missingModel = startupDiagnosis({
    config: { llama_server_path: 'D:\\llama\\llama-server.exe', model: '' },
    validation: { serverExists: true, modelExists: false },
  })
  assert.equal(missingModel.title, '还没有选择 GGUF 模型')
  assert.equal(missingModel.level, 'blocked')

  const unavailableModel = startupDiagnosis({
    config: { llama_server_path: 'D:\\llama\\llama-server.exe', model: 'D:\\models\\missing-qwen.gguf' },
    validation: { serverExists: true, modelExists: false },
  })
  assert.equal(unavailableModel.title, '模型路径暂时不可用')
  assert.equal(unavailableModel.level, 'blocked')
  assert.match(unavailableModel.detail, /missing-qwen\.gguf/)

  const unsaved = startupDiagnosis({
    config: { llama_server_path: 'D:\\llama\\llama-server.exe', model: 'D:\\models\\qwen.gguf' },
    validation: { serverExists: true, modelExists: true },
    dirty: true,
  })
  assert.equal(unsaved.title, '配置还没保存')
  assert.equal(unsaved.level, 'warning')
})

test('integration guide exposes exact OpenAI-compatible values for third-party clients', () => {
  const guide = integrationGuide({
    config: { model: 'D:\\models\\Qwen3-8B.Q4_K_M.gguf' },
    status: { url: 'http://127.0.0.1:8080' },
  })

  assert.equal(guide.baseUrl, 'http://127.0.0.1:8080/v1')
  assert.equal(guide.chatCompletionsUrl, 'http://127.0.0.1:8080/v1/chat/completions')
  assert.equal(guide.modelName, 'Qwen3-8B.Q4_K_M.gguf')
  assert.match(guide.copyText, /OpenAI Base URL: http:\/\/127\.0\.0\.1:8080\/v1/)
  assert.match(guide.copyText, /Model: Qwen3-8B\.Q4_K_M\.gguf/)
})

test('performance hints warn about large context, aggressive GPU layers, and short timeout', () => {
  const hints = performanceHints({
    config: {
      ctx_size: 131072,
      n_gpu_layers: 99,
      batch_size: 4096,
      request_timeout_ms: 10000,
      host: '0.0.0.0',
    },
  })

  assert.deepEqual(hints.map(item => item.id), ['huge-context', 'aggressive-gpu-layers', 'large-batch', 'short-timeout', 'public-host'])
  assert.match(hints.find(item => item.id === 'huge-context').action, /32768/)
})

test('first run steps combine blocking and warning guidance in a stable order', () => {
  const steps = firstRunSteps({
    config: { model: '', mmproj: '' },
    validation: { serverExists: false, modelExists: false },
    status: { state: 'stopped' },
    dirty: true,
  })

  assert.deepEqual(steps.map(item => item.id), ['server', 'model', 'save', 'start', 'integration'])
  assert.equal(steps[0].state, 'blocked')
  assert.equal(steps[2].state, 'warning')

  const pathUnavailable = firstRunSteps({
    config: { model: 'D:\\models\\missing-qwen.gguf' },
    validation: { serverExists: true, modelExists: false },
    status: { state: 'stopped' },
  })
  assert.equal(pathUnavailable[1].state, 'warning')
  assert.match(pathUnavailable[1].detail, /missing-qwen\.gguf/)
})

test('support bundle includes startup, integration, performance, and multimodal context', () => {
  const text = supportBundleText({
    config: { model: 'D:\\models\\llava.gguf', mmproj: '', ctx_size: 131072, n_gpu_layers: 99 },
    validation: { serverExists: true, modelExists: true },
    status: { state: 'error', message: 'port already in use', url: 'http://127.0.0.1:8080' },
    dirty: false,
  })

  assert.match(text, /启动诊断/)
  assert.match(text, /OpenAI Base URL/)
  assert.match(text, /性能提醒/)
  assert.match(text, /图片理解/)
  assert.match(text, /llava\.gguf/)
})

test('settings rescue source keeps product repair entry points discoverable', async () => {
  const source = await readFile(new URL('../renderer/app.js', import.meta.url), 'utf8')

  assert.match(source, /启动救援/)
  assert.match(source, /copy-integration-guide/)
  assert.match(source, /copy-support-bundle/)
  assert.match(source, /第三方接入/)
  assert.match(source, /图片理解/)
})

test('first-run wizard opens only when setup is incomplete or explicitly requested', () => {
  assert.equal(
    shouldShowFirstRunWizard({
      config: { model: '' },
      validation: { serverExists: false, modelExists: false },
      status: { state: 'stopped' },
      seen: false,
    }),
    true,
  )

  assert.equal(
    shouldShowFirstRunWizard({
      config: { model: 'D:\\models\\qwen.gguf' },
      validation: { serverExists: true, modelExists: true },
      status: { state: 'running' },
      seen: true,
    }),
    false,
  )

  assert.equal(
    shouldShowFirstRunWizard({
      config: { model: '' },
      validation: { serverExists: false, modelExists: false },
      status: { state: 'stopped' },
      seen: true,
    }),
    false,
  )
})

test('environment integrity reports blockers and non-blocking runtime warnings', () => {
  const missingServer = environmentIntegrity({
    config: { llama_bin_dir: 'D:\\llama\\cudart', llama_server_path: 'D:\\llama\\cudart\\llama-server.exe' },
    validation: { serverExists: false, runtimePackageKind: 'cuda-runtime-only', runtimeIssues: [{ id: 'missing-server', level: 'blocked' }] },
  })
  assert.equal(missingServer.summary.level, 'blocked')
  assert.match(missingServer.summary.action, /完整 llama.cpp/)

  const suspicious = environmentIntegrity({
    config: { llama_server_path: 'D:\\llama\\llama-server.exe' },
    validation: {
      serverExists: true,
      runtimePackageKind: 'llama-server-package',
      runtimeIssues: [{ id: 'cuda-dll-hint-missing', level: 'warning', message: '未看到 ggml-cuda.dll' }],
    },
  })
  assert.equal(suspicious.summary.level, 'warning')
  assert.equal(suspicious.rows.find(row => row.id === 'server').state, 'ready')
  assert.equal(suspicious.rows.find(row => row.id === 'cuda-dll-hint-missing').state, 'warning')
})

test('port diagnosis distinguishes service, OpenAI endpoint, and chat route states', () => {
  const unchecked = portDiagnosis({ ok: null, kind: 'unchecked', url: 'http://127.0.0.1:8080' })
  assert.equal(unchecked.level, 'warning')

  const offline = portDiagnosis({ ok: false, kind: 'network-error', url: 'http://127.0.0.1:8080', message: 'fetch failed' })
  assert.equal(offline.level, 'blocked')
  assert.match(offline.title, /未响应/)
  assert.match(offline.action, /启动/)

  const wrongService = portDiagnosis({
    ok: false,
    kind: 'not-openai-compatible',
    url: 'http://127.0.0.1:8080',
    checks: [{ id: 'base', ok: true }, { id: 'models', ok: false, status: 404 }],
  })
  assert.equal(wrongService.level, 'blocked')
  assert.match(wrongService.action, /确认端口/)

  const brokenChat = portDiagnosis({
    ok: true,
    kind: 'openai-compatible',
    url: 'http://127.0.0.1:8080',
    checks: [{ id: 'base', ok: true }, { id: 'models', ok: true }, { id: 'chat', ok: false, status: 404 }],
  })
  assert.equal(brokenChat.level, 'blocked')

  const healthy = portDiagnosis({
    ok: true,
    kind: 'openai-compatible',
    url: 'http://127.0.0.1:8080',
    checks: [{ id: 'base', ok: true }, { id: 'models', ok: true }, { id: 'chat', ok: true, status: 405 }],
  })
  assert.equal(healthy.level, 'good')
  assert.match(healthy.detail, /\/v1/)
})

test('model recommendation gives conservative setup profiles from model names', () => {
  const small = modelRecommendation({ config: { model: 'D:\\models\\Qwen3-8B.Q4_K_M.gguf', ctx_size: 131072, n_gpu_layers: 99 } })
  assert.equal(small.sizeClass, '8B')
  assert.equal(small.profile.ctxSize, 32768)
  assert.equal(small.profile.gpuLayers, 35)
  assert.match(small.reason, /保守/)

  const large = modelRecommendation({ config: { model: 'D:\\models\\Qwen2.5-32B-Instruct-Q4_K_M.gguf' } })
  assert.equal(large.sizeClass, '32B')
  assert.equal(large.profile.ctxSize, 16384)
  assert.match(large.warnings.join(' '), /内存/)
})

test('first-run wizard UI source exposes reopen, environment, port, and recommendation surfaces', async () => {
  const source = await readFile(new URL('../renderer/app.js', import.meta.url), 'utf8')

  assert.match(source, /首次启动向导/)
  assert.match(source, /open-first-run-wizard/)
  assert.match(source, /close-first-run-wizard/)
  assert.match(source, /环境完整性/)
  assert.match(source, /端口诊断/)
  assert.match(source, /推荐参数/)
})

test('main process health check contract includes richer endpoint diagnosis while keeping legacy fields', async () => {
  const source = await readFile(new URL('../desktop/main.mjs', import.meta.url), 'utf8')

  assert.match(source, /kind: 'openai-compatible'/)
  assert.match(source, /checks/)
  assert.match(source, /\/v1\/models/)
  assert.match(source, /\/v1\/chat\/completions/)
  assert.match(source, /runtimeIssues/)
})

test('product closure helpers provide download, port, hardware, client, model, and package guidance', () => {
  const download = downloadGuidance()
  assert.match(download.releaseUrl, /github\.com\/ggml-org\/llama\.cpp\/releases\/latest/)
  assert.equal(download.keywords.some(item => /win.*cuda/i.test(item)), true)

  const port = portRepairPlan({
    config: { port: 8080 },
    status: { state: 'error', message: 'address already in use' },
    inspection: { occupied: true, suggestedPort: 8081, processes: [{ pid: 1234, name: 'other.exe' }] },
  })
  assert.equal(port.level, 'blocked')
  assert.equal(port.suggestedPort, 8081)
  assert.equal(port.canApply, true)
  assert.match(port.action, /8081/)

  const hardware = hardwareRecommendation({
    config: { model: 'D:\\models\\Qwen2.5-32B-Instruct-Q4_K_M.gguf' },
    systemInfo: { totalMemoryGB: 32, cpuThreads: 16, gpus: [{ name: 'NVIDIA RTX', adapterRAMGB: 8 }] },
  })
  assert.equal(hardware.rows.some(row => row.id === 'memory'), true)
  assert.equal(hardware.rows.some(row => row.id === 'gpu'), true)
  assert.match(hardware.summary.action, /VRAM|显存/)

  const smoke = clientSmokePlan({
    config: { model: 'D:\\models\\Qwen3-8B.gguf' },
    status: { url: 'http://127.0.0.1:8080' },
    smoke: { ok: true, latencyMs: 1200 },
  })
  assert.equal(smoke.level, 'good')
  assert.match(smoke.templateText, /OpenAI Base URL/)
  assert.match(smoke.templateText, /Qwen3-8B\.gguf/)

  const capability = modelCapabilityCatalog({ config: { model: 'D:\\models\\qwen2-vl.gguf', mmproj: '' } })
  assert.equal(capability.mode, 'vision-needs-mmproj')
  assert.equal(capability.rows.some(row => row.id === 'catalog'), true)

  const release = releaseCandidateChecklist({ build: { packaged: true, shortcut: true, opened: true, screenshots: 3 } })
  assert.equal(release.summary.level, 'good')
  assert.equal(release.rows.find(row => row.id === 'screenshots').state, 'ready')
})

test('renderer exposes product closure surfaces and actions', async () => {
  const source = await readFile(new URL('../renderer/app.js', import.meta.url), 'utf8')
  const styles = await readFile(new URL('../renderer/styles.css', import.meta.url), 'utf8')

  for (const token of [
    'onboarding-action-panel',
    'run-check-details',
    'toggle-run-check',
    'open-downloads',
    'copy-download-guidance',
    'inspect-port',
    'apply-port-fix',
    'client-smoke-test',
    'copy-feedback-bundle',
  ]) {
    assert.match(source, new RegExp(token))
  }

  assert.match(styles, /@media \(max-width: 760px\)/)
  assert.match(styles, /\.main-area/)
  assert.match(styles, /\.onboarding-action-panel/)
  assert.match(styles, /\.chat-screen\.setup-onboarding/)
  assert.match(styles, /\.onboarding-run-check/)
  assert.match(source, /isSetupOnboarding = isEmptyChat && state\.status\.state !== 'running' && !state\.chatBusy/)
  assert.match(source, /renderOnboardingActionPanel\(isSetupOnboarding\)/)
  assert.match(source, /hasChatMessages = state\.chatMessages\.length > 0/)
  assert.match(source, /if \(!hasChatMessages\) \{\s*chatFeed\.scrollTop = options\.preserveChatScroll && previousFeed \? previousFeedTop : 0/s)
})

test('main and preload expose non-destructive repair IPC contracts', async () => {
  const main = await readFile(new URL('../desktop/main.mjs', import.meta.url), 'utf8')
  const preload = await readFile(new URL('../desktop/preload.cjs', import.meta.url), 'utf8')

  for (const token of ['llama:get-system-info', 'llama:inspect-port', 'llama:client-smoke-test']) {
    assert.match(main, new RegExp(token))
  }

  for (const token of ['getSystemInfo', 'inspectPort', 'clientSmokeTest']) {
    assert.match(preload, new RegExp(token))
  }

  assert.doesNotMatch(main, /kill-port|Stop-Process.*port|taskkill.*inspect-port/i)
})
