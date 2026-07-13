function present(value) {
  return String(value ?? '').trim().length > 0
}

function basename(filePath) {
  return String(filePath ?? '').split(/[\\/]/).filter(Boolean).pop() || ''
}

function cleanBaseUrl(status = {}) {
  return String(status.url || '').replace(/\/+$/, '')
}

function modelName(config = {}) {
  return basename(config.model) || 'local-model'
}

function hasVisionHint(config = {}) {
  const text = `${basename(config.model)} ${basename(config.mmproj)}`.toLowerCase()
  return /\b(?:llava|bakllava|moondream|minicpm-v|qwen(?:2(?:\.5)?)?-vl|qwen-vl|vision|vl)\b/.test(text)
}

export function startupDiagnosis({ config = {}, validation = {}, status = {}, dirty = false } = {}) {
  const serverPath = config.llama_server_path || ''
  const serverDir = config.llama_bin_dir || serverPath.replace(/[\\/][^\\/]*$/, '')
  const serverDirText = serverDir ? `当前目录：${serverDir}` : '还没有选择 llama.cpp 运行目录。'
  const packageKind = validation.runtimePackageKind || ''
  const hasModelPath = present(config.model)

  if (!validation.serverExists) {
    if (packageKind === 'cuda-runtime-only' || /cudart|cuda[-_\s]?runtime/i.test(serverDir)) {
      return {
        level: 'blocked',
        title: '选到的是 CUDA 运行库包',
        detail: `${serverDirText}。这个包通常只有 cudart 等 DLL，没有 llama-server.exe。`,
        action: '下载完整 llama.cpp Windows 包，然后在里面选择 llama-server.exe。',
      }
    }

      return {
        level: 'blocked',
        title: '找不到 llama-server.exe',
        detail: `${serverDirText}。桌面端 direct 模式必须能找到真实的 llama-server.exe。`,
        action: '在“概述”里重新选择 llama.cpp 原文件目录，目录内必须包含 llama-server.exe。',
      }
  }

  if (!hasModelPath) {
    return {
      level: 'blocked',
      title: '还没有选择 GGUF 模型',
      detail: '服务端能启动，但没有模型文件时无法完成聊天请求。',
      action: '点击“展示”或“进出口”里的模型文件，选择 .gguf 模型。',
    }
  }

  if (!validation.modelExists) {
    return {
      level: 'blocked',
      title: '模型路径暂时不可用',
      detail: `已填写：${config.model}。应用当前没有校验到这个 GGUF 文件。`,
      action: '重新选择一次模型文件，或确认移动硬盘、文件夹权限和文件名没有变化。',
    }
  }

  if (config.mmproj && validation.mmprojExists === false) {
    return {
      level: 'blocked',
      title: 'mmproj 文件不存在',
      detail: '图片理解需要匹配的视觉投影文件；路径失效会导致多模态请求失败。',
      action: '重新选择 mmproj，或先清空该项只使用文本聊天。',
    }
  }

  if (dirty) {
    return {
      level: 'warning',
      title: '配置还没保存',
      detail: '界面上的路径或参数已经修改，但后端启动前还没有写入桌面状态。',
      action: '先保存配置，再启动服务或复制接入信息。',
    }
  }

  if (status.state === 'error') {
    return {
      level: 'blocked',
      title: '服务启动异常',
      detail: status.message || 'llama.cpp 服务返回了错误状态。',
      action: /port|address.*use|占用/i.test(status.message || '')
        ? '检查端口占用，或把端口改成 8081 后重新启动。'
        : '复制支持诊断，把最近日志和启动命令一起排查。',
    }
  }

  if (status.state === 'running') {
    return {
      level: 'good',
      title: '服务已可用',
      detail: `${cleanBaseUrl(status) || '本地服务'} 正在运行。`,
      action: '可以聊天，也可以把 OpenAI Base URL 复制到第三方客户端。',
    }
  }

  return {
    level: 'pending',
    title: '准备启动本地服务',
    detail: '关键路径已经就绪，启动后会自动监听 OpenAI 兼容接口。',
    action: '点击底部“保存并启动”。',
  }
}

export function integrationGuide({ config = {}, status = {} } = {}) {
  const base = cleanBaseUrl(status) || 'http://127.0.0.1:8080'
  const baseUrl = `${base}/v1`
  const chatCompletionsUrl = `${base}/v1/chat/completions`
  const name = modelName(config)
  const copyText = [
    `OpenAI Base URL: ${baseUrl}`,
    'API Key: 任意非空内容即可，例如 local',
    `Model: ${name}`,
    `Chat Completions URL: ${chatCompletionsUrl}`,
  ].join('\n')

  return {
    baseUrl,
    chatCompletionsUrl,
    modelName: name,
    apiKeyHint: '任意非空内容，例如 local',
    copyText,
  }
}

