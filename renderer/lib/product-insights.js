function present(value) {
  return String(value ?? '').trim().length > 0
}

function basename(filePath) {
  return String(filePath ?? '').split(/[\\/]/).filter(Boolean).pop() || ''
}

function countEntries(logs) {
  return Array.isArray(logs?.entries) ? logs.entries.length : 0
}

function logLine(entry) {
  return typeof entry === 'string' ? entry : String(entry?.line ?? '')
}

function endpointUrl(status = {}) {
  const base = String(status.url || '').replace(/\/+$/, '')
  return base ? `${base}/v1` : ''
}

function checklistState(isReady, blockedWhenMissing = true) {
  if (isReady) return 'ready'
  return blockedWhenMissing ? 'blocked' : 'pending'
}

export function readinessChecklist({ config = {}, validation = {}, status = {}, dirty = false } = {}) {
  const serverReady = Boolean(validation.serverExists)
  const modelReady = Boolean(validation.modelExists)
  const configReady = Boolean(validation.configExists ?? present(config.config_path))
  const serviceRunning = status.state === 'running'
  const endpointReady = present(status.url)

  return [
    {
      id: 'config',
      label: '配置文件',
      state: checklistState(configReady),
      action: configReady ? '已找到配置文件' : '选择 config.toml',
    },
    {
      id: 'server',
      label: 'llama-server',
      state: checklistState(serverReady),
      action: serverReady ? '已找到 llama-server.exe' : '选择 llama-server.exe',
    },
    {
      id: 'model',
      label: '模型文件',
      state: checklistState(modelReady),
      action: modelReady ? '已找到模型文件' : '选择 GGUF 模型',
    },
    {
      id: 'service',
      label: '服务运行',
      state: serviceRunning ? 'ready' : status.state === 'error' ? 'blocked' : 'pending',
      action: serviceRunning ? '服务正在运行' : '启动本地服务',
    },
    {
      id: 'saved',
      label: '保存状态',
      state: dirty ? 'warning' : 'ready',
      action: dirty ? '保存当前配置' : '配置已保存',
    },
    {
      id: 'endpoint',
      label: 'OpenAI endpoint',
      state: checklistState(endpointReady, false),
      action: endpointReady ? endpointUrl(status) : '等待服务地址',
    },
  ]
}

export function modelCapability({ config = {}, modelInfo = {} } = {}) {
  const hasMmproj = present(config.mmproj)
  const modalities = Array.isArray(modelInfo.modalities) ? modelInfo.modalities.map(item => String(item).toLowerCase()) : []
  const family = modelInfo.family || '本地模型'
  const visionReady = hasMmproj || modalities.includes('vision') || modalities.includes('image')

  if (visionReady && hasMmproj) {
    return {
      mode: 'vision',
      label: '视觉就绪',
      risk: 'good',
      detail: `${family} · 已配置 mmproj，可尝试图片理解。`,
    }
  }

  if (visionReady) {
    return {
      mode: 'vision-needs-mmproj',
      label: '需要 mmproj',
      risk: 'warning',
      detail: `${family} · 模型可能支持视觉，但尚未配置 mmproj。`,
    }
  }

  return {
    mode: 'text',
    label: '文本模型',
    risk: 'normal',
    detail: `${family} · 未配置 mmproj，适合纯文本对话。`,
  }
}

export function terminalDiagnosis({ status = {}, logs = {}, terminalView = {} } = {}) {
  const state = status.state || 'stopped'
  const message = String(status.message || '').trim()
  const entryCount = countEntries(logs)
  const hidden = Number(terminalView.hidden) || 0
  const excluded = Number(terminalView.excluded) || 0
  const dropped = Number(logs.dropped) || 0
  const truncated = Number(logs.truncated) || 0
  const stats = `${entryCount} 条运行日志，已隐藏 ${hidden} 条，已排除 ${excluded} 条，丢弃 ${dropped} 条，截断 ${truncated} 条。`

  if (state === 'error') {
    const portProblem = /port|address.*use|占用/i.test(message) || (logs.entries || []).some(entry => /port|address.*use|占用/i.test(logLine(entry)))
    return {
      label: '启动异常',
      risk: 'high',
      nextAction: portProblem ? '检查端口占用或更换服务端口后重试。' : '查看最近终端输出并修正启动参数。',
      detail: `${message || '服务启动失败'} · ${stats}`,
    }
  }

  if (state === 'running') {
    return {
      label: '运行中',
      risk: dropped > 0 || truncated > 0 ? 'warning' : 'good',
      nextAction: '可以发送请求或复制诊断信息。',
      detail: `${message || '服务可用'} · ${stats}`,
    }
  }

  return {
    label: state === 'starting' ? '启动中' : '未运行',
    risk: state === 'starting' ? 'normal' : 'warning',
    nextAction: state === 'starting' ? '等待健康检查完成。' : '确认配置后启动服务。',
    detail: `${message || '服务未启动'} · ${stats}`,
  }
}

function messageTokens(message) {
  const explicit = Number(message?.tokenCount ?? message?.tokens ?? message?.usage?.total_tokens)
  if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit)
  const words = String(message?.content ?? '').trim().split(/\s+/).filter(Boolean).length
  return words ? words + 1 : 0
}

export function sessionBudget({ config = {}, messages = [] } = {}) {
  const contextTokens = Math.max(0, Number(config.ctx_size || config.ctxSize) || 0)
  const usedTokens = messages.reduce((sum, message) => sum + messageTokens(message), 0)
  const remainingTokens = contextTokens ? Math.max(0, contextTokens - usedTokens) : 0
  const percentUsed = contextTokens ? Math.round((usedTokens / contextTokens) * 100) : 0

  return {
    contextTokens,
    usedTokens,
    remainingTokens,
    percentUsed,
    label: contextTokens ? `${usedTokens} / ${contextTokens} tokens` : `${usedTokens} tokens used`,
  }
}

export function diagnosticBundleText({ config = {}, status = {}, logs = {}, terminalView = {} } = {}) {
  const recentEntries = Array.isArray(terminalView.entries) ? terminalView.entries.slice(-8) : []
  const recentLines = recentEntries.map(entry => `- ${logLine(entry)}`).join('\n') || '- 暂无终端输出'
  const message = String(status.message || '').trim()

  return [
    `状态：${status.state || 'unknown'}${message ? ` - ${message}` : ''}`,
    `端点：${endpointUrl(status) || '未设置'}`,
    `模型：${basename(config.model) || '未选择'}`,
    `日志：${countEntries(logs)} 条，过滤 ${Number(logs.filtered) || 0} 条，排除 ${Number(terminalView.excluded) || 0} 条，截断 ${Number(logs.truncated) || 0} 条，丢弃 ${Number(logs.dropped) || 0} 条`,
    `最近终端：\n${recentLines}`,
  ].join('\n')
}
