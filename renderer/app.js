const sections = [
  ['chat', '对话', '桌面端直接使用模型'],
  ['paths', '路径', '启动器、配置文件和服务端'],
  ['model', '模型', 'GGUF 与多模态投影'],
  ['runtime', '上下文', '服务地址和上下文窗口'],
  ['sampling', '采样', '温度、Top-P 和惩罚'],
  ['system', 'GPU/批处理', '显卡、线程和批量参数'],
  ['logs', '日志', '启动输出和健康检查'],
]

const promptSeeds = ['你现在是什么模型', '分析一下内容', '写一个 API 请求示例', '生成 OpenAI 兼容配置']
const settingsTabs = [
  ['overview', '&#9881;', '概述', '服务入口与基础运行信息'],
  ['display', '&#128421;', '展示', '模型标签、模板与显示项'],
  ['sampling', '&#9661;', '采样', '温度、Top-K 与 Top-P'],
  ['penalty', '&#9651;', '惩罚', '重复、存在与最小采样'],
  ['io', '&#128452;', '进出口', '模型、服务端与路径'],
  ['mcp', '&#128206;', 'MCP', '预留给扩展和工具接入'],
  ['developer', '&lt;/&gt;', '开发者', '线程、GPU 与批处理'],
  ['logs', '&#128196;', '日志', '当前 llama.cpp 服务输出'],
]

const appEl = document.getElementById('app')

const state = {
  active: 'chat',
  config: null,
  validation: {},
  launch: {},
  status: { state: 'stopped', message: '服务未启动', url: 'http://127.0.0.1:8080' },
  logs: [],
  view: 'chat',
  sidebarPanel: 'chats',
  sidebarCollapsed: false,
  sessions: [],
  currentSessionId: '',
  historySearch: '',
  historyMenuId: '',
  historyDialog: null,
  chatMessages: [],
  chatInput: '',
  attachments: [],
  attachmentMenuOpen: false,
  attachmentMenuPosition: null,
  streamRequestId: '',
  preview: null,
  modelInfo: null,
  modelInfoOpen: false,
  chatBusy: false,
  dirty: false,
  busy: false,
  settingsOpen: false,
  toast: '',
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/'/g, '&#39;')
}

function isNearBottom(element) {
  if (!element) return true
  return element.scrollHeight - element.scrollTop - element.clientHeight < 96
}

function currentSettingsTabId() {
  return settingsTabs.some(([id]) => id === state.active) ? state.active : 'overview'
}

function currentSettingsTabMeta() {
  return settingsTabs.find(([id]) => id === currentSettingsTabId()) || settingsTabs[0]
}

function renderCopyIcon() {
  return `
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <rect x="5" y="3" width="8" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"></rect>
      <rect x="2" y="6" width="8" height="8" rx="2" fill="none" stroke="currentColor" stroke-width="1.4"></rect>
    </svg>
  `
}

function renderModelChipIcon() {
  return `
    <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <path d="M8 1.4 13.2 4v8L8 14.6 2.8 12V4L8 1.4Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"></path>
      <path d="M8 1.8V6.1m0 0 5.1-2.1M8 6.1 2.9 4" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"></path>
    </svg>
  `
}

function renderSidebarToggleIcon() {
  return `
    <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <rect x="3" y="3.25" width="12" height="11.5" rx="2.2" fill="none" stroke="currentColor" stroke-width="1.5"></rect>
      <path d="M7 3.75v10.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path>
    </svg>
  `
}

function renderGearIcon() {
  return `
    <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path d="m9 2.7 1 .3.5 1.4 1.3.5 1.2-.7.8.7-.7 1.2.5 1.3 1.4.5.3 1-.3 1-1.4.5-.5 1.3.7 1.2-.8.7-1.2-.7-1.3.5-.5 1.4-1 .3-1-.3-.5-1.4-1.3-.5-1.2.7-.8-.7.7-1.2-.5-1.3-1.4-.5-.3-1 .3-1 1.4-.5.5-1.3-.7-1.2.8-.7 1.2.7 1.3-.5.5-1.4 1-.3Z" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"></path>
      <circle cx="9" cy="9" r="2.25" fill="none" stroke="currentColor" stroke-width="1.4"></circle>
    </svg>
  `
}

function renderSettingsTabIcon(kind) {
  const icons = {
    overview: `
      <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false">
        <circle cx="9" cy="9" r="5.6" fill="none" stroke="currentColor" stroke-width="1.5"></circle>
        <path d="M9 5.2v3.9l2.4 1.7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>
      </svg>
    `,
    display: `
      <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false">
        <rect x="2.6" y="3.4" width="12.8" height="9.2" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"></rect>
        <path d="M6.2 14.7h5.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path>
      </svg>
    `,
    sampling: `
      <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false">
        <path d="M4 4.3h10l-4.2 4.5v4.5l-1.6.8V8.8L4 4.3Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"></path>
      </svg>
    `,
    penalty: `
      <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false">
        <path d="m9 3.1 6 10.4H3L9 3.1Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"></path>
        <path d="M9 6.6v3.2M9 12.2h.01" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path>
      </svg>
    `,
    io: `
      <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false">
        <path d="M6 5.1H3.4v9.1h9.2v-2.4M12 12.9h2.6V3.8H5.4v2.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"></path>
        <path d="M7.1 9h4.1m0 0-1.8-1.8M11.2 9l-1.8 1.8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>
      </svg>
    `,
    mcp: `
      <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false">
        <path d="M5.1 5.3 8 8.2m0 0 2.9-2.9M8 8.2l-2.9 2.9M8 8.2l2.9 2.9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path>
        <circle cx="4.2" cy="4.4" r="1.6" fill="none" stroke="currentColor" stroke-width="1.3"></circle>
        <circle cx="13.8" cy="4.4" r="1.6" fill="none" stroke="currentColor" stroke-width="1.3"></circle>
        <circle cx="4.2" cy="13.6" r="1.6" fill="none" stroke="currentColor" stroke-width="1.3"></circle>
        <circle cx="13.8" cy="13.6" r="1.6" fill="none" stroke="currentColor" stroke-width="1.3"></circle>
      </svg>
    `,
    developer: `
      <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false">
        <path d="m7.2 5.4-3 3.6 3 3.6M10.8 5.4l3 3.6-3 3.6M9.9 4.6 8.1 13.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>
      </svg>
    `,
    logs: `
      <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false">
        <rect x="3.2" y="2.8" width="11.6" height="12.4" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"></rect>
        <path d="M6 6.4h6M6 9h6M6 11.6h4.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path>
      </svg>
    `,
  }

  return icons[kind] || icons.overview
}

function buildBetterModelInfoRows(info) {
  const config = state.config || {}
  const filePath = info?.filePath || config.model || ''
  const fileName = info?.name || basename(filePath) || '未选择模型'
  const formatCount = value => {
    const number = Number(value)
    if (!Number.isFinite(number) || number <= 0) return '未读取'
    return number.toLocaleString('zh-CN')
  }
  const formatTokens = value => {
    const number = Number(value)
    if (!Number.isFinite(number) || number <= 0) return '未读取'
    return `${number.toLocaleString('zh-CN')} 个代币`
  }
  const formatParams = value => {
    const number = Number(value)
    if (!Number.isFinite(number) || number <= 0) {
      return info?.parameterLabel || info?.parameterScale || paramScaleFromName(fileName) || '未读取'
    }
    if (number >= 100000000) return `${(number / 100000000).toFixed(2)} 亿`
    if (number >= 1000000) return `${(number / 1000000).toFixed(2)} M`
    return number.toLocaleString('zh-CN')
  }
  const templateText = String(info?.chatTemplateText || config.chat_template_kwargs || '未读取').trim()

  return {
    rows: [
      { label: '模型', value: fileName, copy: fileName },
      { label: '文件路径', value: filePath || '未配置', copy: filePath || '' },
      { label: '上下文大小', value: formatTokens(info?.ctxSize) },
      { label: '训练上下文', value: formatTokens(info?.trainingContext) },
      { label: '模型大小', value: formatBytes(info?.fileSize) },
      { label: '参数量', value: formatParams(info?.nParams) },
      { label: '嵌入维度', value: formatCount(info?.embeddingSize) },
      { label: '词汇表大小', value: formatCount(info?.vocabSize) },
      { label: '词汇表类型', value: formatCount(info?.vocabType) },
      { label: '并行槽位', value: formatCount(info?.parallelSlots) },
      { label: '构建信息', value: info?.build || '未读取' },
    ],
    runtimeRows: [
      { label: '模型家族', value: info?.family || modelFamilyFromName(fileName) || '未识别' },
      { label: '量化等级', value: info?.quantization || quantLabelFromName(fileName) || '未识别' },
      { label: '服务地址', value: info?.serverUrl || state.status?.url || '未启动', copy: info?.serverUrl || state.status?.url || '' },
      { label: '最大输出', value: `${config.n_predict ?? info?.nPredict ?? '未设置'}` },
      { label: 'GPU 层数', value: `${config.n_gpu_layers ?? info?.gpuLayers ?? '未设置'}` },
      { label: '温度', value: `${config.temp ?? info?.temperature ?? '未设置'}` },
      { label: 'Top-P', value: `${config.top_p ?? info?.topP ?? '未设置'}` },
      { label: 'Top-K', value: `${config.top_k ?? info?.topK ?? '未设置'}` },
      { label: 'Min-P', value: `${config.min_p ?? info?.minP ?? '未设置'}` },
      { label: '存在惩罚', value: `${config.presence_penalty ?? info?.presencePenalty ?? '未设置'}` },
      { label: '重复惩罚', value: `${config.repeat_penalty ?? info?.repeatPenalty ?? '未设置'}` },
    ],
    templateText,
  }
}

function basename(filePath) {
  return String(filePath || '').split(/[\\/]/).pop() || ''
}

function formatBytes(bytes) {
  const value = Number(bytes || 0)
  if (!Number.isFinite(value) || value <= 0) return '未读取'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let next = value
  let unitIndex = 0
  while (next >= 1024 && unitIndex < units.length - 1) {
    next /= 1024
    unitIndex += 1
  }
  return `${next >= 100 || unitIndex === 0 ? next.toFixed(0) : next.toFixed(2)} ${units[unitIndex]}`
}

function modelFamilyFromName(name) {
  return String(name || '')
    .replace(/\.gguf$/i, '')
    .replace(/\.(q\d[^.]*)$/i, '')
    .replace(/\.(iq\d[^.]*)$/i, '')
}

function quantLabelFromName(name) {
  const match = String(name || '').match(/\.(q\d[^.]*)\.gguf$/i) || String(name || '').match(/\.(iq\d[^.]*)\.gguf$/i)
  return match?.[1]?.toUpperCase() || '未标注'
}

function paramScaleFromName(name) {
  const match = String(name || '').match(/(\d+(?:\.\d+)?)B/i)
  return match ? `${match[1]}B` : '未标注'
}