export function performanceHints({ config = {} } = {}) {
  const hints = []
  const ctx = Number(config.ctx_size)
  const gpuLayers = Number(config.n_gpu_layers)
  const batch = Number(config.batch_size)
  const timeout = Number(config.request_timeout_ms)
  const host = String(config.host || '').trim()

  if (ctx >= 131072) {
    hints.push({
      id: 'huge-context',
      level: 'warning',
      title: '上下文非常大',
      detail: `${ctx} tokens 会显著增加 KV cache，占满内存时看起来像卡死。`,
      action: '先降到 32768 或 65536，确认稳定后再加大。',
    })
  } else if (ctx >= 65536) {
    hints.push({
      id: 'large-context',
      level: 'normal',
      title: '上下文偏大',
      detail: `${ctx} tokens 对中低显存机器有压力。`,
      action: '如果回复慢或内存上涨，优先降低 ctx_size。',
    })
  }

  if (gpuLayers >= 90) {
    hints.push({
      id: 'aggressive-gpu-layers',
      level: 'warning',
      title: 'GPU 层数很激进',
      detail: '99 层常用于尽量上 GPU，但显存不足会启动失败或回退变慢。',
      action: '显存不够时先降到 35、20 或 0。',
    })
  }

  if (batch >= 2048) {
    hints.push({
      id: 'large-batch',
      level: 'warning',
      title: 'Batch 可能过大',
      detail: `batch_size=${batch} 会提高吞吐，也会增加显存峰值。`,
      action: '启动失败或显存爆掉时，把 batch_size 留空或降到 512。',
    })
  }

  if (Number.isFinite(timeout) && timeout > 0 && timeout < 30000) {
    hints.push({
      id: 'short-timeout',
      level: 'warning',
      title: '请求超时太短',
      detail: `${timeout} ms 对本地大模型长回答不够。`,
      action: '建议至少 600000 ms，避免第三方客户端误判超时。',
    })
  }

  if (host === '0.0.0.0' || host === '::') {
    hints.push({
      id: 'public-host',
      level: 'normal',
      title: '正在监听局域网',
      detail: `${host} 会允许同网络设备访问服务。`,
      action: '只给本机用时改回 127.0.0.1。',
    })
  }

  return hints
}

export function firstRunSteps({ config = {}, validation = {}, status = {}, dirty = false } = {}) {
  const hasModelPath = present(config.model)
  return [
    {
      id: 'server',
      state: validation.serverExists ? 'ready' : 'blocked',
      title: '选择 llama-server.exe',
      detail: validation.serverExists ? '服务端文件已就绪。' : '不要选 cudart 运行库包，要选完整 llama.cpp 包里的 llama-server.exe。',
    },
    {
      id: 'model',
      state: validation.modelExists ? 'ready' : hasModelPath ? 'warning' : 'blocked',
      title: '选择 GGUF 模型',
      detail: validation.modelExists
        ? `当前模型：${basename(config.model)}`
        : hasModelPath
          ? `已填写但暂时不可用：${basename(config.model)}`
          : '没有模型时，端口就算启动也无法聊天。',
    },
    {
      id: 'save',
      state: dirty ? 'warning' : 'ready',
      title: '保存配置',
      detail: dirty ? '当前修改还没保存。' : '配置已经保存。',
    },
    {
      id: 'start',
      state: status.state === 'running' ? 'ready' : status.state === 'error' ? 'blocked' : 'pending',
      title: '启动并检查端口',
      detail: status.state === 'running' ? '服务正在监听。' : '启动后用“检查端口”确认本机接口可访问。',
    },
    {
      id: 'integration',
      state: status.state === 'running' ? 'ready' : 'pending',
      title: '复制第三方接入信息',
      detail: 'Cherry Studio、Open WebUI 等客户端使用 /v1 Base URL，模型名填当前 GGUF 文件名。',
    },
  ]
}

export function multimodalAdvice({ config = {}, validation = {} } = {}) {
  const hasMmproj = present(config.mmproj)
  const likelyVision = hasVisionHint(config)

  if (hasMmproj && validation.mmprojExists !== false) {
    return {
      level: 'warning',
      title: '图片理解仍需实测',
      detail: `已配置 ${basename(config.mmproj)}，但还需要模型本身是视觉模型且投影文件匹配。`,
      action: '用一张简单图片测试；如果回答像纯文本模型，换匹配的 vision GGUF 和 mmproj。',
    }
  }

  if (likelyVision) {
    return {
      level: 'warning',
      title: '视觉模型缺少 mmproj',
      detail: '模型名看起来像视觉模型，但没有投影文件时通常不能正确看图。',
      action: '下载并选择与模型匹配的 mmproj.gguf。',
    }
  }

  return {
    level: 'normal',
    title: '当前按文本模型处理',
    detail: '可以上传图片作为附件记录，但普通文本 GGUF 不等于具备图片理解能力。',
    action: '需要看图时，换视觉模型并配置 mmproj。',
  }
}

export function supportBundleText({ config = {}, validation = {}, status = {}, dirty = false } = {}) {
  const startup = startupDiagnosis({ config, validation, status, dirty })
  const guide = integrationGuide({ config, status })
  const hints = performanceHints({ config })
  const multimodal = multimodalAdvice({ config, validation })

  return [
    `启动诊断：${startup.title} - ${startup.action}`,
    `状态：${status.state || 'unknown'}${status.message ? ` - ${status.message}` : ''}`,
    `llama-server：${config.llama_server_path || '未选择'}`,
    `模型：${config.model || '未选择'} (${modelName(config)})`,
    `OpenAI Base URL：${guide.baseUrl}`,
    `Chat Completions：${guide.chatCompletionsUrl}`,
    `性能提醒：${hints.length ? hints.map(item => `${item.title}：${item.action}`).join('；') : '暂无明显高风险参数'}`,
    `图片理解：${multimodal.title} - ${multimodal.action}`,
  ].join('\n')
}

export function shouldShowFirstRunWizard({ config = {}, validation = {}, status = {}, seen = false, explicit = false } = {}) {
  if (explicit) return true
  if (status.state === 'running' && validation.serverExists && validation.modelExists) return false
  if (seen) return false
  if (!validation.serverExists || !validation.modelExists || !present(config.model)) return true
  return status.state !== 'running'
}

export function environmentIntegrity({ config = {}, validation = {} } = {}) {
  const runtimeIssues = Array.isArray(validation.runtimeIssues) ? validation.runtimeIssues : []
  const rows = [
    {
      id: 'server',
      label: 'llama-server.exe',
      state: validation.serverExists ? 'ready' : 'blocked',
      detail: validation.serverExists ? '\u5df2\u627e\u5230\u670d\u52a1\u7aef\u53ef\u6267\u884c\u6587\u4ef6\u3002' : '\u6ca1\u6709\u670d\u52a1\u7aef\u53ef\u6267\u884c\u6587\u4ef6\uff0c\u65e0\u6cd5\u542f\u52a8\u3002',
      action: validation.serverExists ? '\u7ee7\u7eed\u68c0\u67e5\u6a21\u578b\u548c\u7aef\u53e3\u3002' : '\u9009\u62e9\u5b8c\u6574 llama.cpp Windows \u5305\u91cc\u7684 llama-server.exe\u3002',
    },
    {
      id: 'package',
      label: '\u8fd0\u884c\u5305\u7c7b\u578b',
      state: validation.runtimePackageKind === 'cuda-runtime-only' ? 'blocked' : validation.runtimePackageKind === 'llama-server-package' ? 'ready' : 'warning',
      detail: `\u5f53\u524d\u8bc6\u522b\uff1a${validation.runtimePackageKind || 'unknown'}`,
      action: validation.runtimePackageKind === 'cuda-runtime-only' ? '\u4e0b\u8f7d\u5b8c\u6574 llama.cpp Windows \u5305\uff0c\u4e0d\u8981\u53ea\u9009 cudart \u8fd0\u884c\u5e93\u5305\u3002' : '\u5982\u679c\u542f\u52a8\u5931\u8d25\uff0c\u518d\u6309\u65e5\u5fd7\u8865\u9f50\u5bf9\u5e94 DLL\u3002',
    },
    ...runtimeIssues.map(issue => ({
      id: issue.id || 'runtime-issue',
      label: issue.label || issue.id || '\u8fd0\u884c\u73af\u5883\u63d0\u9192',
      state: issue.level || 'warning',
      detail: issue.message || issue.detail || '\u8fd0\u884c\u76ee\u5f55\u53ef\u80fd\u7f3a\u5c11\u914d\u5957\u6587\u4ef6\u3002',
      action: issue.action || '\u4f18\u5148\u4f7f\u7528\u5b8c\u6574\u89e3\u538b\u7684 llama.cpp \u53d1\u5e03\u5305\u3002',
    })),
  ]

  const blocked = rows.find(row => row.state === 'blocked')
  const warning = rows.find(row => row.state === 'warning')
  const summary = blocked
    ? {
        level: 'blocked',
        title: blocked.label,
        detail: blocked.detail,
        action: /cudart|cuda-runtime-only/i.test(`${validation.runtimePackageKind} ${config.llama_bin_dir || ''}`)
          ? '\u4e0b\u8f7d\u5b8c\u6574 llama.cpp Windows \u5305\uff0c\u5e76\u91cd\u65b0\u9009\u62e9\u5305\u542b llama-server.exe \u7684\u76ee\u5f55\u3002'
          : blocked.action,
      }
    : warning
      ? {
          level: 'warning',
          title: warning.label,
          detail: warning.detail,
          action: warning.action,
        }
      : {
          level: 'good',
          title: '\u8fd0\u884c\u73af\u5883\u770b\u8d77\u6765\u53ef\u7528',
          detail: '\u670d\u52a1\u7aef\u6587\u4ef6\u5df2\u627e\u5230\uff0c\u6ca1\u6709\u53d1\u73b0\u660e\u663e\u963b\u585e\u9879\u3002',
          action: '\u4fdd\u5b58\u5e76\u542f\u52a8\u540e\uff0c\u518d\u68c0\u67e5\u7aef\u53e3\u3002',
        }

  return { summary, rows }
}