function buildModelInfoRows(info) {
  const config = state.config || {}
  const filePath = info?.filePath || config.model || ''
  const fileName = info?.name || basename(filePath) || '未选择模型'
  const family = info?.family || modelFamilyFromName(fileName)
  const quantization = info?.quantization || quantLabelFromName(fileName)
  const params = info?.parameterScale || paramScaleFromName(fileName)
  const templateText = String(info?.chatTemplateText || config.chat_template_kwargs || '由模型内置模板决定')
  return {
    rows: [
      { label: '模型', value: fileName, copy: fileName },
      { label: '文件路径', value: filePath || '未配置', copy: filePath || '' },
      { label: '模型家族', value: family || '未识别' },
      { label: '量化等级', value: quantization },
      { label: '参数规模', value: params },
      { label: '模型大小', value: formatBytes(info?.fileSize) },
      { label: '上下文大小', value: `${config.ctx_size || info?.ctxSize || '未设置'} tokens` },
      { label: '最大输出', value: `${config.n_predict ?? info?.nPredict ?? '未设置'}` },
      { label: 'GPU 层数', value: `${config.n_gpu_layers ?? info?.gpuLayers ?? '未设置'}` },
      { label: '服务地址', value: info?.serverUrl || state.status?.url || '未启动', copy: info?.serverUrl || state.status?.url || '' },
      { label: 'Temperature', value: `${config.temp ?? info?.temperature ?? ''}` },
      { label: 'Top-P / Top-K', value: `${config.top_p ?? info?.topP ?? ''} / ${config.top_k ?? info?.topK ?? ''}` },
      { label: 'Min-P', value: `${config.min_p ?? info?.minP ?? ''}` },
      { label: 'Presence / Repeat', value: `${config.presence_penalty ?? info?.presencePenalty ?? ''} / ${config.repeat_penalty ?? info?.repeatPenalty ?? ''}` },
      { label: '服务端', value: info?.build || basename(config.llama_server_path) || 'llama-server.exe', copy: config.llama_server_path || '' },
    ],
    templateText,
  }
}