export function portDiagnosis(result = {}) {
  const base = cleanBaseUrl(result) || result.url || ''
  const checks = Array.isArray(result.checks) ? result.checks : []
  const failed = checks.find(check => check && check.ok === false)

  if (result.kind === 'unchecked') {
    return {
      level: 'warning',
      title: '\u7aef\u53e3\u5f85\u68c0\u67e5',
      detail: '\u70b9\u51fb\u201c\u68c0\u67e5\u7aef\u53e3\u201d\u540e\uff0c\u518d\u786e\u8ba4 /v1/models \u548c chat completions \u8def\u7531\u662f\u5426\u53ef\u7528\u3002',
      action: '\u5148\u5b8c\u6210\u73af\u5883\u548c\u6a21\u578b\u9009\u62e9\uff0c\u518d\u8fdb\u884c\u7aef\u53e3\u68c0\u67e5\u3002',
      checks,
    }
  }

  if (result.kind === 'not-openai-compatible' || failed?.id === 'models' || failed?.id === 'chat') {
    return {
      level: 'blocked',
      title: '\u7aef\u53e3\u6709\u54cd\u5e94\uff0c\u4f46\u4e0d\u662f\u53ef\u7528\u7684 OpenAI \u63a5\u53e3',
      detail: failed ? `${failed.id} \u68c0\u67e5\u5931\u8d25${failed.status ? `\uff1aHTTP ${failed.status}` : ''}` : '\u670d\u52a1\u54cd\u5e94\u4e86\uff0c\u4f46 /v1 \u63a5\u53e3\u4e0d\u53ef\u7528\u3002',
      action: '\u786e\u8ba4\u7aef\u53e3\u6307\u5411\u7684\u662f llama.cpp server\uff0c\u4e0d\u662f\u5176\u4ed6\u8f6f\u4ef6\u6216\u65e7\u8fdb\u7a0b\u3002',
      checks,
    }
  }

  if (result.ok) {
    return {
      level: 'good',
      title: 'OpenAI \u517c\u5bb9\u7aef\u70b9\u53ef\u7528',
      detail: `${base}/v1/models \u5df2\u901a\u8fc7\uff0c\u7b2c\u4e09\u65b9\u5ba2\u6237\u7aef\u586b\u5199 ${base}/v1\u3002`,
      action: '\u590d\u5236\u7b2c\u4e09\u65b9\u63a5\u5165\u4fe1\u606f\u5373\u53ef\u4f7f\u7528\u3002',
      checks,
    }
  }

  if (result.kind === 'network-error' || result.status === 0 || result.ok === false) {
    return {
      level: 'blocked',
      title: '\u7aef\u53e3\u672a\u54cd\u5e94',
      detail: result.message || `${result.url || base || '\u672c\u5730\u7aef\u53e3'} \u65e0\u6cd5\u8fde\u63a5\u3002`,
      action: '\u5148\u4fdd\u5b58\u5e76\u542f\u52a8\u670d\u52a1\uff1b\u5982\u679c\u4ecd\u5931\u8d25\uff0c\u68c0\u67e5\u7aef\u53e3\u5360\u7528\u6216\u6362\u6210 8081\u3002',
      checks,
    }
  }

  return {
    level: 'warning',
    title: '\u7aef\u53e3\u72b6\u6001\u4e0d\u786e\u5b9a',
    detail: result.message || '\u68c0\u67e5\u7ed3\u679c\u4e0d\u8db3\u4ee5\u786e\u8ba4 OpenAI \u517c\u5bb9\u63a5\u53e3\u53ef\u7528\u3002',
    action: '\u6253\u5f00\u7ec8\u7aef\u65e5\u5fd7\uff0c\u590d\u5236\u652f\u6301\u8bca\u65ad\u7ee7\u7eed\u6392\u67e5\u3002',
    checks,
  }
}

function parameterScale(config = {}) {
  const match = basename(config.model).match(/(\d+(?:\.\d+)?)B/i)
  return match ? Number(match[1]) : 0
}

export function modelRecommendation({ config = {} } = {}) {
  const scale = parameterScale(config)
  const sizeClass = scale >= 30 ? '32B' : scale >= 13 ? '14B' : scale > 0 ? `${Math.round(scale)}B` : '\u672a\u77e5'
  const profile = scale >= 30
    ? { ctxSize: 16384, gpuLayers: 20, batchSize: 512 }
    : scale >= 13
      ? { ctxSize: 32768, gpuLayers: 28, batchSize: 512 }
      : { ctxSize: 32768, gpuLayers: 35, batchSize: 512 }
  const warnings = []
  if (scale >= 30) warnings.push('32B \u7ea7\u6a21\u578b\u5bf9\u5185\u5b58\u548c\u663e\u5b58\u538b\u529b\u5f88\u9ad8\uff0c\u5148\u7528\u77ed\u4e0a\u4e0b\u6587\u786e\u8ba4\u80fd\u542f\u52a8\u3002')
  if (Number(config.ctx_size) > profile.ctxSize) warnings.push(`\u5f53\u524d ctx_size \u9ad8\u4e8e\u4fdd\u5b88\u5efa\u8bae ${profile.ctxSize}\u3002`)
  if (Number(config.n_gpu_layers) > profile.gpuLayers) warnings.push(`\u5f53\u524d GPU \u5c42\u6570\u9ad8\u4e8e\u4fdd\u5b88\u5efa\u8bae ${profile.gpuLayers}\u3002`)

  return {
    sizeClass,
    profile,
    warnings,
    reason: `\u6309 ${sizeClass} \u6a21\u578b\u7ed9\u51fa\u4fdd\u5b88\u542f\u52a8\u53c2\u6570\uff1b\u5148\u8dd1\u901a\uff0c\u518d\u6839\u636e\u673a\u5668\u8d44\u6e90\u52a0\u5927\u4e0a\u4e0b\u6587\u6216 GPU \u5c42\u6570\u3002`,
  }
}

export function downloadGuidance() {
  const releaseUrl = 'https://github.com/ggml-org/llama.cpp/releases/latest'
  const keywords = [
    'win-cuda x64 zip',
    'win-vulkan x64 zip',
    'win-cpu x64 zip',
    'llama-server.exe',
  ]
  return {
    releaseUrl,
    keywords,
    title: '\u4e0b\u8f7d\u5b8c\u6574 llama.cpp Windows \u5305',
    detail: '\u8bf7\u6253\u5f00\u5b98\u65b9 releases\uff0c\u4e0b\u8f7d\u5305\u542b llama-server.exe \u548c ggml DLL \u7684 Windows zip\uff0c\u4e0d\u8981\u53ea\u4e0b cudart \u8fd0\u884c\u5e93\u5305\u3002',
    action: '\u6253\u5f00\u5b98\u65b9\u4e0b\u8f7d\u9875\uff0c\u6309\u4f60\u7684\u663e\u5361\u9009 CUDA/Vulkan/CPU \u7248\u672c\u3002',
    copyText: [
      `Official llama.cpp releases: ${releaseUrl}`,
      'Look for a Windows x64 zip that contains llama-server.exe.',
      `Useful keywords: ${keywords.join(', ')}`,
    ].join('\n'),
  }
}