function splitCodeParts(content) {
  const parts = []
  const pattern = /```([^\n`]*)\n?([\s\S]*?)```/g
  let cursor = 0
  let match
  while ((match = pattern.exec(content)) !== null) {
    if (match.index > cursor) {
      parts.push({ type: 'text', value: content.slice(cursor, match.index) })
    }
    parts.push({
      type: 'code',
      language: String(match[1] || '').trim().split(/\s+/)[0] || 'text',
      value: match[2] || '',
    })
    cursor = match.index + match[0].length
  }
  if (cursor < content.length) {
    parts.push({ type: 'text', value: content.slice(cursor) })
  }
  return parts
}

function renderTextBlock(text) {
  const value = String(text || '')
  if (!value.trim()) return ''
  return `<div class="markdown-text">${escapeHtml(value)}</div>`
}

function canPreviewCode(language, code) {
  const lang = String(language || '').toLowerCase()
  return ['html', 'htm', 'svg'].includes(lang) || /<!doctype|<html|<body|<style|<script/i.test(code)
}

function estimateTokens(text) {
  const value = String(text || '').trim()
  if (!value) return 0
  const cjk = (value.match(/[\u4e00-\u9fff]/g) || []).length
  const latin = value.replace(/[\u4e00-\u9fff]/g, '').trim()
  const latinTokens = latin ? latin.split(/\s+/).filter(Boolean).length : 0
  return Math.max(1, Math.round(cjk * 0.9 + latinTokens * 1.25))
}

function updateLiveStats(message) {
  if (!message || message.role !== 'assistant') return
  const startedAt = message.startedAt || message.createdAt || Date.now()
  const latencyMs = Math.max(1, Date.now() - startedAt)
  const tokens = message.tokens || estimateTokens(message.content)
  message.latencyMs = latencyMs
  message.estimatedTokens = estimateTokens(message.content)
  message.speed = tokens ? `${(Number(tokens) / (latencyMs / 1000)).toFixed(2)} t/s` : ''
}

function renderCodeAwareText(text, messageIndex, counter) {
  return splitCodeParts(String(text || ''))
    .map(part => {
      if (part.type === 'text') return renderTextBlock(part.value)
      const codeIndex = counter.value
      counter.value += 1
      const language = part.language || 'text'
      const previewable = canPreviewCode(language, part.value)
      const codeValue = String(part.value || '').replace(/^(?:[ \t]*\n)+|(?:\n[ \t]*)+$/g, '')
      return `
        <figure class="code-block" data-code-index="${codeIndex}">
          <figcaption>
            <span>${escapeHtml(language.toUpperCase())}</span>
            <div>
              <button type="button" data-action="copy-code" data-message-index="${messageIndex}" data-code-index="${codeIndex}" title="复制代码">复制</button>
              ${previewable ? `<button type="button" class="eye-btn" data-action="preview-code" data-message-index="${messageIndex}" data-code-index="${codeIndex}" title="预览">&#128065;</button>` : ''}
            </div>
          </figcaption>
          <pre><code>${escapeHtml(codeValue)}</code></pre>
        </figure>
      `
    })
    .join('')
}

function splitThinkingOutput(content) {
  const text = String(content || '')
  const tagPattern = /<think(?:ing)?>/i
  const closePattern = /<\/think(?:ing)?>/i
  const labelPattern = /(?:^|\n)\s*(?:Thinking Process|思考过程)\s*[:：]/i
  const openTag = tagPattern.exec(text)
  const openLabel = labelPattern.exec(text)
  const openCandidates = [openTag, openLabel].filter(Boolean)
  const firstOpen = openCandidates.sort((a, b) => a.index - b.index)[0]
  const closeTag = closePattern.exec(text)
  const cleanMarkers = value => String(value || '')
    .replace(/<\/?think(?:ing)?>/gi, '')
    .replace(/^\s*(?:Thinking Process|思考过程)\s*[:：]\s*/i, '')
    .trim()

  if (firstOpen) {
    const openEnd = firstOpen.index + firstOpen[0].length
    const prefix = text.slice(0, firstOpen.index)
    const closeAfterOpen = closePattern.exec(text.slice(openEnd))
    if (closeAfterOpen) {
      const closeStart = openEnd + closeAfterOpen.index
      const closeEnd = closeStart + closeAfterOpen[0].length
      const prefixLooksLikeThinking = !prefix.trim() || /(?:reasoning|thinking|思考|推理)/i.test(prefix)
      const answerPrefix = prefixLooksLikeThinking ? '' : prefix
      const thoughtPrefix = prefixLooksLikeThinking ? prefix : ''
      return {
        answer: cleanMarkers(`${answerPrefix}${text.slice(closeEnd)}`),
        thoughts: [cleanMarkers(`${thoughtPrefix}${text.slice(openEnd, closeStart)}`)].filter(Boolean),
      }
    }

    return {
      answer: cleanMarkers(prefix),
      thoughts: [cleanMarkers(text.slice(openEnd))].filter(Boolean),
    }
  }

  if (closeTag) {
    const closeEnd = closeTag.index + closeTag[0].length
    return {
      answer: cleanMarkers(text.slice(closeEnd)),
      thoughts: [cleanMarkers(text.slice(0, closeTag.index))].filter(Boolean),
    }
  }

  return { answer: text, thoughts: [] }
}

function renderMessageContent(message, messageIndex) {
  const content = String(message.content || '')
  if (!content && message.role === 'assistant' && state.chatBusy) {
    return '<div class="typing-line">正在生成...</div>'
  }
  if (message.role !== 'assistant') {
    return content ? renderTextBlock(content) : ''
  }

  const counter = { value: 0 }
  const output = []
  const { answer, thoughts } = splitThinkingOutput(content)
  const showRawOutput = Boolean(state.config?.show_raw_output)
  const showThinking = state.config?.show_thinking !== false && !showRawOutput
  const expandThinking = Boolean(state.config?.expand_thinking)

  if (showThinking && thoughts.length > 0) {
    output.push(`
      <details class="think-block" ${expandThinking ? 'open' : ''}>
        <summary>思考过程</summary>
        ${renderCodeAwareText(thoughts.join('\n\n'), messageIndex, counter)}
      </details>
    `)
  } else if (!showRawOutput && thoughts.length > 0 && state.config?.show_thinking === false) {
    output.push('<div class="markdown-text muted-note">思考过程已隐藏。</div>')
  }

  if (answer) {
    output.push(renderCodeAwareText(answer, messageIndex, counter))
  }

  if (showRawOutput && content) {
    output.push(`
      <details class="raw-output-block" ${message.streaming ? 'open' : ''}>
        <summary>原始输出</summary>
        <pre>${escapeHtml(content)}</pre>
      </details>
    `)
  }

  return output.join('') || renderTextBlock(content)
}

function getCodeBlock(messageIndex, codeIndex) {
  const message = state.chatMessages[Number(messageIndex)]
  if (!message) return null
  const blocks = splitCodeParts(String(message.content || '')).filter(part => part.type === 'code')
  return blocks[Number(codeIndex)] || null
}

function scrollOpenRawOutputs(root = document) {
  const sync = () => {
    root.querySelectorAll?.('.raw-output-block[open] pre').forEach(pre => {
      pre.scrollTop = pre.scrollHeight
    })
  }
  sync()
  window.requestAnimationFrame(sync)
}

function stickStreamingMessage(article, feed) {
  const sync = () => {
    scrollOpenRawOutputs(article)
    if (feed) feed.scrollTop = feed.scrollHeight
  }
  sync()
  window.requestAnimationFrame(sync)
}

function updateMessageDom(index) {
  const feed = document.getElementById('chatFeed')
  const shouldStick = isNearBottom(feed)
  const message = state.chatMessages[index]
  const article = document.querySelector(`[data-message-index="${index}"]`)
  const bubble = article?.querySelector('.bubble')
  const meta = article?.querySelector('.message-meta')
  if (!message || !bubble) return
  updateLiveStats(message)
  bubble.innerHTML = renderMessageContent(message, index)
  if (meta) meta.outerHTML = renderMessageMeta(message)
  if (message.streaming) {
    stickStreamingMessage(article, feed)
  } else if (shouldStick && feed) {
    feed.scrollTop = feed.scrollHeight
  }
}

function modelName() {
  const model = state.config?.model || ''
  return model.split(/[\\/]/).pop() || 'local-model'
}

function statusLabel() {
  return {
    stopped: '未启动',
    starting: '启动中',
    running: '运行中',
    stopping: '停止中',
    error: '需要处理',
  }[state.status.state] || state.status.state
}

function statusClass() {
  if (state.status.state === 'running') return 'running'
  if (state.status.state === 'error') return 'error'
  if (state.status.state === 'starting' || state.status.state === 'stopping') return 'pending'
  return ''
}

function compactStatusMessage(message) {
  const text = String(message || '')
  if (text.includes('System message must be at the beginning')) {
    return '系统消息位置错误：已在新版中自动合并到请求最前面。'
  }
  if (/timeout|aborted/i.test(text)) {
    return '请求超时：可在设置里调大“请求超时 ms”，或降低上下文/输出长度。'
  }
  if (text.length > 180) {
    return `${text.slice(0, 180)}...`
  }
  return text
}

function friendlyErrorMessage(error) {
  const text = String(error?.message || error || '')
  if (text.includes('System message must be at the beginning')) {
    return '发送失败：系统消息必须位于请求最前面。新版会自动整理历史消息，请再发送一次。'
  }
  if (/timeout|aborted/i.test(text)) {
    return '发送失败：请求超时。可以在设置里调大“请求超时 ms”，或降低 ctx_size / n_predict 后重试。'
  }
  if (text.includes('Chat Template Kwargs must be valid JSON')) {
    return `发送失败：Chat Template Kwargs 不是合法 JSON。${text}`
  }
  return text.length > 360 ? `发送失败：${text.slice(0, 360)}...` : `发送失败：${text}`
}

function shortTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function makeSessionId() {
  return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function titleFromMessages(messages) {
  const firstUser = messages.find(message => message.role === 'user' && String(message.content || '').trim())
  return String(firstUser?.content || '新聊天').replace(/\s+/g, ' ').slice(0, 36)
}

function loadSessions() {
  try {
    const saved = JSON.parse(localStorage.getItem('llama.cpp.desktop.sessions') || '[]')
    state.sessions = Array.isArray(saved) ? saved : []
  } catch {
    state.sessions = []
  }
}

function persistSessions() {
  localStorage.setItem('llama.cpp.desktop.sessions', JSON.stringify(state.sessions.slice(0, 80)))
}

function saveCurrentSession() {
  if (!state.currentSessionId || state.chatMessages.length === 0) return
  const now = Date.now()
  const next = {
    id: state.currentSessionId,
    title: titleFromMessages(state.chatMessages),
    messages: state.chatMessages,
    updatedAt: now,
  }
  const existing = state.sessions.findIndex(session => session.id === state.currentSessionId)
  if (existing >= 0) {
    state.sessions.splice(existing, 1, next)
  } else {
    state.sessions.unshift(next)
  }
  state.sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  persistSessions()
}

function buildApiMessages(messages) {
  const systemMessages = []
  const conversation = []

  for (const message of Array.isArray(messages) ? messages : []) {
    if (!message || message.localOnly) continue
    if (!['user', 'assistant', 'system'].includes(message.role)) continue
    if (!String(message.content || '').trim() && !(Array.isArray(message.attachments) && message.attachments.length)) continue

    if (message.role === 'system') {
      const systemText = String(message.content || '').trim()
      if (/^(发送失败|重试失败|请求失败|启动失败)[：:]/.test(systemText)) continue
      systemMessages.push(systemText)
      continue
    }

    conversation.push(message)
  }

  return systemMessages.length
    ? [{ role: 'system', content: systemMessages.filter(Boolean).join('\n\n') }, ...conversation]
    : conversation
}

function openSession(sessionId) {
  saveCurrentSession()
  const session = state.sessions.find(item => item.id === sessionId)
  if (!session) return
  state.currentSessionId = session.id
  state.chatMessages = Array.isArray(session.messages) ? session.messages : []
  state.chatInput = ''
  state.attachments = []
  state.view = 'chat'
  state.sidebarPanel = 'chats'
  state.attachmentMenuOpen = false
  state.historyMenuId = ''
}

function startFreshSession() {
  saveCurrentSession()
  state.currentSessionId = makeSessionId()
  state.chatMessages = []
  state.chatInput = ''
  state.attachments = []
  state.attachmentMenuOpen = false
  state.view = 'chat'
  state.sidebarPanel = 'chats'
  state.historyMenuId = ''
}

function attachmentLabel(kind) {
  return {
    image: '图片',
    audio: '音频',
    text: '文本',
    pdf: 'PDF',
    system: '系统',
    mcp: 'MCP',
    file: '文件',
    video: '视频',
  }[kind] || '文件'
}

function renderAttachmentItem(item, index, removable, mode = 'composer') {
  const kind = String(item?.kind || 'file')
  const name = String(item?.name || 'attachment')
  const meta = [formatBytes(item.size || 0), item.warning || item.error || ''].filter(Boolean).join(' · ')
  const title = [name, item.path || '', meta].filter(Boolean).join('\n')
  const removeButton = removable
    ? `<button type="button" class="attachment-remove" data-action="remove-attachment" data-index="${index}" title="移除附件">×</button>`
    : ''

  if (kind === 'image' && item?.dataUrl) {
    if (mode === 'message-user') {
      return `
        <button type="button" class="chat-image-attachment" data-action="preview-image" data-src="${escapeAttribute(item.dataUrl)}" data-title="${escapeAttribute(name)}" title="${escapeAttribute(title)}">
          <img src="${escapeAttribute(item.dataUrl)}" alt="${escapeAttribute(name)}" loading="lazy" />
        </button>
      `
    }

    return `
      <figure class="attachment-card image ${removable ? 'editable' : 'readonly'}" title="${escapeAttribute(title)}">
        <button type="button" class="attachment-image-trigger" data-action="preview-image" data-src="${escapeAttribute(item.dataUrl)}" data-title="${escapeAttribute(name)}" title="预览图片">
          <img src="${escapeAttribute(item.dataUrl)}" alt="${escapeAttribute(name)}" loading="lazy" />
        </button>
        <figcaption>
          <strong>${escapeHtml(name)}</strong>
          <span>${escapeHtml(meta)}</span>
        </figcaption>
        ${removeButton}
      </figure>
    `
  }

  return `
    <span class="attachment-chip ${escapeHtml(kind)} ${mode === 'message-user' ? 'message-file' : ''}" title="${escapeAttribute(title)}">
      <strong>${attachmentLabel(kind)}</strong>
      <span class="attachment-name">${escapeHtml(name)}</span>
      <span class="attachment-size">${escapeHtml(formatBytes(item.size || 0))}</span>
      ${removeButton}
    </span>
  `
}

function renderMessageActions(index, message) {
  const canRetry = message.role === 'assistant'
  return `
    <div class="message-actions">
      <button type="button" data-action="copy-message" data-index="${index}" title="复制">⧉</button>
      <button type="button" data-action="edit-message" data-index="${index}" title="编辑">✎</button>
      ${canRetry ? `<button type="button" data-action="retry-message" data-index="${index}" title="重新生成">↻</button>` : ''}
      <button type="button" data-action="delete-message" data-index="${index}" title="删除">⌫</button>
    </div>
  `
}

function renderMessageMeta(message) {
  if (message.role !== 'assistant') return ''
  const tokens = message.tokens || message.estimatedTokens || estimateTokens(message.content)
  const latencyMs = message.latencyMs || (message.streaming ? Date.now() - (message.startedAt || message.createdAt || Date.now()) : 0)
  const speed = message.speed || (tokens && latencyMs ? `${(Number(tokens) / (latencyMs / 1000)).toFixed(2)} t/s` : '')
  const pieces = [
    `<span class="model-pill">◇ ${escapeHtml(message.model || modelName())}</span>`,
    `<span>▦ ${escapeHtml(tokens || 0)} 个代币</span>`,
    latencyMs ? `<span>◷ ${(latencyMs / 1000).toFixed(1)}s</span>` : '<span>◷ 0.0s</span>',
    speed ? `<span>⌁ ${escapeHtml(speed)}</span>` : '',
    message.streaming ? '<span>生成中</span>' : '',
  ].filter(Boolean)

  return pieces.length ? `<div class="message-meta">${pieces.join('')}</div>` : ''
}

function compactLogLineForDisplay(line) {
  const text = String(line || '').trim()
  const lower = text.toLowerCase()
  const routinePatterns = [
    'que start_loop: waiting for new tasks',
    'que start_loop: processing new tasks',
    'srv update_slots: all slots are idle',
    'srv update_slots: run slots completed',
    'srv update_slots: update slots',
  ]

  if (routinePatterns.some(pattern => lower.includes(pattern))) return ''
  if (lower.includes('http: streamed chunk: data:') && !lower.includes('[done]')) return ''
  if (lower.includes('http: streamed chunk: data: [done]')) return 'stream chunk: [DONE]'
  if (text.includes('"prompt":') || text.includes('<|im_start|>') || text.includes('<!DOCTYPE html')) {
    return `[已省略超长日志负载：${text.length} 字符]`
  }
  if (text.length > 420) return `${text.slice(0, 260)} ... [已截断 ${text.length - 260} 字符]`
  return text
}

function visibleLogs(limit = 420) {
  return (state.logs || [])
    .map(entry => ({ ...entry, line: compactLogLineForDisplay(entry.line) }))
    .filter(entry => entry.line)
    .slice(-limit)
}

function terminalLineForDisplay(entry) {
  const line = compactLogLineForDisplay(entry?.line)
  if (!line) return ''

  const source = String(entry?.source || '').toLowerCase()
  const lower = line.toLowerCase()
  const runtimePrefix = /^(llama_|load_|clip_|common_|sched_|ggml|cuda|cublas|main:|server|srv\b|srv_|slot|system_info|webui|error|warn|warning|fatal)/i

  if (source === 'chat') return ''
  if (lower.includes('parsed message:')) return ''
  if (lower.includes('"role":"assistant"') || lower.includes('"role":"user"')) return ''
  if (line.includes('<|im_start|>') || line.includes('<!DOCTYPE html')) return ''
  if (runtimePrefix.test(line)) return line
  if (lower.includes('server is listening') || lower.includes('listening on') || lower.includes('model loaded')) return line
  if (source === 'desktop' && !lower.includes('prompt')) return line

  return ''
}

function visibleTerminalLogs(limit = 520) {
  return (state.logs || [])
    .map(entry => terminalLineForDisplay(entry))
    .filter(Boolean)
    .slice(-limit)
}

function renderLogRow(entry, className = 'terminal-row') {
  return `
    <div class="${className}">
      <span>${escapeHtml(shortTime(entry.at))}</span>
      <strong>${escapeHtml(entry.source || 'log')}</strong>
      <em>${escapeHtml(entry.line || '')}</em>
    </div>
  `
}

function renderSidebarLogs() {
  const logs = visibleLogs(80)
  if (!logs.length) {
    return '<div class="terminal-empty">还没有终端日志。启动服务后，这里会实时出现 llama.cpp 输出。</div>'
  }

  return logs
    .reverse()
    .map(entry => `
      <button type="button" class="terminal-item" data-action="open-log-settings">
        <span>${escapeHtml(shortTime(entry.at))}</span>
        <strong>${escapeHtml(entry.source || 'log')}</strong>
        <em>${escapeHtml(entry.line || '')}</em>
      </button>
    `)
    .join('')
}

function pill(ok, labelOk = '就绪', labelBad = '缺失') {
  return `<span class="pill ${ok ? 'good' : 'bad'}">${ok ? labelOk : labelBad}</span>`
}

function field(name, label, options = {}) {
  const directMode = (state.config?.launch_mode || 'direct') !== 'launcher'
  if (directMode && ['config_path', 'launcher_path', 'llama_server_path'].includes(name)) {
    return ''
  }

  const value = state.config?.[name] ?? ''
  const type = options.type || 'text'
  const picker = options.pick
    ? `<button class="icon-btn text-btn" type="button" data-pick="${name}" data-kind="${options.pick}">选择</button>`
    : ''
  const hint = options.hint ? `<div class="hint">${escapeHtml(options.hint)}</div>` : ''
  const input = options.textarea
    ? `<textarea data-field="${name}" spellcheck="false">${escapeHtml(value)}</textarea>`
    : `<input data-field="${name}" type="${type}" value="${escapeHtml(value)}" ${options.min !== undefined ? `min="${options.min}"` : ''} />`

  return `
    <label class="field">
      <span>${escapeHtml(label)}</span>
      <div class="${picker ? 'field-row' : ''}">
        ${input}
        ${picker}
      </div>
      ${hint}
    </label>
  `
}

function selectField(name, label, choices, hint = '') {
  const value = state.config?.[name] ?? ''
  const directMode = (state.config?.launch_mode || 'direct') !== 'launcher'
  const extra = name === 'launch_mode' && directMode
    ? field('llama_bin_dir', 'llama.cpp 原文件目录', { pick: 'dir', hint: '选择包含 llama-server.exe 和 CUDA / ggml DLL 的原始目录。' })
    : ''
  const options = choices
    .map(choice => `<option value="${escapeHtml(choice)}" ${String(choice) === String(value) ? 'selected' : ''}>${escapeHtml(choice || 'auto')}</option>`)
    .join('')
  return `
    <label class="field">
      <span>${escapeHtml(label)}</span>
      <select data-field="${name}">${options}</select>
      ${hint ? `<div class="hint">${escapeHtml(hint)}</div>` : ''}
    </label>
  ${extra}`
}

function switchField(name, label, hint) {
  return `
    <label class="switch">
      <span>
        <strong>${escapeHtml(label)}</strong>
        <em>${escapeHtml(hint)}</em>
      </span>
      <input data-field="${name}" type="checkbox" ${state.config?.[name] ? 'checked' : ''} />
    </label>
  `
}

function renderSidebar() {
  const query = state.historySearch.trim().toLowerCase()
  const sessions = state.sessions
    .filter(session => !query || String(session.title || '').toLowerCase().includes(query))
    .slice(0, 28)
    .map(session => `
      <div class="history-row ${session.id === state.currentSessionId ? 'active' : ''}">
        <button type="button" class="history-item" data-session="${escapeHtml(session.id)}" title="${escapeAttribute(session.title || '')}">
          <strong>${escapeHtml(session.title || '新聊天')}</strong>
          <span>${escapeHtml(shortTime(session.updatedAt))}</span>
        </button>
        <button type="button" class="history-more" data-action="toggle-history-menu" data-session-id="${escapeHtml(session.id)}" title="More">...</button>
        ${
          state.historyMenuId === session.id
            ? `<div class="history-menu">
                <button type="button" data-action="history-edit" data-session-id="${escapeHtml(session.id)}"><span class="history-menu-icon">&#9998;</span>Edit</button>
                <button type="button" data-action="history-export" data-session-id="${escapeHtml(session.id)}"><span class="history-menu-icon">&#8681;</span>Export</button>
                <button type="button" class="danger" data-action="history-delete" data-session-id="${escapeHtml(session.id)}"><span class="history-menu-icon">&#128465;</span>Delete</button>
              </div>`
            : ''
        }
      </div>
    `)
    .join('')

  return `
    <aside class="sidebar">
      <div class="brand-row">
        <div class="app-mark">ll</div>
        <div class="brand-copy">
          <strong>llama.cpp</strong>
          <span>OpenAI compatible local endpoint</span>
        </div>
      </div>

      <button type="button" class="side-action ${state.view === 'chat' && state.chatMessages.length === 0 ? 'active' : ''}" data-action="new-chat">新聊天</button>
      <button type="button" class="side-action ${state.sidebarPanel === 'chats' ? 'active' : ''}" data-action="focus-chat">搜索对话</button>
      <button type="button" class="side-action ${state.view === 'terminal' ? 'active' : ''}" data-action="show-terminal">终端日志</button>

      <input class="history-search" data-history-search placeholder="搜索历史对话..." value="${escapeHtml(state.historySearch)}" />

      <div class="side-section-label">历史对话</div>
      <div class="history-list">
        ${sessions || '<div class="terminal-empty">还没有历史对话。发出第一条消息后会自动保存。</div>'}
      </div>

      <div class="side-bottom">
        <button type="button" class="status-card" data-action="toggle-settings">
          <span class="status-dot ${statusClass()}"></span>
          <span>
            <strong>${statusLabel()}</strong>
            <em>${escapeHtml(state.status.url || '')}</em>
          </span>
        </button>
      </div>
    </aside>
  `
}

function renderAttachmentChips(attachments, removable, role = 'composer') {
  if (!attachments || attachments.length === 0) {
    return ''
  }
  const mode = role === 'user' ? 'message-user' : removable ? 'composer' : 'message'

  return `
    <div class="attachment-row ${role === 'user' ? 'message-attachment-row' : ''}">
      ${attachments.map((item, index) => renderAttachmentItem(item, index, removable, mode)).join('')}
    </div>
  `
}

function renderTerminalPanel() {
  const logs = visibleTerminalLogs()
  const hiddenCount = Math.max(0, (state.logs || []).length - logs.length)
  const logRows = logs.length
    ? logs.map(line => `<div class="terminal-line">${escapeHtml(line)}</div>`).join('')
    : '<div class="terminal-line terminal-muted">Waiting for llama.cpp server output...</div>'

  return `
    <section class="terminal-screen">
      <div class="terminal-head">
        <div>
          <span>终端日志</span>
          <strong>llama.cpp server output</strong>
        </div>
        <button type="button" class="outline-btn" data-action="return-chat">回到聊天</button>
      </div>
      <div class="terminal-summary">
        <span>正常终端视图：只显示 llama.cpp/server/runtime 输出。</span>
        ${hiddenCount ? `<strong>已隐藏 ${hiddenCount} 条聊天回显、JSON chunk、prompt 或轮询日志。</strong>` : ''}
      </div>
      <div class="terminal-console" id="inlineLogBox">${logRows}</div>
    </section>
  `
}

function renderPreviewModal() {
  if (!state.preview) return ''
  const previewType = state.preview.type || 'code'
  const code = state.preview.code || ''
  const language = state.preview.language || 'html'
  const srcdoc = canPreviewCode(language, code)
    ? code
    : `<pre style="font: 14px/1.6 Consolas, monospace; white-space: pre-wrap;">${escapeHtml(code)}</pre>`
  const body = previewType === 'image'
    ? `
      <div class="preview-image-wrap">
        <img src="${escapeAttribute(state.preview.src || '')}" alt="${escapeAttribute(state.preview.title || '图片预览')}" />
      </div>
    `
    : `<iframe sandbox="allow-scripts allow-same-origin" srcdoc="${escapeAttribute(srcdoc)}"></iframe>`

  return `
    <div class="preview-backdrop" data-action="close-preview"></div>
    <section class="preview-panel">
      <div class="preview-head">
        <div>
          <span>预览</span>
          <strong>${escapeHtml(state.preview.title || (previewType === 'image' ? '图片预览' : language.toUpperCase()))}</strong>
        </div>
        <button type="button" class="icon-btn" data-action="close-preview">X</button>
      </div>
      ${body}
    </section>
  `
}

function renderHistoryDialog() {
  if (!state.historyDialog) return ''
  const session = state.sessions.find(item => item.id === state.historyDialog.sessionId)
  if (!session) return ''
  const title = session.title || '新聊天'

  if (state.historyDialog.type === 'edit') {
    return `
      <div class="dialog-backdrop" data-action="close-history-dialog"></div>
      <section class="history-dialog">
        <h2>编辑对话名称</h2>
        <input data-history-title-input value="${escapeAttribute(title)}" />
        <div class="dialog-actions">
          <button type="button" class="outline-btn" data-action="close-history-dialog">取消</button>
          <button type="button" class="primary-btn" data-action="history-save-title" data-session-id="${escapeHtml(session.id)}">保存</button>
        </div>
      </section>
    `
  }

  return `
    <div class="dialog-backdrop" data-action="close-history-dialog"></div>
    <section class="history-dialog">
      <h2><span class="danger-glyph">&#128465;</span>删除对话</h2>
      <p>你确定要删除“${escapeHtml(title)}”吗？此操作无法撤销，且会永久删除本次对话中的所有信息。</p>
      <div class="dialog-actions">
        <button type="button" class="outline-btn" data-action="close-history-dialog">取消</button>
        <button type="button" class="danger-solid-btn" data-action="history-confirm-delete" data-session-id="${escapeHtml(session.id)}">删除</button>
      </div>
    </section>
  `
}

function renderModelInfoModal() {
  if (!state.modelInfoOpen) return ''

  const info = state.modelInfo || {}
  const { rows, runtimeRows, templateText } = buildBetterModelInfoRows(info)
  const body = info.loading
    ? '<div class="model-info-empty">正在读取当前模型信息...</div>'
    : info.error
      ? `<div class="model-info-empty error">${escapeHtml(info.error)}</div>`
      : `
        <div class="model-info-columns">
          <div class="model-info-card">
            <div class="model-template-head compact-head"><span>模型信息</span></div>
            <div class="model-info-grid">
              ${rows
                .map(row => `
                  <div class="model-info-row">
                    <span>${escapeHtml(row.label)}</span>
                    <strong title="${escapeAttribute(row.value)}">${escapeHtml(row.value)}</strong>
                    ${row.copy ? `<button type="button" class="icon-copy-btn" data-action="copy-model-info" data-copy="${escapeAttribute(row.copy)}" title="复制">${renderCopyIcon()}</button>` : '<div></div>'}
                  </div>
                `)
                .join('')}
            </div>
          </div>
          <div class="model-info-card">
            <div class="model-template-head compact-head"><span>本地运行参数</span></div>
            <div class="model-info-grid">
              ${runtimeRows
                .map(row => `
                  <div class="model-info-row">
                    <span>${escapeHtml(row.label)}</span>
                    <strong title="${escapeAttribute(row.value)}">${escapeHtml(row.value)}</strong>
                    ${row.copy ? `<button type="button" class="icon-copy-btn" data-action="copy-model-info" data-copy="${escapeAttribute(row.copy)}" title="复制">${renderCopyIcon()}</button>` : '<div></div>'}
                  </div>
                `)
                .join('')}
            </div>
          </div>
        </div>
        <div class="model-template-card">
          <div class="model-template-head">
            <span>聊天模板</span>
            <button type="button" class="outline-btn small-btn" data-action="copy-model-info" data-copy="${escapeAttribute(templateText)}">复制</button>
          </div>
          <pre>${escapeHtml(templateText)}</pre>
        </div>
      `

  return `
    <div class="dialog-backdrop" data-action="close-model-info"></div>
    <section class="model-info-panel">
      <div class="model-info-head">
        <div>
          <span>模型信息</span>
          <strong>当前模型细节与本地运行参数</strong>
        </div>
        <button type="button" class="icon-btn" data-action="close-model-info">&times;</button>
      </div>
      <div class="model-info-body">${body}</div>
    </section>
  `
}

function renderChat() {
  const messages = state.chatMessages.length
    ? state.chatMessages
        .map((message, index) => {
          const content = renderMessageContent(message, index)
          const attachments = renderAttachmentChips(message.attachments || [], false, message.role)
          const body = message.role === 'user'
            ? `
              ${attachments}
              ${content ? `<div class="bubble">${content}</div>` : ''}
            `
            : `
              <div class="bubble">
                ${content}
              </div>
              ${attachments}
            `

          return `
            <article class="message ${escapeHtml(message.role)}" data-message-index="${index}">
              <div class="avatar">${message.role === 'user' ? '你' : message.role === 'assistant' ? 'll' : 'sys'}</div>
              <div class="message-body">
                ${body}
                ${renderMessageMeta(message)}
                ${renderMessageActions(index, message)}
              </div>
            </article>
          `
        })
        .join('')
    : `
      <div class="empty-state">
        <h1>llama.cpp</h1>
        <p>输入消息，或把本地服务接给 OpenClaw、Claude Code 和任何 OpenAI 兼容客户端。</p>
      </div>
    `

  return `
    <section class="chat-screen ${state.chatMessages.length ? '' : 'empty-chat'}">
      <div class="chat-feed" id="chatFeed">${messages}</div>
      <div class="composer-wrap">
        ${renderAttachmentChips(state.attachments, true, 'composer')}
        <div class="composer">
          <div class="attach-wrap">
            <button class="round-btn" type="button" data-action="toggle-attachment-menu" title="添加内容">+</button>
          </div>
          <textarea data-chat-input spellcheck="false" placeholder="输入一条消息……">${escapeHtml(state.chatInput)}</textarea>
          <button class="model-chip model-trigger" type="button" data-action="open-model-info" title="${escapeHtml(state.config?.model || '')}">
            <span class="model-chip-icon">${renderModelChipIcon()}</span>
            <span class="model-chip-label">${escapeHtml(modelName())}</span>
          </button>
          <button class="send-btn" type="button" data-action="send-chat" ${state.chatBusy ? 'disabled' : ''}>
            ${state.chatBusy ? '...' : '↑'}
          </button>
        </div>
        <div class="composer-hint">按住 Enter 发送，Shift + Enter 换行</div>
      </div>
    </section>
  `
}

function attachmentMenuItems() {
  return `
    <button type="button" data-action="pick-image"><span class="menu-icon image"></span>图片</button>
    <button type="button" disabled title="暂不支持视频理解"><span class="menu-icon video"></span>视频文件</button>
    <button type="button" data-action="pick-audio"><span class="menu-icon audio"></span>音频文件</button>
    <button type="button" data-action="pick-text"><span class="menu-icon text"></span>文本文件</button>
    <button type="button" data-action="pick-pdf"><span class="menu-icon pdf"></span>PDF 文件</button>
    <button type="button" data-action="insert-system-message"><span class="menu-icon system"></span>系统消息</button>
  `
}

function renderAttachmentMenuPortal() {
  if (!state.attachmentMenuOpen) return ''
  const fallback = { left: 0, top: 0 }
  const position = state.attachmentMenuPosition || fallback
  return `
    <div class="attach-menu-backdrop" data-action="close-attachment-menu"></div>
    <div class="attach-menu floating" style="left: ${Number(position.left) || 0}px; top: ${Number(position.top) || 0}px;">
      ${attachmentMenuItems()}
    </div>
  `
}

function openAttachmentMenu(button) {
  const rect = button.getBoundingClientRect()
  const menuWidth = 206
  const menuHeight = 252
  const gap = 8
  const minPad = 12
  const left = Math.min(Math.max(rect.left, minPad), window.innerWidth - menuWidth - minPad)
  const below = rect.bottom + gap
  const above = rect.top - menuHeight - gap
  const top = below + menuHeight < window.innerHeight - minPad
    ? below
    : Math.max(minPad, above)

  state.attachmentMenuOpen = true
  state.attachmentMenuPosition = {
    left: Math.round(left),
    top: Math.round(top),
  }
}

function renderSettingsSection(id, content) {
  return `<section class="settings-section ${state.active === id ? 'active' : ''}">${content}</section>`
}

function renderSettingsContent() {
  const v = state.validation || {}
  const checks = `
    <div class="checks">
      <div><span>配置文件</span>${pill(v.configExists)}</div>
      <div><span>启动器</span>${pill(v.launcherExists)}</div>
      <div><span>llama-server</span>${pill(v.serverExists)}</div>
      <div><span>模型文件</span>${pill(v.modelExists)}</div>
      <div><span>保存状态</span>${state.dirty ? '<span class="pill warn">未保存</span>' : '<span class="pill good">已保存</span>'}</div>
    </div>
  `

  return `
    ${renderSettingsSection('paths', `
      <div class="settings-note">这里控制桌面端调用哪个启动器，以及启动器使用哪个 llama-server.exe。</div>
      <div class="form-grid single">
        ${selectField('launch_mode', '启动方式', ['direct', 'launcher'], 'direct = 直接启动 llama-server.exe；launcher = 兼容旧启动器')}
        ${field('config_path', '配置文件', { pick: 'toml', hint: '默认使用启动器目录下的 config.toml。' })}
        ${field('launcher_path', '启动器 EXE', { pick: 'exe', hint: '桌面端启动服务时调用这个程序。' })}
        ${field('llama_server_path', 'llama-server.exe', { pick: 'exe', hint: '保存后写入 config.toml 的 llama_server_path。' })}
      </div>
    `)}

    ${renderSettingsSection('model', `
      <div class="settings-note">选择 GGUF 模型。纯文本模型可以不填 mmproj。</div>
      <div class="form-grid single">
        ${field('model', '模型文件', { pick: 'gguf', hint: '例如 Qwen3.5-9B.Q4_K_M.gguf。' })}
        ${field('mmproj', 'mmproj 投影文件', { pick: 'gguf', hint: '视觉或多模态模型才需要。' })}
        ${field('chat_template_kwargs', 'Chat Template Kwargs', { textarea: true, hint: '例如 {"enable_thinking": false}。' })}
      </div>
    `)}

    ${renderSettingsSection('runtime', `
      <div class="settings-note">给外部客户端接入时，通常保留 host=0.0.0.0 和 port=8080。</div>
      <div class="form-grid two">
        ${field('host', 'Host')}
        ${field('port', 'Port', { type: 'number', min: 1 })}
        ${field('ctx_size', '上下文长度 ctx_size', { type: 'number', min: 1 })}
        ${field('n_predict', '输出长度 n_predict', { type: 'number' })}
        ${field('n_gpu_layers', 'GPU 层数 n_gpu_layers', { type: 'number' })}
        ${field('request_timeout_ms', '请求超时 ms', { type: 'number', min: 30000 })}
        ${field('log_verbosity', '日志等级', { type: 'number' })}
      </div>
      <div class="switch-grid">
        ${switchField('verbose', '详细日志', '排查问题时打开。')}
        ${switchField('webui', 'llama.cpp Web UI', '不是桌面端主入口，但可保留。')}
        ${switchField('embeddings', 'Embeddings', '需要向量接口时打开。')}
        ${switchField('continuous_batching', 'Continuous batching', '多客户端请求更平稳。')}
      </div>
    `)}

    ${renderSettingsSection('sampling', `
      <div class="settings-note">这些参数影响回答风格和随机性。</div>
      <div class="form-grid two">
        ${field('temp', 'Temperature', { type: 'number' })}
        ${field('top_k', 'Top-K', { type: 'number' })}
        ${field('top_p', 'Top-P', { type: 'number' })}
        ${field('min_p', 'Min-P', { type: 'number' })}
        ${field('presence_penalty', 'Presence penalty', { type: 'number' })}
        ${field('repeat_penalty', 'Repeat penalty', { type: 'number' })}
      </div>
    `)}

    ${renderSettingsSection('system', `
      <div class="settings-note">没有明确需求时可以留空，由 llama.cpp 自动决定。</div>
      <div class="form-grid two">
        ${field('threads', 'Threads', { type: 'number' })}
        ${field('threads_batch', 'Threads batch', { type: 'number' })}
        ${field('batch_size', 'Batch size', { type: 'number' })}
        ${field('ubatch_size', 'Ubatch size', { type: 'number' })}
        ${selectField('split_mode', 'Split mode', ['', 'layer', 'row', 'none'])}
        ${field('tensor_split', 'Tensor split')}
        ${field('device', 'Device')}
        ${field('main_gpu', 'Main GPU', { type: 'number' })}
        ${field('n_cpu_moe', 'n_cpu_moe', { type: 'number' })}
      </div>
      <div class="switch-grid">${switchField('cpu_moe', 'MoE 权重保留在 CPU', '显存紧张时有用。')}</div>
    `)}

    ${renderSettingsSection('logs', `
      <div class="settings-note">ANSI 颜色码会被过滤，方便直接看真正的 llama.cpp 输出。</div>
      <div class="log-box" id="logBox">
        ${
          visibleLogs().length
            ? visibleLogs().map(entry => renderLogRow(entry, 'log-entry')).join('')
            : '<div class="empty-log">还没有日志。启动服务后会在这里显示。</div>'
        }
      </div>
    `)}

    ${state.active === 'chat' ? `
      <section class="settings-section active">
        <div class="settings-note">服务状态和接入信息。</div>
        ${checks}
        <div class="endpoint-box">
          <span>OpenAI Base URL</span>
          <strong>${escapeHtml(state.status.url || '')}/v1</strong>
        </div>
        <div class="endpoint-box">
          <span>Chat Completions</span>
          <strong>${escapeHtml(state.status.url || '')}/v1/chat/completions</strong>
        </div>
      </section>
    ` : ''}
  `
}

function renderSettingsPanel() {
  const v = state.validation || {}
  return `
    <div class="settings-backdrop ${state.settingsOpen ? 'show' : ''}" data-action="close-settings"></div>
    <aside class="settings-panel ${state.settingsOpen ? 'show' : ''}">
      <div class="settings-rail">
        <div class="settings-badge">独立设置</div>
        <h2>把配置和日常工作区彻底分开。</h2>
        <p>这里集中设置路径、模型、上下文、采样和 GPU 参数。主界面只保留聊天、服务状态和快捷操作。</p>
        <nav class="settings-rail-tabs">
          ${sections
            .filter(([id]) => id !== 'chat')
            .map(([id, label, hint]) => `
              <button type="button" class="${state.active === id ? 'active' : ''}" data-section="${id}">
                <strong>${escapeHtml(label)}</strong>
                <span>${escapeHtml(hint)}</span>
              </button>
            `)
            .join('')}
        </nav>
        <div class="progress-card">
          <strong>当前进度</strong>
          <div><span>配置文件</span>${pill(v.configExists)}</div>
          <div><span>启动器</span>${pill(v.launcherExists)}</div>
          <div><span>llama-server</span>${pill(v.serverExists)}</div>
          <div><span>模型文件</span>${pill(v.modelExists)}</div>
        </div>
      </div>
      <div class="settings-main">
        <div class="settings-head">
          <div>
            <span>设置</span>
            <strong>${escapeHtml((sections.find(([id]) => id === state.active) || sections[0])[1])}</strong>
          </div>
          <button type="button" class="icon-btn" data-action="close-settings">×</button>
        </div>
        <div class="settings-body">${renderSettingsContent()}</div>
        <div class="settings-foot">
          <button class="outline-btn" type="button" data-action="save">保存</button>
          <button class="primary-btn" type="button" data-action="close-settings">完成</button>
        </div>
      </div>
    </aside>
  `
}

function renderModernSettingsCard(title, text, body) {
  return `
    <section class="settings-stack-card">
      <header>
        <strong>${escapeHtml(title)}</strong>
        ${text ? `<span>${escapeHtml(text)}</span>` : ''}
      </header>
      ${body}
    </section>
  `
}

function renderModernSettingsContent() {
  const tab = currentSettingsTabId()
  const v = state.validation || {}
  const launch = state.launch || {}
  const checks = `
    <div class="checks">
      <div><span>配置文件</span>${pill(v.configExists)}</div>
      <div><span>启动器</span>${pill(v.launcherExists)}</div>
      <div><span>llama-server</span>${pill(v.serverExists)}</div>
      <div><span>模型文件</span>${pill(v.modelExists)}</div>
      <div><span>保存状态</span>${state.dirty ? '<span class="pill warn">未保存</span>' : '<span class="pill good">已保存</span>'}</div>
    </div>
  `

  if (tab === 'overview') {
    return `
      <div class="settings-stack">
        ${renderModernSettingsCard('当前接入状态', '这里集中放服务入口、上下文和启动模式。', `
          ${checks}
          <div class="endpoint-box">
            <span>OpenAI Base URL</span>
            <strong>${escapeHtml(state.status.url || '')}/v1</strong>
          </div>
          <div class="endpoint-box">
            <span>Chat Completions</span>
            <strong>${escapeHtml(state.status.url || '')}/v1/chat/completions</strong>
          </div>
        `)}
        ${renderModernSettingsCard('运行参数', '桌面端直连 llama.cpp 时，这一组就是最常用的核心参数。', `
          <div class="form-grid two">
            ${selectField('launch_mode', '启动方式', ['direct', 'launcher'], 'direct = 直接调用 llama-server.exe；launcher = 兼容旧启动器')}
            ${field('host', 'Host')}
            ${field('port', 'Port', { type: 'number', min: 1 })}
            ${field('ctx_size', '上下文大小 ctx_size', { type: 'number', min: 1 })}
            ${field('n_predict', '最大输出 n_predict', { type: 'number' })}
            ${field('n_gpu_layers', 'GPU 层数', { type: 'number' })}
            ${field('request_timeout_ms', '请求超时 ms', { type: 'number', min: 30000 })}
          </div>
          <div class="settings-callout">32GB 内存建议先用 32768 或 65536 上下文。131072 这类超长上下文会显著增加 KV cache，占满内存是正常风险。</div>
        `)}
        ${renderModernSettingsCard('最终启动命令', '速度或参数不对时，先复制这里和原生命令行对比。', `
          <div class="command-preview ${launch.error ? 'has-error' : ''}">
            <pre>${escapeHtml(launch.error || launch.preview || '保存配置后会在这里生成完整命令。')}</pre>
            <button type="button" class="outline-btn small-btn" data-action="copy-launch-command" ${launch.preview && !launch.error ? '' : 'disabled'}>复制命令</button>
          </div>
        `)}
      </div>
    `
  }

  if (tab === 'display') {
    return `
      <div class="settings-stack">
        ${renderModernSettingsCard('当前模型', '这里补上了网页端那种可查看详情的模型入口。', `
          <div class="settings-inline-actions">
            <button type="button" class="model-chip model-trigger wide" data-action="open-model-info" title="${escapeHtml(state.config?.model || '')}">
              <span class="model-chip-icon">${renderModelChipIcon()}</span>
              <span class="model-chip-label">${escapeHtml(modelName())}</span>
            </button>
            <button type="button" class="outline-btn" data-action="open-model-info">查看模型信息</button>
          </div>
        `)}
        ${renderModernSettingsCard('模型与模板', '切换 GGUF、视觉投影和模板参数。', `
          <div class="form-grid single">
            ${field('model', '模型文件', { pick: 'gguf', hint: '例如 Qwen3.5-9B.Q4_K_M.gguf' })}
            ${field('mmproj', 'mmproj 投影文件', { pick: 'gguf', hint: '视觉或多模态模型才需要' })}
            ${field('chat_template_kwargs', 'Chat Template Kwargs', { textarea: true, hint: '会同时作为启动参数和每次请求参数发送。可写 {"enable_thinking":false}，也兼容 --chat-template-kwargs \'{\\"enable_thinking\\":false}\'。支持的模型还可加 "thinking_budget": 0。' })}
          </div>
          <div class="settings-callout">注意：这是控制模型是否生成思考；下面的“显示思考过程”只是控制桌面端是否把已返回的 <think> 展示出来。图片理解需要视觉模型和 mmproj。</div>
        `)}
        ${renderModernSettingsCard('展示开关', '把网页端常见的显示项集中到一起。', `
          <div class="switch-grid">
            ${switchField('show_thinking', '显示思考过程', '解析模型返回的 <think> 区块。')}
            ${switchField('expand_thinking', '默认展开思考', '关闭时会折叠成一行。')}
            ${switchField('show_raw_output', '显示原始输出', '排查模板和思考模式时使用。')}
            ${switchField('webui', '保留 llama.cpp Web UI', '保留浏览器页入口，方便双开调试。')}
            ${switchField('verbose', '显示详细日志', '输出更多服务端信息，便于排查。')}
          </div>
        `)}
      </div>
    `
  }

  if (tab === 'sampling') {
    return renderModernSettingsCard('采样', '控制回答的随机性和分布范围。', `
      <div class="form-grid two">
        ${field('temp', 'Temperature', { type: 'number' })}
        ${field('top_k', 'Top-K', { type: 'number' })}
        ${field('top_p', 'Top-P', { type: 'number' })}
        ${field('min_p', 'Min-P', { type: 'number' })}
      </div>
    `)
  }

  if (tab === 'penalty') {
    return renderModernSettingsCard('惩罚项', '把重复控制单独抽出来，更接近网页端设置分栏。', `
      <div class="form-grid two">
        ${field('presence_penalty', 'Presence penalty', { type: 'number' })}
        ${field('repeat_penalty', 'Repeat penalty', { type: 'number' })}
      </div>
    `)
  }

  if (tab === 'io') {
    return `
      <div class="settings-stack">
        ${renderModernSettingsCard('路径', '桌面端直连模式下，真正关键的是 llama-server.exe 和模型文件。', `
          <div class="form-grid single">
            ${field('config_path', '配置文件', { pick: 'toml', hint: '仅在兼容旧启动器时使用' })}
            ${field('launcher_path', '启动器 EXE', { pick: 'exe', hint: '仅在 launcher 模式下需要' })}
            ${field('llama_server_path', 'llama-server.exe', { pick: 'exe', hint: 'direct 模式会直接调用它' })}
          </div>
        `)}
      </div>
    `
  }

  if (tab === 'mcp') {
    return renderModernSettingsCard('MCP 服务', '这里先把界面结构预留成网页端那种独立分类。', `
      <div class="settings-mcp-placeholder">
        <strong>未接入原生 MCP 服务</strong>
        <p>当前这个桌面端仍以 llama.cpp 的 OpenAI 兼容接口为主。后续如果你想把工具服务接进来，我们可以继续把这里做成真正可配置的面板。</p>
      </div>
    `)
  }

  if (tab === 'developer') {
    return `
      <div class="settings-stack">
        ${renderModernSettingsCard('线程与设备', '批处理、线程和 GPU 分配都放在开发者页。', `
          <div class="form-grid two">
            ${field('threads', 'Threads', { type: 'number' })}
            ${field('threads_batch', 'Threads batch', { type: 'number' })}
            ${field('batch_size', 'Batch size', { type: 'number' })}
            ${field('ubatch_size', 'Ubatch size', { type: 'number' })}
            ${selectField('split_mode', 'Split mode', ['', 'layer', 'row', 'none'])}
            ${field('tensor_split', 'Tensor split')}
            ${field('device', 'Device')}
            ${field('main_gpu', 'Main GPU', { type: 'number' })}
            ${field('n_cpu_moe', 'n_cpu_moe', { type: 'number' })}
            ${field('log_verbosity', '日志等级', { type: 'number' })}
          </div>
          <div class="settings-callout">多 GPU 取决于本地 llama.cpp 的编译版本和硬件环境。常见参数是 split-mode、tensor-split 和 main-gpu。</div>
        `)}
        ${renderModernSettingsCard('自定义附加参数', '临时放 ngram、多卡、speculative decoding 等高级参数。', `
          <div class="form-grid single">
            ${field('extra_args', '追加到 llama-server 的参数', { textarea: true, hint: '例如 --flash-attn --no-mmap。参数会追加到最终启动命令末尾，需要与你本机 llama.cpp 版本匹配。' })}
          </div>
          <div class="command-preview compact ${launch.error ? 'has-error' : ''}">
            <pre>${escapeHtml(launch.error || launch.preview || '保存配置后会在这里生成完整命令。')}</pre>
            <button type="button" class="outline-btn small-btn" data-action="copy-launch-command" ${launch.preview && !launch.error ? '' : 'disabled'}>复制命令</button>
          </div>
        `)}
        ${renderModernSettingsCard('开发者开关', '保留性能和调试相关开关。', `
          <div class="switch-grid">
            ${switchField('cpu_moe', 'MoE 放在 CPU', '显存紧张时更稳。')}
            ${switchField('embeddings', 'Embeddings', '需要向量接口时开启。')}
            ${switchField('continuous_batching', 'Continuous batching', '多请求场景更平滑。')}
            ${switchField('verbose', 'Verbose', '输出更细的服务端日志。')}
          </div>
        `)}
      </div>
    `
  }

  return renderModernSettingsCard('日志', 'ANSI 颜色码已被过滤，方便直接看真正的 llama.cpp 输出。', `
    <div class="log-box" id="logBox">
      ${
        visibleLogs().length
          ? visibleLogs().map(entry => renderLogRow(entry, 'log-entry')).join('')
          : '<div class="empty-log">还没有日志。启动服务后会在这里实时显示。</div>'
      }
    </div>
  `)
}

function renderModernSettingsPanel() {
  const v = state.validation || {}
  const [activeId, activeIcon, activeLabel, activeHint] = currentSettingsTabMeta()
  return `
    <div class="settings-backdrop ${state.settingsOpen ? 'show' : ''}" data-action="close-settings"></div>
    <aside class="settings-panel ${state.settingsOpen ? 'show' : ''}">
      <div class="settings-rail">
        <div class="settings-badge">独立设置</div>
        <h2>把模型、参数和调试页收进一个桌面端设置中心。</h2>
        <p>这里继续沿用你的本地 llama.cpp 服务，但交互和分栏会尽量往网页端那种设置面板去靠。</p>
        <nav class="settings-rail-tabs">
          ${settingsTabs
            .map(([id, _icon, label, hint]) => `
              <button type="button" class="${activeId === id ? 'active' : ''}" data-section="${id}">
                <span class="settings-tab-icon">${renderSettingsTabIcon(id)}</span>
                <span class="settings-tab-copy">
                  <strong>${escapeHtml(label)}</strong>
                  <span>${escapeHtml(hint)}</span>
                </span>
              </button>
            `)
            .join('')}
        </nav>
        <div class="progress-card">
          <strong>当前进度</strong>
          <div><span>配置文件</span>${pill(v.configExists)}</div>
          <div><span>启动器</span>${pill(v.launcherExists)}</div>
          <div><span>llama-server</span>${pill(v.serverExists)}</div>
          <div><span>模型文件</span>${pill(v.modelExists)}</div>
        </div>
      </div>
      <div class="settings-main">
        <div class="settings-head">
          <div>
            <span>设置</span>
            <strong>${escapeHtml(activeLabel)}</strong>
            <em>${escapeHtml(activeHint)}</em>
          </div>
          <button type="button" class="icon-btn" data-action="close-settings">×</button>
        </div>
        <div class="settings-body">${renderModernSettingsContent()}</div>
        <div class="settings-foot">
          <button class="outline-btn" type="button" data-action="save">保存</button>
          <button class="primary-btn" type="button" data-action="close-settings">完成</button>
        </div>
      </div>
    </aside>
  `
}

function render(options = {}) {
  if (!state.config) {
    appEl.innerHTML = '<div class="boot">正在读取配置...</div>'
    return
  }

  const previousFeed = document.getElementById('chatFeed')
  const previousFeedTop = previousFeed?.scrollTop || 0
  const previousFeedHeight = previousFeed?.scrollHeight || 0
  const shouldStick = options.stickToBottom ?? isNearBottom(previousFeed)
  const running = state.status.state === 'running' || state.status.state === 'starting'
  appEl.innerHTML = `
    <div class="drag-region">
      <button type="button" class="sidebar-toggle" data-action="toggle-sidebar" title="${state.sidebarCollapsed ? '显示侧边栏' : '隐藏侧边栏'}">${renderSidebarToggleIcon()}</button>
      <button type="button" class="gear-btn" data-action="toggle-settings" title="打开设置">${renderGearIcon()}</button>
    </div>
    <div class="app-shell ${state.sidebarCollapsed ? 'sidebar-collapsed' : ''}">
      ${renderSidebar()}
      <main class="main-area">
        ${state.view === 'terminal' ? renderTerminalPanel() : renderChat()}
        <footer class="service-bar">
          <div class="service-left">
            <span class="status-dot ${statusClass()}"></span>
            <span>${statusLabel()} · ${escapeHtml(compactStatusMessage(state.status.message || ''))}</span>
            <code>${escapeHtml(state.status.url || '')}</code>
          </div>
          <div class="service-actions">
            <button class="outline-btn" type="button" data-action="save" ${state.busy ? 'disabled' : ''}>保存配置</button>
            <button class="outline-btn" type="button" data-action="health">检查端口</button>
            ${
              running
                ? `<button class="danger-btn" type="button" data-action="stop" ${state.busy ? 'disabled' : ''}>停止服务</button>`
                : `<button class="primary-btn" type="button" data-action="start" ${state.busy ? 'disabled' : ''}>保存并启动</button>`
            }
          </div>
        </footer>
      </main>
      ${renderModernSettingsPanel()}
    </div>
    ${renderPreviewModal()}
    ${renderModelInfoModal()}
    ${renderHistoryDialog()}
    ${renderAttachmentMenuPortal()}
    <div class="toast ${state.toast ? 'show' : ''}">${escapeHtml(state.toast)}</div>
  `

  const chatFeed = document.getElementById('chatFeed')
  if (chatFeed) {
    if (options.jumpToBottom) {
      chatFeed.scrollTop = chatFeed.scrollHeight
    } else if (options.preserveChatScroll && previousFeed) {
      chatFeed.scrollTop = shouldStick ? chatFeed.scrollHeight : previousFeedTop + (chatFeed.scrollHeight - previousFeedHeight)
    } else if (shouldStick) {
      chatFeed.scrollTop = chatFeed.scrollHeight
    }
    scrollOpenRawOutputs(chatFeed)
  }
  const logBox = document.getElementById('logBox')
  if (logBox) logBox.scrollTop = logBox.scrollHeight
  const inlineLogBox = document.getElementById('inlineLogBox')
  if (inlineLogBox) inlineLogBox.scrollTop = inlineLogBox.scrollHeight
  const historyList = document.querySelector('.history-list')
  if (historyList && options.resetHistoryScroll) historyList.scrollTop = 0
}

function setToast(message) {
  state.toast = message
  render()
  window.clearTimeout(setToast.timer)
  setToast.timer = window.setTimeout(() => {
    state.toast = ''
    render()
  }, 2800)
}

function patchFromBackend(payload) {
  if (payload.config) state.config = payload.config
  if (payload.validation) state.validation = payload.validation
  if (payload.status) state.status = payload.status
  if (payload.logs) state.logs = payload.logs
  if (payload.launch) state.launch = payload.launch
  state.dirty = false
}

function localNumberValue(input) {
  if (input.value === '') return ''
  const next = Number(input.value)
  return Number.isFinite(next) ? next : input.value
}

function applyStreamDelta(payload) {
  if (!payload || payload.requestId !== state.streamRequestId) return
  const last = state.chatMessages[state.chatMessages.length - 1]
  if (!last || last.role !== 'assistant') return
  const lastIndex = state.chatMessages.length - 1
  if (payload.delta) {
    last.content = `${last.content || ''}${payload.delta}`
    updateMessageDom(lastIndex)
  }
  if (payload.done) {
    last.content = payload.content || last.content || '模型返回了空内容。'
    updateLiveStats(last)
    last.streaming = false
    state.streamRequestId = ''
    saveCurrentSession()
    updateMessageDom(lastIndex)
  }
}

async function save() {
  state.busy = true
  render()
  try {
    patchFromBackend(await window.llamaDesktop.saveConfig({ config: state.config }))
    setToast('配置已保存')
  } catch (error) {
    setToast(error.message || String(error))
  } finally {
    state.busy = false
    render()
  }
}

async function start() {
  state.busy = true
  render()
  try {
    patchFromBackend(await window.llamaDesktop.startServer({ config: state.config }))
    state.active = 'chat'
    setToast('服务正在启动。关闭窗口后会继续在托盘运行。')
  } catch (error) {
    setToast(error.message || String(error))
  } finally {
    state.busy = false
    render()
  }
}

async function stop() {
  state.busy = true
  render()
  try {
    patchFromBackend(await window.llamaDesktop.stopServer())
    setToast('服务已停止')
  } catch (error) {
    setToast(error.message || String(error))
  } finally {
    state.busy = false
    render()
  }
}

async function health() {
  const result = await window.llamaDesktop.testHealth({ config: state.config })
  setToast(result.ok ? `端口正常：${result.url}` : `端口未响应：${result.message || result.url}`)
}

async function openModelInfo() {
  state.modelInfoOpen = true
  state.modelInfo = { loading: true }
  render({ preserveChatScroll: true })
  try {
    state.modelInfo = await window.llamaDesktop.getModelInfo({ config: state.config })
  } catch (error) {
    state.modelInfo = { error: error?.message || String(error) }
  }
  render({ preserveChatScroll: true })
}

async function sendChat() {
  const content = state.chatInput.trim()
  if ((!content && state.attachments.length === 0) || state.chatBusy) return

  if (!state.currentSessionId) state.currentSessionId = makeSessionId()
  const attachments = state.attachments
  state.chatMessages.push({ role: 'user', content, attachments, createdAt: Date.now() })
  const requestId = `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`
  state.chatMessages.push({
    role: 'assistant',
    content: '',
    createdAt: Date.now(),
    startedAt: Date.now(),
    model: modelName(),
    tokens: 0,
    estimatedTokens: 0,
    latencyMs: 0,
    speed: '',
    streaming: true,
  })
  state.streamRequestId = requestId
  state.chatInput = ''
  state.attachments = []
  state.attachmentMenuOpen = false
  state.chatBusy = true
  state.view = 'chat'
  saveCurrentSession()
  render()

  try {
    const startedAt = performance.now()
    const result = await window.llamaDesktop.streamChat({
      requestId,
      config: state.config,
      messages: buildApiMessages(state.chatMessages.slice(0, -1)),
    })
    const latencyMs = Math.round(performance.now() - startedAt)
    const tokens = result.raw?.usage?.total_tokens || result.raw?.usage?.completion_tokens || ''
    const speed = tokens && latencyMs ? `${(Number(tokens) / (latencyMs / 1000)).toFixed(2)} t/s` : ''
    const assistant = state.chatMessages[state.chatMessages.length - 1]
    if (assistant?.role === 'assistant') {
      const estimatedTokens = estimateTokens(assistant.content || result.content)
      assistant.content = result.content || assistant.content || '模型返回了空内容。'
      assistant.tokens = tokens || estimatedTokens
      assistant.estimatedTokens = estimatedTokens
      assistant.latencyMs = latencyMs
      assistant.speed = speed || (assistant.tokens ? `${(Number(assistant.tokens) / (latencyMs / 1000)).toFixed(2)} t/s` : '')
      assistant.streaming = false
    }
    saveCurrentSession()
  } catch (error) {
    const assistant = state.chatMessages[state.chatMessages.length - 1]
    if (assistant?.role === 'assistant' && !assistant.content) {
      state.chatMessages.pop()
    }
    state.chatMessages.push({ role: 'system', content: friendlyErrorMessage(error), createdAt: Date.now(), localOnly: true })
    saveCurrentSession()
  } finally {
    state.chatBusy = false
    state.streamRequestId = ''
    render({ preserveChatScroll: true })
  }
}

async function retryMessage(index) {
  if (state.chatBusy) return
  const previousUserIndex = state.chatMessages
    .slice(0, index)
    .map((message, itemIndex) => ({ message, itemIndex }))
    .reverse()
    .find(item => item.message.role === 'user')?.itemIndex

  if (previousUserIndex === undefined) {
    setToast('没有找到可以重试的用户消息')
    return
  }

  const userMessage = state.chatMessages[previousUserIndex]
  state.chatMessages = state.chatMessages.slice(0, index)
  const requestId = `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`
  state.chatMessages.push({
    role: 'assistant',
    content: '',
    createdAt: Date.now(),
    startedAt: Date.now(),
    model: modelName(),
    tokens: 0,
    estimatedTokens: 0,
    latencyMs: 0,
    speed: '',
    streaming: true,
  })
  state.streamRequestId = requestId
  state.chatBusy = true
  render()

  try {
    const startedAt = performance.now()
    const result = await window.llamaDesktop.streamChat({
      requestId,
      config: state.config,
      messages: buildApiMessages(state.chatMessages.slice(0, -1)),
    })
    const latencyMs = Math.round(performance.now() - startedAt)
    const tokens = result.raw?.usage?.total_tokens || result.raw?.usage?.completion_tokens || ''
    const speed = tokens && latencyMs ? `${(Number(tokens) / (latencyMs / 1000)).toFixed(2)} t/s` : ''
    const assistant = state.chatMessages[state.chatMessages.length - 1]
    if (assistant?.role === 'assistant') {
      const estimatedTokens = estimateTokens(assistant.content || result.content)
      assistant.content = result.content || assistant.content || `基于“${userMessage.content}”重试后，模型返回了空内容。`
      assistant.tokens = tokens || estimatedTokens
      assistant.estimatedTokens = estimatedTokens
      assistant.latencyMs = latencyMs
      assistant.speed = speed || (assistant.tokens ? `${(Number(assistant.tokens) / (latencyMs / 1000)).toFixed(2)} t/s` : '')
      assistant.streaming = false
    }
    saveCurrentSession()
  } catch (error) {
    const assistant = state.chatMessages[state.chatMessages.length - 1]
    if (assistant?.role === 'assistant' && !assistant.content) {
      state.chatMessages.pop()
    }
    state.chatMessages.push({ role: 'system', content: friendlyErrorMessage(error).replace(/^发送失败/, '重试失败'), createdAt: Date.now(), localOnly: true })
    saveCurrentSession()
  } finally {
    state.chatBusy = false
    state.streamRequestId = ''
    render({ preserveChatScroll: true })
  }
}

async function pick(fieldName, kind) {
  const filters = {
    exe: [
      { name: 'Executable', extensions: ['exe', 'cmd', 'bat'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    gguf: [
      { name: 'GGUF', extensions: ['gguf'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    toml: [
      { name: 'TOML', extensions: ['toml'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  }[kind] || [{ name: 'All Files', extensions: ['*'] }]

  const selected = await window.llamaDesktop.pickFile(kind === 'dir' ? { properties: ['openDirectory'] } : filters)
  if (selected) {
    state.config[fieldName] = selected
    if (fieldName === 'llama_bin_dir') {
      state.config.llama_server_path = `${selected.replace(/[\\/]+$/, '')}\\llama-server.exe`
    }
    state.dirty = true
    render()
  }
}

async function pickAttachment(kind) {
  try {
    const picked = await window.llamaDesktop.pickAttachments({ kind })
    if (picked?.length) {
      state.attachments = [...state.attachments, ...picked]
      state.attachmentMenuOpen = false
      state.attachmentMenuPosition = null
      const hasImage = picked.some(item => item.kind === 'image')
      const hasLargeImage = picked.some(item => item.kind === 'image' && !item.dataUrl)
      if (hasLargeImage) {
        setToast('图片已添加，但文件较大，只会作为附件记录路径。')
      } else if (hasImage && !state.config?.mmproj) {
        setToast('图片已添加；未配置 mmproj 时，普通文本模型可能看不懂图片。')
      } else {
        setToast(`${attachmentLabel(kind)}已添加`)
      }
    } else {
      state.attachmentMenuOpen = false
      state.attachmentMenuPosition = null
      render()
    }
  } catch (error) {
    setToast(error.message || String(error))
  }
}

appEl.addEventListener('click', event => {
  const target = event.target.closest('button, .settings-backdrop, .preview-backdrop, .dialog-backdrop, .attach-menu-backdrop')
  if (!target) return

  const seed = target.dataset.seed
  if (seed) {
    state.chatInput = seed
    state.active = 'chat'
    state.view = 'chat'
    render()
    return
  }

  const sessionId = target.dataset.session
  if (sessionId) {
    openSession(sessionId)
    render({ jumpToBottom: true })
    return
  }

  const section = target.dataset.section
  if (section) {
    state.active = section
    state.settingsOpen = true
    render()
    return
  }

  const pickField = target.dataset.pick
  if (pickField) {
    void pick(pickField, target.dataset.kind)
    return
  }

  const action = target.dataset.action
  if (action === 'toggle-history-menu') {
    state.historyMenuId = state.historyMenuId === target.dataset.sessionId ? '' : target.dataset.sessionId
    render({ preserveChatScroll: true })
  }
  if (action === 'open-model-info') {
    void openModelInfo()
    return
  }
  if (action === 'close-model-info') {
    state.modelInfoOpen = false
    render({ preserveChatScroll: true })
    return
  }
  if (action === 'copy-model-info') {
    void navigator.clipboard.writeText(String(target.dataset.copy || ''))
    setToast('已复制到剪贴板')
    return
  }
  if (action === 'copy-launch-command') {
    const command = state.launch?.preview || ''
    if (command && !state.launch?.error) {
      void navigator.clipboard.writeText(command)
      setToast('启动命令已复制')
    }
    return
  }
  if (action === 'history-edit') {
    const session = state.sessions.find(item => item.id === target.dataset.sessionId)
    if (session) {
      state.historyDialog = { type: 'edit', sessionId: session.id }
      state.historyMenuId = ''
      render({ preserveChatScroll: true })
      setTimeout(() => document.querySelector('[data-history-title-input]')?.focus(), 0)
    }
  }
  if (action === 'history-export') {
    const session = state.sessions.find(item => item.id === target.dataset.sessionId)
    if (session) {
      void navigator.clipboard.writeText(JSON.stringify(session, null, 2))
      state.historyMenuId = ''
      setToast('Conversation exported to clipboard')
    }
  }
  if (action === 'history-delete') {
    state.historyDialog = { type: 'delete', sessionId: target.dataset.sessionId }
    state.historyMenuId = ''
    render({ preserveChatScroll: true })
  }
  if (action === 'close-history-dialog') {
    state.historyDialog = null
    render({ preserveChatScroll: true })
  }
  if (action === 'history-save-title') {
    const session = state.sessions.find(item => item.id === target.dataset.sessionId)
    const input = document.querySelector('[data-history-title-input]')
    const nextTitle = String(input?.value || '').trim()
    if (session && nextTitle) {
      session.title = nextTitle.slice(0, 80)
      session.updatedAt = Date.now()
      state.historyDialog = null
      persistSessions()
      render({ preserveChatScroll: true, resetHistoryScroll: true })
    }
  }
  if (action === 'history-confirm-delete') {
    const sessionId = target.dataset.sessionId
    state.sessions = state.sessions.filter(item => item.id !== sessionId)
    if (state.currentSessionId === sessionId) {
      state.currentSessionId = makeSessionId()
      state.chatMessages = []
      state.chatInput = ''
      state.attachments = []
    }
    state.historyDialog = null
    persistSessions()
    render({ jumpToBottom: true, resetHistoryScroll: true })
  }
  if (action === 'toggle-settings') {
    state.settingsOpen = !state.settingsOpen
    if (state.settingsOpen && !settingsTabs.some(([id]) => id === state.active)) {
      state.active = 'overview'
    }
    state.attachmentMenuOpen = false
    state.attachmentMenuPosition = null
    render()
  }
  if (action === 'toggle-attachment-menu') {
    if (state.attachmentMenuOpen) {
      state.attachmentMenuOpen = false
      state.attachmentMenuPosition = null
    } else {
      openAttachmentMenu(target)
    }
    render()
    return
  }
  if (action === 'close-attachment-menu') {
    state.attachmentMenuOpen = false
    state.attachmentMenuPosition = null
    render()
    return
  }
  if (action === 'copy-code') {
    const block = getCodeBlock(target.dataset.messageIndex, target.dataset.codeIndex)
    if (block) {
      void navigator.clipboard.writeText(block.value || '')
      setToast('代码已复制到剪贴板')
    }
  }
  if (action === 'preview-code') {
    const block = getCodeBlock(target.dataset.messageIndex, target.dataset.codeIndex)
    if (block) {
      state.preview = {
        type: 'code',
        code: block.value || '',
        language: block.language || 'html',
        title: `${String(block.language || 'HTML').toUpperCase()} 预览`,
      }
      render({ preserveChatScroll: true })
    }
  }
  if (action === 'preview-image') {
    state.preview = {
      type: 'image',
      src: target.dataset.src || '',
      title: target.dataset.title || '图片预览',
    }
    render({ preserveChatScroll: true })
  }
  if (action === 'close-preview') {
    state.preview = null
    render({ preserveChatScroll: true })
  }
  if (action === 'pick-file') void pickAttachment('file')
  if (action === 'pick-image') void pickAttachment('image')
  if (action === 'pick-audio') void pickAttachment('audio')
  if (action === 'pick-text') void pickAttachment('text')
  if (action === 'pick-pdf') void pickAttachment('pdf')
  if (action === 'insert-system-message') {
    if (!state.currentSessionId) state.currentSessionId = makeSessionId()
    state.chatMessages.push({
      role: 'system',
      content: '系统消息：请在这里写给模型的长期要求，发送下一条消息时会一起带上。',
      createdAt: Date.now(),
    })
    state.attachmentMenuOpen = false
    state.attachmentMenuPosition = null
    saveCurrentSession()
    render()
  }
  if (action === 'remove-attachment') {
    state.attachments.splice(Number(target.dataset.index), 1)
    render()
  }
  if (action === 'copy-message') {
    const message = state.chatMessages[Number(target.dataset.index)]
    if (message) {
      void navigator.clipboard.writeText(message.content || '')
      setToast('已复制到剪贴板')
    }
  }
  if (action === 'edit-message') {
    const index = Number(target.dataset.index)
    const message = state.chatMessages[index]
    if (message) {
      state.chatInput = message.content || ''
      state.attachments = message.attachments || []
      state.chatMessages.splice(index, 1)
      saveCurrentSession()
      render()
      setTimeout(() => document.querySelector('[data-chat-input]')?.focus(), 0)
    }
  }
  if (action === 'delete-message') {
    state.chatMessages.splice(Number(target.dataset.index), 1)
    saveCurrentSession()
    render()
  }
  if (action === 'retry-message') void retryMessage(Number(target.dataset.index))
  if (action === 'close-settings') {
    state.settingsOpen = false
    render()
  }
  if (action === 'toggle-sidebar') {
    state.sidebarCollapsed = !state.sidebarCollapsed
    render()
  }
  if (action === 'focus-chat') {
    state.active = 'chat'
    state.view = 'chat'
    state.sidebarPanel = 'chats'
    render({ resetHistoryScroll: true })
    setTimeout(() => {
      const search = document.querySelector('[data-history-search]')
      search?.focus()
      search?.select?.()
    }, 0)
  }
  if (action === 'return-chat') {
    state.active = 'chat'
    state.view = 'chat'
    state.sidebarPanel = 'chats'
    render()
    setTimeout(() => document.querySelector('[data-chat-input]')?.focus(), 0)
  }
  if (action === 'show-terminal') {
    state.view = 'terminal'
    state.sidebarPanel = 'chats'
    state.attachmentMenuOpen = false
    render()
  }
  if (action === 'open-log-settings') {
    state.active = 'logs'
    state.settingsOpen = true
    state.view = 'terminal'
    state.sidebarPanel = 'chats'
    render()
  }
  if (action === 'new-chat') {
    startFreshSession()
    render()
  }
  if (action === 'save') void save()
  if (action === 'start') void start()
  if (action === 'stop') void stop()
  if (action === 'health') void health()
  if (action === 'send-chat') void sendChat()
})

appEl.addEventListener('input', event => {
  const input = event.target
  if (input.dataset?.chatInput !== undefined) {
    state.chatInput = input.value
    return
  }

  if (input.dataset?.historySearch !== undefined) {
    state.historySearch = input.value
    state.historyMenuId = ''
    render({ resetHistoryScroll: true })
    return
  }

  const name = input.dataset?.field
  if (!name) return

  if (input.type === 'checkbox') {
    state.config[name] = input.checked
  } else if (input.type === 'number') {
    state.config[name] = localNumberValue(input)
  } else {
    state.config[name] = input.value
  }
  if (name === 'llama_bin_dir') {
    state.config.llama_server_path = `${String(input.value || '').replace(/[\\/]+$/, '')}\\llama-server.exe`
  }
  state.dirty = true
})

appEl.addEventListener('keydown', event => {
  if (event.key === 'Escape' && state.historyDialog) {
    state.historyDialog = null
    render({ preserveChatScroll: true })
    return
  }
  if (event.key === 'Escape' && state.modelInfoOpen) {
    state.modelInfoOpen = false
    render({ preserveChatScroll: true })
    return
  }
  if (event.target?.dataset?.historyTitleInput !== undefined && event.key === 'Enter') {
    event.preventDefault()
    document.querySelector('[data-action="history-save-title"]')?.click()
    return
  }
  if (event.target?.dataset?.chatInput !== undefined && event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    void sendChat()
  }
})

async function init() {
  try {
    loadSessions()
    if (!state.currentSessionId) state.currentSessionId = makeSessionId()
    patchFromBackend(await window.llamaDesktop.getState())
    render()
  } catch (error) {
    appEl.innerHTML = `<div class="boot">${escapeHtml(error.message || String(error))}</div>`
  }

  window.llamaDesktop.onEvent(payload => {
    if (payload.type === 'status') {
      state.status = payload.status
      render({ preserveChatScroll: true })
      return
    }
    if (payload.type === 'logs') {
      state.logs = payload.logs
      if (state.view === 'terminal') render({ preserveChatScroll: true })
      return
    }
    if (payload.type === 'chat-stream') {
      applyStreamDelta(payload)
      return
    }
    render()
  })
}

void init()