export function portRepairPlan({ config = {}, status = {}, inspection = {}, health = {} } = {}) {
  const currentPort = Number(config.port) || 8080
  const suggestedPort = Number(inspection.suggestedPort) || (currentPort === 8080 ? 8081 : currentPort + 1)
  const occupied = Boolean(inspection.occupied)
    || /port|address.*use|\u5360\u7528/i.test(`${status.message || ''} ${health.message || ''}`)
  const processes = Array.isArray(inspection.processes) ? inspection.processes : []

  if (occupied) {
    return {
      level: 'blocked',
      title: '\u7aef\u53e3\u88ab\u5360\u7528',
      detail: processes.length
        ? `\u5f53\u524d ${currentPort} \u7aef\u53e3\u53ef\u80fd\u88ab ${processes.map(item => item.name || item.pid).filter(Boolean).join(', ')} \u5360\u7528\u3002`
        : `\u5f53\u524d ${currentPort} \u7aef\u53e3\u65e0\u6cd5\u76f4\u63a5\u4f7f\u7528\u3002`,
      action: `\u4e0d\u6740\u8fdb\u7a0b\uff0c\u5efa\u8bae\u4e00\u952e\u5207\u5230 ${suggestedPort} \u5e76\u91cd\u542f\u670d\u52a1\u3002`,
      currentPort,
      suggestedPort,
      canApply: true,
      processes,
    }
  }

  return {
    level: health.ok ? 'good' : 'warning',
    title: health.ok ? '\u7aef\u53e3\u53ef\u7528' : '\u5c1a\u672a\u53d1\u73b0\u660e\u786e\u5360\u7528',
    detail: inspection.checked ? `${currentPort} \u7aef\u53e3\u68c0\u67e5\u5b8c\u6210\u3002` : '\u70b9\u51fb\u68c0\u6d4b\u7aef\u53e3\u5360\u7528\u540e\u53ef\u67e5\u770b\u8fdb\u7a0b\u7ebf\u7d22\u3002',
    action: health.ok ? '\u53ef\u4ee5\u7ee7\u7eed\u4f7f\u7528\u5f53\u524d\u7aef\u53e3\u3002' : '\u5982\u679c\u542f\u52a8\u4ecd\u5931\u8d25\uff0c\u518d\u5e94\u7528\u5efa\u8bae\u7aef\u53e3\u3002',
    currentPort,
    suggestedPort,
    canApply: false,
    processes,
  }
}

export function hardwareRecommendation({ config = {}, systemInfo = {} } = {}) {
  const base = modelRecommendation({ config })
  const memory = Number(systemInfo.totalMemoryGB) || 0
  const cpuThreads = Number(systemInfo.cpuThreads) || 0
  const gpus = Array.isArray(systemInfo.gpus) ? systemInfo.gpus : []
  const bestGpu = gpus
    .map(gpu => ({ ...gpu, adapterRAMGB: Number(gpu.adapterRAMGB) || 0 }))
    .sort((a, b) => b.adapterRAMGB - a.adapterRAMGB)[0]
  const rows = [
    {
      id: 'memory',
      label: '\u7cfb\u7edf\u5185\u5b58',
      state: memory >= 32 ? 'ready' : memory > 0 ? 'warning' : 'pending',
      detail: memory ? `${memory} GB RAM` : '\u6682\u672a\u8bfb\u5230\u5185\u5b58\u4fe1\u606f',
      action: memory >= 32 ? '\u53ef\u4ee5\u4ece\u4fdd\u5b88\u53c2\u6570\u5f00\u59cb\u3002' : '\u4f18\u5148\u964d\u4f4e ctx_size \u548c batch_size\u3002',
    },
    {
      id: 'cpu',
      label: 'CPU threads',
      state: cpuThreads >= 8 ? 'ready' : cpuThreads > 0 ? 'warning' : 'pending',
      detail: cpuThreads ? `${cpuThreads} threads` : '\u6682\u672a\u8bfb\u5230 CPU \u7ebf\u7a0b\u6570',
      action: cpuThreads ? '\u4fdd\u6301\u7ebf\u7a0b\u81ea\u52a8\u6216\u6309\u9700\u8bbe\u7f6e\u3002' : '\u5148\u4f7f\u7528\u9ed8\u8ba4\u7ebf\u7a0b\u3002',
    },
    {
      id: 'gpu',
      label: 'GPU / VRAM',
      state: bestGpu?.adapterRAMGB ? 'warning' : 'pending',
      detail: bestGpu ? `${bestGpu.name || 'GPU'}${bestGpu.adapterRAMGB ? ` · ${bestGpu.adapterRAMGB} GB VRAM` : ' · VRAM unknown'}` : 'VRAM unknown',
      action: bestGpu?.adapterRAMGB ? '\u4ecd\u9700\u5b9e\u6d4b\u663e\u5b58\u5cf0\u503c\uff0c\u5931\u8d25\u65f6\u964d\u4f4e GPU \u5c42\u6570\u3002' : 'VRAM \u672a\u77e5\uff0c\u5148\u7528\u4fdd\u5b88 GPU \u5c42\u6570\u3002',
    },
  ]
  const risky = rows.find(row => row.state !== 'ready')
  return {
    summary: {
      level: risky ? 'warning' : 'good',
      title: risky ? '\u5df2\u6309\u672c\u673a\u8d44\u6e90\u7ed9\u51fa\u4fdd\u5b88\u5efa\u8bae' : '\u672c\u673a\u8d44\u6e90\u770b\u8d77\u6765\u53ef\u4ee5\u5148\u8dd1\u901a',
      detail: base.reason,
      action: 'VRAM \u65e0\u6cd5\u4ec5\u9760\u6587\u4ef6\u540d\u4fdd\u8bc1\uff1b\u4ee5\u9996\u6b21\u542f\u52a8\u7ed3\u679c\u4e3a\u51c6\u3002',
    },
    rows,
    profile: base.profile,
    warnings: base.warnings,
  }
}

export function clientSmokePlan({ config = {}, status = {}, smoke = null } = {}) {
  const guide = integrationGuide({ config, status })
  const templateText = [
    `OpenAI Base URL: ${guide.baseUrl}`,
    'API Key: local',
    `Model: ${guide.modelName}`,
    'Smoke prompt: ping',
  ].join('\n')
  if (smoke?.ok) {
    return {
      level: 'good',
      title: '\u7b2c\u4e09\u65b9\u63a5\u5165\u70df\u6d4b\u901a\u8fc7',
      detail: `\u672c\u673a OpenAI chat \u8bf7\u6c42\u5df2\u8fd4\u56de\uff0c\u8017\u65f6 ${smoke.latencyMs || 0} ms\u3002`,
      action: '\u628a\u4e0b\u65b9\u6a21\u677f\u590d\u5236\u5230 Cherry Studio \u6216 Open WebUI\u3002',
      templateText,
    }
  }
  if (smoke?.ok === false) {
    return {
      level: 'blocked',
      title: '\u7b2c\u4e09\u65b9\u63a5\u5165\u70df\u6d4b\u5931\u8d25',
      detail: smoke.message || '\u672c\u673a chat completions \u6ca1\u6709\u6210\u529f\u8fd4\u56de\u3002',
      action: '\u5148\u4fee\u590d\u7aef\u53e3\u6216\u6a21\u578b\u8bf7\u6c42\uff0c\u518d\u8054\u8c03\u7b2c\u4e09\u65b9\u5ba2\u6237\u7aef\u3002',
      templateText,
    }
  }
  return {
    level: 'warning',
    title: '\u5f85\u8fdb\u884c\u7b2c\u4e09\u65b9\u63a5\u5165\u70df\u6d4b',
    detail: '\u53ef\u4ee5\u5148\u5728\u672c\u673a\u53d1\u4e00\u6b21 OpenAI-compatible chat \u8bf7\u6c42\u3002',
    action: '\u670d\u52a1\u542f\u52a8\u540e\u70b9\u51fb\u8054\u8c03\u70df\u6d4b\u3002',
    templateText,
  }
}

export function modelCapabilityCatalog({ config = {}, modelInfo = {} } = {}) {
  const file = `${basename(config.model)} ${modelInfo.name || ''}`.toLowerCase()
  const hasMmproj = present(config.mmproj)
  const isVision = /\b(?:llava|bakllava|moondream|minicpm-v|qwen(?:2(?:\.5)?)?-vl|qwen-vl|vision|vl)\b/.test(file)
  const isEmbedding = /\b(?:embed|embedding|bge|e5)\b/.test(file)
  const family = modelInfo.family || (file.includes('qwen') ? 'Qwen' : file.includes('llama') ? 'Llama' : '\u672a\u77e5\u5bb6\u65cf')
  const mode = isVision
    ? hasMmproj ? 'vision-configured' : 'vision-needs-mmproj'
    : isEmbedding ? 'embedding' : 'text'
  const rows = [
    { id: 'catalog', label: '\u80fd\u529b\u5e93\u547d\u4e2d', value: isVision ? 'vision-family' : isEmbedding ? 'embedding-family' : 'text-or-unknown' },
    { id: 'family', label: '\u6a21\u578b\u5bb6\u65cf', value: family },
    { id: 'vision', label: '\u56fe\u7247\u7406\u89e3', value: isVision ? hasMmproj ? '\u9700\u5b9e\u6d4b\uff0cmmproj \u5df2\u914d\u7f6e' : '\u9700\u8981 mmproj' : '\u672a\u8bc6\u522b\u4e3a\u89c6\u89c9\u6a21\u578b' },
    { id: 'confidence', label: '\u7f6e\u4fe1\u5ea6', value: isVision || isEmbedding ? '\u4e2d' : '\u4f4e' },
  ]
  return {
    mode,
    title: mode === 'vision-needs-mmproj' ? '\u53ef\u80fd\u662f\u89c6\u89c9\u6a21\u578b\uff0c\u4f46\u7f3a\u5c11 mmproj' : mode === 'vision-configured' ? '\u89c6\u89c9\u914d\u7f6e\u9700\u5b9e\u6d4b' : '\u6309\u6587\u672c\u6216\u672a\u77e5\u80fd\u529b\u5904\u7406',
    action: mode === 'vision-needs-mmproj' ? '\u4e0b\u8f7d\u5339\u914d\u7684 mmproj.gguf \u540e\u518d\u6d4b\u56fe\u7247\u3002' : '\u7528\u5b9e\u9645\u8bf7\u6c42\u786e\u8ba4\u80fd\u529b\uff0c\u4e0d\u53ea\u770b\u6587\u4ef6\u540d\u3002',
    rows,
  }
}

export function releaseCandidateChecklist({ build = {} } = {}) {
  const rows = [
    { id: 'packaged', label: '\u5019\u9009\u5305', state: build.packaged ? 'ready' : 'blocked', action: build.packaged ? '\u5df2\u751f\u6210 dist-release-candidate\u3002' : '\u8fd0\u884c electron-builder \u751f\u6210\u5019\u9009\u5305\u3002' },
    { id: 'shortcut', label: '\u684c\u9762\u5165\u53e3', state: build.shortcut ? 'ready' : 'blocked', action: build.shortcut ? '\u684c\u9762\u5feb\u6377\u65b9\u5f0f\u5df2\u6307\u5411\u5019\u9009\u7248\u3002' : '\u5237\u65b0\u684c\u9762\u5feb\u6377\u65b9\u5f0f\u3002' },
    { id: 'opened', label: '\u672c\u673a\u6253\u5f00', state: build.opened ? 'ready' : 'blocked', action: build.opened ? '\u5df2\u6253\u5f00\u7ed9\u4f60\u68c0\u67e5\u3002' : '\u542f\u52a8\u5019\u9009\u7248\u8fdb\u884c\u68c0\u67e5\u3002' },
    { id: 'screenshots', label: '\u89c6\u89c9\u9a8c\u6536', state: Number(build.screenshots) >= 3 ? 'ready' : 'warning', action: '\u81f3\u5c11\u8986\u76d6\u9996\u5c4f\u3001\u5411\u5bfc\u548c\u6551\u63f4\u9875\u622a\u56fe\u3002' },
    { id: 'publish', label: '\u6b63\u5f0f\u53d1\u5e03', state: 'warning', action: '\u672a\u7ecf\u786e\u8ba4\u4e0d push\u3001\u4e0d\u6253 tag\u3001\u4e0d\u53d1 GitHub Release\u3002' },
  ]
  const blocked = rows.find(row => row.state === 'blocked')
  const warning = rows.find(row => row.state === 'warning')
  return {
    summary: {
      level: blocked ? 'blocked' : warning && !build.packaged ? 'warning' : 'good',
      title: blocked ? '\u5019\u9009\u7248\u8fd8\u6ca1\u5b8c\u6210' : '\u5019\u9009\u7248\u53ef\u4f9b\u672c\u673a\u9a8c\u6536',
      detail: '\u8fd9\u662f release candidate\uff0c\u4e0d\u7b49\u4e8e\u5df2\u53d1\u5e03\u5230 GitHub\u3002',
      action: blocked ? blocked.action : '\u5148\u672c\u673a\u68c0\u67e5\uff0c\u901a\u8fc7\u540e\u518d\u51b3\u5b9a\u662f\u5426\u6253 tag \u53d1\u5e03\u3002',
    },
    rows,
  }
}
