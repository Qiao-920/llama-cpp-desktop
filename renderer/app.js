import { runtimeWarnings } from '../desktop/lib/runtime-policy.mjs'

import { selectVisibleTerminalLogs } from '../desktop/lib/log-pipeline.mjs'

import {
  attachmentMenuPosition,
  attachmentNotice,
  renderAttachmentMenu,
  renderAttachmentNotice,
} from './lib/attachment-policy.js'
import {
  diagnosticBundleText,
  modelCapability,
  readinessChecklist,
  terminalDiagnosis,
} from './lib/product-insights.js'
import {
  clientSmokePlan,
  downloadGuidance,
  environmentIntegrity,
  firstRunSteps,
  hardwareRecommendation,
  integrationGuide,
  modelCapabilityCatalog,
  modelRecommendation,
  multimodalAdvice,
  performanceHints,
  portDiagnosis,
  portRepairPlan,
  releaseCandidateChecklist,
  shouldShowFirstRunWizard,
  startupDiagnosis,
  supportBundleText,
} from './lib/feedback-repair.js'

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
  ['rescue', '&#9874;', '启动救援', '新手启动、接入和卡顿排查'],
  ['display', '&#128421;', '展示', '模型标签、模板与显示项'],
  ['sampling', '&#9661;', '采样', '温度、Top-K 与 Top-P'],
  ['penalty', '&#9651;', '惩罚', '重复、存在与最小采样'],
  ['io', '&#128452;', '进出口', '模型、服务端与路径'],
  ['mcp', '&#128206;', 'MCP', '预留给扩展和工具接入'],
  ['developer', '&lt;/&gt;', '开发者', '线程、GPU 与批处理'],
  ['appearance', '&#9681;', '外观', '主题、字体和阅读观感'],
  ['logs', '&#128196;', '日志', '当前 llama.cpp 服务输出'],
]

const appEl = document.getElementById('app')
const STREAM_RENDER_INTERVAL_MS = 100
let pendingStreamRenderIndex = null
let streamRenderTimer = null

const state = {
  active: 'chat',
  config: null,
  validation: {},
  launch: {},
  status: { state: 'stopped', message: '服务未启动', url: 'http://127.0.0.1:8080' },
  logs: { entries: [], filtered: 0, truncated: 0, dropped: 0 },
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
  draggingFiles: false,
  dragDepth: 0,
  openThinkingMessages: new Set(),
  closedThinkingMessages: new Set(),
  attachmentMenuOpen: false,
  attachmentMenuPosition: null,
  streamRequestId: '',
  preview: null,
  previewError: '',
  modelInfo: null,
  modelInfoOpen: false,
  chatBusy: false,
  dirty: false,
  busy: false,
  settingsOpen: false,
  firstRunWizardOpen: false,
  firstRunWizardSeen: false,
  health: null,
  runCheckExpanded: false,
  portInspection: null,
  systemInfo: null,
  clientSmoke: null,
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

function effectiveThemeMode() {
  const mode = state.config?.theme_mode || 'system'
  if (mode === 'light' || mode === 'dark') return mode
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyAppearancePreferences() {
  const theme = effectiveThemeMode()
  const font = state.config?.chat_font || 'default'
  document.body.classList.toggle('theme-dark', theme === 'dark')
  document.body.classList.toggle('theme-light', theme !== 'dark')
  document.body.classList.toggle('font-sans', font === 'sans')
  document.body.classList.toggle('font-system', font === 'system')
  document.body.classList.toggle('font-readable', font === 'readable')
  document.body.dataset.themeMode = state.config?.theme_mode || 'system'
  document.body.dataset.chatFont = font
}

function openSettingsSection(section = 'overview') {
  state.active = settingsTabs.some(([id]) => id === section) ? section : 'overview'
  state.settingsOpen = true
  state.firstRunWizardOpen = false
  state.attachmentMenuOpen = false
  state.attachmentMenuPosition = null
}

function thinkingMessageKey(message, messageIndex) {
  return `${message?.createdAt || 'message'}:${messageIndex}`
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
    rescue: `
      <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false">
        <path d="M9 2.7 14 4.6v3.9c0 3.2-1.9 5.6-5 6.8-3.1-1.2-5-3.6-5-6.8V4.6L9 2.7Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"></path>
        <path d="M6.4 9.1h5.2M9 6.5v5.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path>
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
    appearance: `
      <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false">
        <path d="M9 2.6a6.4 6.4 0 1 0 0 12.8 5.1 5.1 0 0 1 0-12.8Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"></path>
        <path d="M9 2.6v12.8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"></path>
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
  return parts.flatMap(part => part.type === 'text' ? splitLooseHtmlParts(part.value) : [part])
}

function splitLooseHtmlParts(text) {
  const value = String(text || '')
  const looseHtmlPattern = /(?:<!doctype\s+html[^]*?<\/html>|<html[\s\S]*?<\/html>)/i
  const match = looseHtmlPattern.exec(value)
  if (!match) return value ? [{ type: 'text', value }] : []

  const parts = []
  if (match.index > 0) parts.push({ type: 'text', value: value.slice(0, match.index) })
  parts.push({ type: 'code', language: 'html', value: match[0] })
  const end = match.index + match[0].length
  if (end < value.length) parts.push({ type: 'text', value: value.slice(end) })
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

function validateCodePreview(language, code) {
  if (!canPreviewCode(language, code)) return ''
  const value = String(code || '').trim()
  const lang = String(language || '').toLowerCase()
  const looksLikeHtml = ['html', 'htm'].includes(lang) || /<!doctype|<html|<body|<canvas|<script|<style/i.test(value)
  if (!looksLikeHtml) return ''

  if (/<html[\s>]/i.test(value) && !/<\/html>/i.test(value)) {
    return '预览代码不完整：缺少 </html> 结束标签。请让模型继续补全后再预览。'
  }
  if (/<script[\s>]/i.test(value) && !/<\/script>/i.test(value)) {
    return '预览代码不完整：缺少 </script> 结束标签。请让模型继续补全后再预览。'
  }
  if (/<canvas[\s>]/i.test(value) && !/requestAnimationFrame|setInterval|setTimeout/i.test(value)) {
    return '预览代码不完整：Canvas 粒子页缺少 requestAnimationFrame 动画循环。请让模型继续生成完整脚本。'
  }
  return ''
}

function estimateTokens(text) {
  const value = String(text || '').trim()
  if (!value) return 0
  const cjk = (value.match(/[\u4e00-\u9fff]/g) || []).length
  const latin = value.replace(/[\u4e00-\u9fff]/g, '').trim()
  const latinTokens = latin ? latin.split(/\s+/).filter(Boolean).length : 0
  return Math.max(1, Math.round(cjk * 0.9 + latinTokens * 1.25))
}

function chatQualityDefaults(mode = 'quality') {
  if (mode === 'fast') {
    return {
      chat_quality_mode: 'fast',
      chat_template_kwargs: '{"enable_thinking": false}',
      temp: 0.8,
      top_k: 20,
      top_p: 0.95,
      min_p: 0.05,
      presence_penalty: 0,
      repeat_penalty: '',
      expand_thinking: false,
    }
  }
  return {
    chat_quality_mode: 'quality',
    chat_template_kwargs: '',
    temp: 1,
    top_k: 20,
    top_p: 0.95,
    min_p: 0.05,
    presence_penalty: 0,
    repeat_penalty: '',
    expand_thinking: false,
  }
}

function applyChatQualityMode(mode) {
  const defaults = chatQualityDefaults(mode)
  Object.assign(state.config, defaults)
}

function responseStats(raw, content, latencyMs) {
  const usage = raw?.usage || {}
  const timings = raw?.timings || {}
  const completionTokens = usage.completion_tokens || timings.predicted_n || estimateTokens(content)
  const totalTokens = usage.total_tokens || completionTokens
  const nativeTps = Number(timings.predicted_per_second)
  const speedSource = Number.isFinite(nativeTps) && nativeTps > 0 ? 'native' : ''
  return {
    tokens: completionTokens || totalTokens || estimateTokens(content),
    speed: speedSource ? `${nativeTps.toFixed(2)} t/s` : '',
    speedSource,
  }
}

function generatedTextForStats(message) {
  return [message?.content, message?.thinking].filter(Boolean).join('\n\n')
}

function updateLiveStats(message) {
  if (!message || message.role !== 'assistant') return
  const startedAt = message.startedAt || message.createdAt || Date.now()
  const latencyMs = Math.max(1, Date.now() - startedAt)
  const generatedText = generatedTextForStats(message)
  const tokens = message.tokens || estimateTokens(generatedText)
  message.latencyMs = latencyMs
  message.estimatedTokens = estimateTokens(generatedText)
  message.liveSpeed = tokens ? `${(Number(tokens) / (latencyMs / 1000)).toFixed(2)} t/s` : ''
  message.liveSpeedSource = 'estimate'
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
              ${previewable ? `<button type="button" data-action="preview-code" data-message-index="${messageIndex}" data-code-index="${codeIndex}" title="在客户端里预览网页">预览网页</button>` : ''}
              ${previewable ? `<button type="button" data-action="download-code" data-message-index="${messageIndex}" data-code-index="${codeIndex}" title="保存为 HTML 文件">保存 HTML</button>` : ''}
            </div>
          </figcaption>
          <pre><code>${escapeHtml(codeValue)}</code></pre>
        </figure>
      `
    })
    .join('')
}

const THINKING_END_MARKERS = [
  /\(\s*End of thought process\s*\)/i,
  /(?:^|\n)\s*End of thought process\s*[:：]?/i,
  /(?:^|\n)\s*(?:Okay,\s*I'll write:|I(?:'|’)ll output exactly that\.?|最终答案\s*[:：]|回答\s*[:：])/i,
]

function looksLikeReasoningText(text) {
  return /(?:Analyze the User|Determine the Intent|Formulate the Response|Drafting the response|Selecting the Best Response|Final Polish|思考|推理|分析用户|判断意图)/i.test(String(text || ''))
}

function thinkingEndBoundary(text) {
  for (const pattern of THINKING_END_MARKERS) {
    const match = pattern.exec(text)
    if (match) return { index: match.index, endIndex: match.index + match[0].length }
  }
  return null
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

  const naturalBoundary = thinkingEndBoundary(text)
  if (naturalBoundary && looksLikeReasoningText(text.slice(0, naturalBoundary.index))) {
    return {
      answer: cleanMarkers(text.slice(naturalBoundary.endIndex)),
      thoughts: [cleanMarkers(text.slice(0, naturalBoundary.index))].filter(Boolean),
    }
  }

  return { answer: text, thoughts: [] }
}

function renderMessageContent(message, messageIndex) {
  const content = String(message.content || '')
  if (!content && !message.thinking && message.role === 'assistant' && state.chatBusy) {
    return '<div class="typing-line">正在生成...</div>'
  }
  if (message.role !== 'assistant') {
    return content ? renderTextBlock(content) : ''
  }

  const counter = { value: 0 }
  const output = []
  const split = splitThinkingOutput(content)
  const answer = split.answer
  const thoughts = [String(message.thinking || '').trim(), ...split.thoughts].filter(Boolean)
  const showRawOutput = Boolean(state.config?.show_raw_output)
  const showThinking = state.config?.show_thinking !== false && !showRawOutput
  const expandThinking = Boolean(state.config?.expand_thinking)
  const thinkingKey = thinkingMessageKey(message, messageIndex)
  const thinkingOpen = state.openThinkingMessages.has(thinkingKey) ||
    (expandThinking && !state.closedThinkingMessages.has(thinkingKey))

  if (showThinking && thoughts.length > 0) {
    output.push(`
      <details class="think-block" data-thinking-key="${escapeAttribute(thinkingKey)}" ${thinkingOpen ? 'open' : ''}>
        <summary data-action="toggle-thinking" data-thinking-key="${escapeAttribute(thinkingKey)}" data-message-index="${messageIndex}">思考过程</summary>
        ${renderCodeAwareText(thoughts.join('\n\n'), messageIndex, counter)}
      </details>
    `)
  } else if (!showRawOutput && thoughts.length > 0 && state.config?.show_thinking === false) {
    output.push('<div class="markdown-text muted-note">思考过程已隐藏。</div>')
  }

  if (answer) {
    output.push(renderCodeAwareText(answer, messageIndex, counter))
  }

  if (showRawOutput && (content || message.thinking) && !message.streaming) {
    const rawOutput = [message.thinking ? `Thinking:\n${message.thinking}` : '', content].filter(Boolean).join('\n\n')
    output.push(`
      <details class="raw-output-block">
        <summary>原始输出</summary>
        <pre>${escapeHtml(rawOutput)}</pre>
      </details>
    `)
  } else if (showRawOutput && (content || message.thinking) && message.streaming) {
    output.push('<div class="markdown-text muted-note">原始输出将在生成结束后显示。</div>')
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
      if (systemText === '系统消息：请在这里写给模型的长期要求，发送下一条消息时会一起带上。') continue
      systemMessages.push(systemText)
      continue
    }

    const next = message.role === 'assistant'
      ? sanitizeAssistantForContext(message)
      : sanitizeUserForContext(message)
    if (next) conversation.push(next)
  }

  return systemMessages.length
    ? [{ role: 'system', content: systemMessages.filter(Boolean).join('\n\n') }, ...conversation]
    : conversation
}

function sanitizeAssistantForContext(message) {
  const content = String(message?.content || '').trim()
  if (!content) return null
  if (/^(发送失败|重试失败|请求失败|启动失败|模型返回了空内容)[：:。]/.test(content)) return null
  const next = { role: 'assistant', content }
  delete next.thinking
  return next
}

function sanitizeUserForContext(message) {
  const content = String(message?.content || '').trim()
  const attachments = Array.isArray(message?.attachments) ? message.attachments : []
  if (!content && attachments.length === 0) return null
  const next = { role: 'user', content }
  if (attachments.length) next.attachments = attachments
  return next
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
  }[kind] || '文件'
}

function flushStreamRender() {
  if (streamRenderTimer) {
    window.clearTimeout(streamRenderTimer)
    streamRenderTimer = null
  }
  const index = pendingStreamRenderIndex
  pendingStreamRenderIndex = null
  if (index !== null && index !== undefined) {
    updateMessageDom(index)
  }
}

function scheduleStreamRender(index) {
  pendingStreamRenderIndex = index
  if (streamRenderTimer) return
  streamRenderTimer = window.setTimeout(flushStreamRender, STREAM_RENDER_INTERVAL_MS)
}

function readinessSummary() {
  const rows = readinessChecklist({
    config: state.config || {},
    validation: state.validation,
    status: state.status,
    dirty: state.dirty,
  })
  const repair = startupDiagnosis({
    config: state.config || {},
    validation: state.validation,
    status: state.status,
    dirty: state.dirty,
  })
  const counts = rows.reduce(
    (summary, row) => {
      if (row.state === 'ready') summary.pass += 1
      else if (row.state === 'blocked') summary.block += 1
      else summary.warn += 1
      return summary
    },
    { pass: 0, warn: 0, block: 0 },
  )
  const next = rows.find(row => row.state === 'blocked')
    || rows.find(row => row.state === 'warning')
    || rows.find(row => row.state === 'pending')
    || rows[0]

  return {
    rows,
    counts,
    nextAction: repair.level === 'good' && next?.state === 'ready' && counts.warn === 0 && counts.block === 0 ? '可以开始对话' : repair.action || next?.action || '检查本地运行状态',
  }
}

function renderReadinessStrip() {
  const { rows, counts, nextAction } = readinessSummary()
  return `
    <div class="run-check-shell">
      <button type="button" class="run-check-strip" data-action="toggle-run-check" aria-label="运行检查" aria-expanded="${state.runCheckExpanded ? 'true' : 'false'}">
        <span class="run-check-title">运行检查</span>
        <span class="run-check-count pass">通过 ${counts.pass}</span>
        <span class="run-check-count warn">提醒 ${counts.warn}</span>
        <span class="run-check-count block">阻塞 ${counts.block}</span>
        <span class="run-check-next">${escapeHtml(nextAction)}</span>
      </button>
      ${state.runCheckExpanded ? `
        <div class="run-check-details">
          ${rows.map(row => `
            <div class="run-check-detail ${escapeHtml(row.state)}">
              ${repairBadge(row.state)}
              <strong>${escapeHtml(row.label)}</strong>
              <span>${escapeHtml(row.action)}</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `
}

function supportValue(kind, capability) {
  if (kind === 'image') {
    if (capability.mode === 'vision-configured') return '已配置 mmproj，需实测模型支持'
    if (capability.mode === 'vision-needs-mmproj') return '需要 mmproj'
    return '未确认支持'
  }
  if (kind === 'pdf') return '未接入原生 PDF'
  return '未接入音频输入'
}

function buildCapabilityRows(info, capability) {
  const config = state.config || {}
  const filePath = info?.filePath || config.model || ''
  const fileName = info?.name || basename(filePath) || '未选择模型'
  const endpoint = info?.serverUrl || state.status?.url || ''
  const contextSize = config.ctx_size || info?.ctxSize || info?.trainingContext || ''

  return [
    { label: '模型文件', value: fileName },
    { label: '量化等级', value: info?.quantization || quantLabelFromName(fileName) || '未识别' },
    { label: '上下文', value: contextSize ? `${contextSize} tokens` : '未设置' },
    { label: '端点', value: endpoint ? `${String(endpoint).replace(/\/+$/, '')}/v1` : '未启动' },
    { label: '多模态', value: capability.label },
    { label: '图片', value: supportValue('image', capability) },
    { label: 'PDF', value: supportValue('pdf', capability) },
    { label: '音频', value: supportValue('audio', capability) },
  ]
}

function renderAttachmentItem(item, index, removable, mode = 'composer') {
  const kind = String(item?.kind || 'file')
  const name = String(item?.name || 'attachment')
  const notice = attachmentNotice(item)
  const meta = formatBytes(item.size || 0)
  const title = [name, item.path || '', meta, notice].filter(Boolean).join('\n')
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
          ${renderAttachmentNotice(item, escapeHtml)}
        </figcaption>
        ${removeButton}
      </figure>
    `
  }

  return `
    <span class="attachment-chip ${escapeHtml(kind)} ${mode === 'message-user' ? 'message-file' : ''}" title="${escapeAttribute(title)}">
      <strong>${attachmentLabel(kind)}</strong>
      <span class="attachment-details">
        <span class="attachment-name">${escapeHtml(name)}</span>
        ${renderAttachmentNotice(item, escapeHtml)}
      </span>
      <span class="attachment-size">${escapeHtml(formatBytes(item.size || 0))}</span>
      ${removeButton}
    </span>
  `
}

function renderMessageActions(index, message) {
  const canRetry = message.role === 'assistant'
  return `
    <div class="message-actions">
      <button type="button" data-action="copy-message" data-index="${index}" title="复制消息">⧉</button>
      <button type="button" data-action="edit-message" data-index="${index}" title="编辑消息">✎</button>
      ${canRetry ? `<button type="button" data-action="retry-message" data-index="${index}" title="重新生成回复">↻</button>` : ''}
      <button type="button" data-action="delete-message" data-index="${index}" title="删除消息">⌫</button>
    </div>
  `
}

function renderMessageMeta(message) {
  if (message.role !== 'assistant') return ''
  const tokens = message.tokens || message.estimatedTokens || estimateTokens(generatedTextForStats(message))
  const latencyMs = message.latencyMs || (message.streaming ? Date.now() - (message.startedAt || message.createdAt || Date.now()) : 0)
  const nativeSpeed = message.speedSource === 'native' && message.speed ? message.speed : ''
  const estimatedSpeed = !nativeSpeed && message.liveSpeed ? message.liveSpeed : ''
  const pieces = [
    `<span class="model-pill">◇ ${escapeHtml(message.model || modelName())}</span>`,
    `<span>▦ 输出 ${escapeHtml(tokens || 0)} tokens</span>`,
    latencyMs ? `<span>◷ 总耗时 ${(latencyMs / 1000).toFixed(1)}s</span>` : '<span>◷ 总耗时 0.0s</span>',
    nativeSpeed ? `<span>⌁ 生成速率 ${escapeHtml(nativeSpeed)}</span>` : '',
    estimatedSpeed ? `<span>⌁ 估算速率 ${escapeHtml(estimatedSpeed)}</span>` : '',
    message.streaming ? '<span>生成中</span>' : '',
    message.state === 'cancelling' ? '<span class="message-state cancelling">正在停止</span>' : '',
    message.state === 'cancelled' ? '<span class="message-state cancelled">已停止 · 不会加入上下文</span>' : '',
    message.state === 'failed' ? '<span class="message-state failed">生成失败 · 不会加入上下文</span>' : '',
  ].filter(Boolean)

  return pieces.length ? `<div class="message-meta">${pieces.join('')}</div>` : ''
}

function logEntries() {
  return Array.isArray(state.logs?.entries) ? state.logs.entries : []
}

function visibleLogs(limit = 420) {
  return logEntries().slice(-limit)
}

function visibleTerminalLogs(limit = 520) {
  return selectVisibleTerminalLogs(logEntries(), limit)
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
  const warning = configWarning(options.warningId)
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
      ${warning}
    </label>
  `
}

function configWarning(id) {
  const warning = runtimeWarnings(state.config).find(item => item.id === id)
  return `<div class="settings-callout" data-config-warning="${escapeAttribute(id)}" role="alert" ${warning ? '' : 'hidden'}>${warning ? escapeHtml(warning.message) : ''}</div>`
}

function refreshConfigWarnings() {
  const warnings = runtimeWarnings(state.config)
  for (const element of appEl.querySelectorAll('[data-config-warning]')) {
    const warning = warnings.find(item => item.id === element.dataset.configWarning)
    element.hidden = !warning
    element.textContent = warning?.message || ''
  }
}

function selectField(name, label, choices, hint = '') {
  const value = state.config?.[name] ?? ''
  const directMode = (state.config?.launch_mode || 'direct') !== 'launcher'
  const extra = name === 'launch_mode' && directMode
    ? field('llama_bin_dir', 'llama.cpp 原文件目录', { pick: 'dir', hint: '选择包含 llama-server.exe 和 CUDA / ggml DLL 的原始目录。' })
    : ''
  const choiceLabel = choice => {
    if (name === 'chat_quality_mode') {
      if (choice === 'quality') return '质量模式'
      if (choice === 'fast') return '极速模式'
    }
    if (name === 'theme_mode') {
      if (choice === 'light') return '浅色'
      if (choice === 'dark') return '深色'
      if (choice === 'system') return '跟随系统'
    }
    if (name === 'chat_font') {
      if (choice === 'default') return '默认'
      if (choice === 'sans') return 'Sans'
      if (choice === 'system') return '系统'
      if (choice === 'readable') return '易读'
    }
    return choice || 'auto'
  }
  const options = choices
    .map(choice => `<option value="${escapeHtml(choice)}" ${String(choice) === String(value) ? 'selected' : ''}>${escapeHtml(choiceLabel(choice))}</option>`)
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
        <button type="button" class="app-mark sidebar-brand-toggle" data-action="toggle-sidebar" title="${state.sidebarCollapsed ? '展开侧栏' : '收起侧栏'}" aria-label="${state.sidebarCollapsed ? '展开侧栏' : '收起侧栏'}">ll</button>
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
  const terminalView = visibleTerminalLogs()
  const logs = terminalView.entries
  const logRows = logs.length
    ? logs.map(entry => `<div class="terminal-line">${escapeHtml(entry.line)}</div>`).join('')
    : '<div class="terminal-line terminal-muted">Waiting for llama.cpp server output...</div>'
  const stats = state.logs || {}
  const diagnosis = terminalDiagnosis({ status: state.status, logs: state.logs, terminalView })
  const lastMeaningfulEvent = logs.length
    ? logs[logs.length - 1].line
    : state.status?.message || '暂无终端输出'

  return `
    <section class="terminal-screen">
      <div class="terminal-head">
        <div>
          <span>终端日志</span>
          <strong>llama.cpp server output</strong>
        </div>
        <button type="button" class="outline-btn" data-action="return-chat">回到聊天</button>
      </div>
      <div class="terminal-diagnostic terminal-diagnostic-${escapeAttribute(diagnosis.risk)}">
        <div class="terminal-diagnostic-main">
          <span>诊断摘要</span>
          <strong>${escapeHtml(diagnosis.label)}</strong>
          <em>${escapeHtml(diagnosis.detail)}</em>
        </div>
        <div class="terminal-diagnostic-meta">
          <div>
            <span>最近事件</span>
            <strong>${escapeHtml(lastMeaningfulEvent)}</strong>
          </div>
          <div>
            <span>下一步</span>
            <strong>${escapeHtml(diagnosis.nextAction)}</strong>
          </div>
        </div>
        <button type="button" class="outline-btn small-btn" data-action="copy-terminal-diagnostics">复制诊断</button>
      </div>
      <div class="terminal-summary">
        <span>正常终端视图：只显示 llama.cpp/server/runtime 输出，最多 520 行。</span>
        <strong class="log-stat">已过滤 ${Number(stats.filtered || 0)} 条噪音日志</strong>
        <strong class="log-stat">终端视图已排除 ${terminalView.excluded} 条非运行时日志</strong>
        <strong class="log-stat">已截断 ${Number(stats.truncated || 0)} 条长日志</strong>
        <strong class="log-stat">终端视图已隐藏 ${terminalView.hidden} 条超出 520 行显示上限的日志</strong>
        <strong class="log-stat">主进程已丢弃 ${Number(stats.dropped || 0)} 条超出 1200 行存储容量的日志</strong>
      </div>
      <div class="terminal-detail-label">原始日志明细</div>
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
  const capability = modelCapability({ config: state.config || {}, modelInfo: info })
  const multimodal = multimodalAdvice({ config: state.config || {}, validation: state.validation || {} })
  const capabilityRows = buildCapabilityRows(info, capability)
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
          <div class="model-info-card model-capability-card">
            <div class="model-template-head compact-head">
              <span>模型能力</span>
              <span class="capability-badge ${escapeHtml(capability.risk)}">${escapeHtml(capability.label)}</span>
            </div>
            <div class="model-info-grid">
              ${capabilityRows
                .map(row => `
                  <div class="model-info-row">
                    <span>${escapeHtml(row.label)}</span>
                    <strong title="${escapeAttribute(row.value)}">${escapeHtml(row.value)}</strong>
                    <div></div>
                  </div>
                `)
                .join('')}
            </div>
            <p class="capability-detail">${escapeHtml(capability.detail)}</p>
            <p class="capability-detail">${escapeHtml(`${multimodal.title}：${multimodal.action}`)}</p>
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
  const cancelling = Boolean(assistantForRequest(state.streamRequestId)?.cancelRequested)
  const isEmptyChat = state.chatMessages.length === 0
  const isSetupOnboarding = isEmptyChat && state.status.state !== 'running' && !state.chatBusy
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
        ${renderOnboardingActionPanel(isSetupOnboarding)}
      </div>
    `
  const composer = isSetupOnboarding
    ? ''
    : `
      <div class="composer-wrap">
        ${renderReadinessStrip()}
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
          ${state.chatBusy
            ? `<button class="send-btn stop-chat" type="button" data-action="cancel-chat" title="停止生成" aria-label="停止生成" ${cancelling ? 'disabled' : ''}><span class="stop-icon"></span></button>`
            : '<button class="send-btn" type="button" data-action="send-chat" title="发送" aria-label="发送">↑</button>'}
        </div>
        <div class="composer-hint">按住 Enter 发送，Shift + Enter 换行</div>
      </div>
    `

  return `
    <section class="chat-screen ${isEmptyChat ? 'empty-chat' : ''} ${isSetupOnboarding ? 'setup-onboarding' : ''} ${state.draggingFiles ? 'drag-over' : ''}" data-drop-zone="chat">
      <div class="chat-feed" id="chatFeed">${messages}</div>
      ${composer}
      ${state.draggingFiles ? '<div class="chat-drop-overlay"><strong>松手添加文件</strong><span>图片、音频、PDF、文本和其他文件都会进入当前消息附件。</span></div>' : ''}
    </section>
  `
}

function attachmentMenuItems() {
  return renderAttachmentMenu(undefined, escapeHtml)
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
  const { left, top } = attachmentMenuPosition({
    triggerRect: rect,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  })

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
        ${selectField('chat_quality_mode', '对话质量模式', ['quality', 'fast'], '质量模式 = 对齐网页端 Reasoning；极速模式 = 关闭 thinking 换取更短延迟。')}
        ${field('chat_template_kwargs', 'Chat Template Kwargs', { textarea: true, hint: '质量模式留空，使用模型默认 Reasoning；极速模式会自动写入 {"enable_thinking":false}。' })}
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

function renderOnboardingActionPanel(showRunCheck = false) {
  const guide = downloadGuidance()
  const repair = startupDiagnosis({
    config: state.config || {},
    validation: state.validation || {},
    status: state.status || {},
    dirty: state.dirty,
  })
  return `
    <div class="onboarding-action-panel">
      <div class="onboarding-primary">
        <div class="onboarding-copy">
          <span>Release Candidate · 本地验收版</span>
          <h1>把本地大模型跑起来</h1>
          <p>先选完整 llama.cpp 包和 GGUF 模型，再启动服务并检查端口。服务可用后，复制到第三方客户端。</p>
        </div>
        <div class="onboarding-status ${escapeHtml(repair.level)}">
          ${repairBadge(repair.level)}
          <strong>${escapeHtml(repair.title)}</strong>
          <em>${escapeHtml(repair.action)}</em>
        </div>
        ${showRunCheck ? `<div class="onboarding-run-check">${renderReadinessStrip()}</div>` : ''}
        <div class="onboarding-actions">
          <button type="button" class="primary-btn" data-action="open-downloads">官方下载</button>
          <button type="button" class="outline-btn" data-section="io">选择目录</button>
          <button type="button" class="outline-btn" data-action="open-first-run-wizard">启动向导</button>
          <button type="button" class="outline-btn" data-action="copy-feedback-bundle">复制诊断</button>
        </div>
      </div>
      <div class="onboarding-roadmap">
        <div class="onboarding-steps">
          ${['选择运行包', '选择 GGUF 模型', '检测硬件并推荐参数', '启动并检查端口', '复制到第三方客户端']
            .map((item, index) => `<div><span>${index + 1}</span><strong>${escapeHtml(item)}</strong></div>`)
            .join('')}
        </div>
        <p class="onboarding-footnote">${escapeHtml(guide.detail)}</p>
      </div>
    </div>
  `
}

function repairBadge(level, label) {
  const text = label || {
    good: '可用',
    ready: '就绪',
    normal: '提醒',
    pending: '待处理',
    warning: '注意',
    blocked: '阻塞',
  }[level] || level || '提醒'
  return `<span class="repair-badge ${escapeHtml(level || 'normal')}">${escapeHtml(text)}</span>`
}

function renderStartupRepairBox(diagnosis) {
  return `
    <div class="repair-hero ${escapeHtml(diagnosis.level)}">
      <div>
        ${repairBadge(diagnosis.level)}
        <strong>${escapeHtml(diagnosis.title)}</strong>
        <p>${escapeHtml(diagnosis.detail)}</p>
      </div>
      <em>${escapeHtml(diagnosis.action)}</em>
    </div>
  `
}

function renderFirstRunStepList(steps) {
  return `
    <div class="repair-step-list">
      ${steps
        .map((step, index) => `
          <div class="repair-step ${escapeHtml(step.state)}">
            <span>${index + 1}</span>
            <div>
              <strong>${escapeHtml(step.title)}</strong>
              <em>${escapeHtml(step.detail)}</em>
            </div>
            ${repairBadge(step.state)}
          </div>
        `)
        .join('')}
    </div>
  `
}

function renderPathSnapshot(config, validation) {
  const rows = [
    ['llama.cpp 原文件目录', validation.serverDir || config.llama_bin_dir || '未选择', validation.serverDirExists],
    ['llama-server.exe', config.llama_server_path || '未选择', validation.serverExists],
    ['GGUF 模型文件', config.model || '未选择', validation.modelExists],
    ['mmproj 投影文件', config.mmproj || '未选择', !config.mmproj || validation.mmprojExists],
  ]

  return `
    <div class="path-snapshot">
      ${rows
        .map(([label, value, ok]) => `
          <div>
            <span>${escapeHtml(label)}</span>
            <code title="${escapeAttribute(value)}">${escapeHtml(value)}</code>
            ${pill(ok, '已找到', '未找到')}
          </div>
        `)
        .join('')}
    </div>
    <div class="settings-inline-actions">
      <button type="button" class="outline-btn" data-section="overview">打开概述参数</button>
      <button type="button" class="outline-btn" data-section="display">打开模型设置</button>
      <button type="button" class="outline-btn" data-section="logs">打开日志</button>
    </div>
  `
}

function renderIntegrationRows(guide) {
  return `
    <div class="integration-grid">
      <div>
        <span>第三方客户端填写</span>
        <strong>OpenAI Base URL</strong>
        <code>${escapeHtml(guide.baseUrl)}</code>
      </div>
      <div>
        <span>不要填错成 Base URL 的场景</span>
        <strong>Chat Completions URL</strong>
        <code>${escapeHtml(guide.chatCompletionsUrl)}</code>
      </div>
      <div>
        <span>模型名</span>
        <strong>${escapeHtml(guide.modelName)}</strong>
        <code>API Key: ${escapeHtml(guide.apiKeyHint)}</code>
      </div>
    </div>
    <div class="settings-inline-actions">
      <button type="button" class="outline-btn" data-action="copy-integration-guide">复制第三方接入信息</button>
      <button type="button" class="outline-btn" data-action="health">检查端口</button>
    </div>
    <div class="settings-callout">Cherry Studio、Open WebUI、One API 等通常填 Base URL，也就是以 /v1 结尾的地址；/v1/chat/completions 是单个接口地址。</div>
  `
}

function renderPerformanceHintList(hints) {
  if (!hints.length) {
    return '<div class="repair-empty">暂无明显高风险参数。遇到卡顿时优先看终端日志和系统资源占用。</div>'
  }

  return `
    <div class="repair-hint-list">
      ${hints
        .map(hint => `
          <div class="repair-hint ${escapeHtml(hint.level)}">
            ${repairBadge(hint.level)}
            <div>
              <strong>${escapeHtml(hint.title)}</strong>
              <p>${escapeHtml(hint.detail)}</p>
              <em>${escapeHtml(hint.action)}</em>
            </div>
          </div>
        `)
        .join('')}
    </div>
  `
}

function renderEnvironmentIntegrityCard(integrity) {
  return `
    <div class="repair-hero ${escapeHtml(integrity.summary.level)}">
      <div>
        ${repairBadge(integrity.summary.level)}
        <strong>${escapeHtml(integrity.summary.title)}</strong>
        <p>${escapeHtml(integrity.summary.detail)}</p>
      </div>
      <em>${escapeHtml(integrity.summary.action)}</em>
    </div>
    <div class="repair-hint-list">
      ${integrity.rows
        .map(row => `
          <div class="repair-hint ${escapeHtml(row.state)}">
            ${repairBadge(row.state)}
            <div>
              <strong>${escapeHtml(row.label)}</strong>
              <p>${escapeHtml(row.detail)}</p>
              <em>${escapeHtml(row.action)}</em>
            </div>
          </div>
        `)
        .join('')}
    </div>
  `
}

function renderPortDiagnosisCard(diagnosis) {
  const checks = Array.isArray(diagnosis.checks) ? diagnosis.checks : []
  return `
    <div class="repair-hero ${escapeHtml(diagnosis.level)}">
      <div>
        ${repairBadge(diagnosis.level)}
        <strong>${escapeHtml(diagnosis.title)}</strong>
        <p>${escapeHtml(diagnosis.detail)}</p>
      </div>
      <em>${escapeHtml(diagnosis.action)}</em>
    </div>
    <div class="endpoint-checks">
      ${
        checks.length
          ? checks.map(check => `
              <div>
                <span>${escapeHtml(check.id || 'check')}</span>
                <code>${escapeHtml(check.url || '')}</code>
                ${pill(Boolean(check.ok), `HTTP ${check.status || 200}`, check.status ? `HTTP ${check.status}` : '失败')}
              </div>
            `).join('')
          : '<div><span>尚未检查</span><code>点击“检查端口”后显示 /v1/models 和 chat 路由结果。</code><span class="pill warn">待检查</span></div>'
      }
    </div>
  `
}

function renderRecommendationCard(recommendation) {
  return `
    <div class="recommendation-grid">
      <div><span>模型规模</span><strong>${escapeHtml(recommendation.sizeClass)}</strong></div>
      <div><span>ctx_size</span><strong>${escapeHtml(recommendation.profile.ctxSize)}</strong></div>
      <div><span>n_gpu_layers</span><strong>${escapeHtml(recommendation.profile.gpuLayers)}</strong></div>
      <div><span>batch_size</span><strong>${escapeHtml(recommendation.profile.batchSize)}</strong></div>
    </div>
    <div class="settings-callout">${escapeHtml(recommendation.reason)}</div>
    ${recommendation.warnings.length ? renderPerformanceHintList(recommendation.warnings.map((warning, index) => ({
      id: `recommendation-${index}`,
      level: 'warning',
      title: '推荐参数提醒',
      detail: warning,
      action: '先应用保守参数跑通，再逐步加大。',
    }))) : ''}
    <div class="settings-inline-actions">
      <button type="button" class="outline-btn" data-action="apply-recommended-params">应用推荐参数</button>
    </div>
  `
}

function renderSimpleRows(rows) {
  return `
    <div class="closure-rows">
      ${rows.map(row => `
        <div class="${escapeHtml(row.state || 'normal')}">
          <span>${escapeHtml(row.label || row.id)}</span>
          <strong>${escapeHtml(row.value || row.detail || row.action || '')}</strong>
          ${row.action ? `<em>${escapeHtml(row.action)}</em>` : ''}
        </div>
      `).join('')}
    </div>
  `
}

function renderPortRepairCard(plan) {
  return `
    <div class="repair-hero ${escapeHtml(plan.level)}">
      <div>
        ${repairBadge(plan.level)}
        <strong>${escapeHtml(plan.title)}</strong>
        <p>${escapeHtml(plan.detail)}</p>
      </div>
      <em>${escapeHtml(plan.action)}</em>
    </div>
    ${plan.processes?.length ? renderSimpleRows(plan.processes.map(item => ({
      id: `pid-${item.pid}`,
      label: `PID ${item.pid}`,
      value: item.name || 'unknown',
      action: item.state || item.localAddress || '',
    }))) : '<div class="settings-callout">还没有检测到占用进程；点击“检测端口占用”后显示本机线索。</div>'}
    <div class="settings-inline-actions">
      <button type="button" class="outline-btn" data-action="inspect-port">检测端口占用</button>
      <button type="button" class="outline-btn" data-action="apply-port-fix" ${plan.canApply ? '' : 'disabled'}>改用 ${escapeHtml(plan.suggestedPort || '')}</button>
    </div>
  `
}

function renderDownloadCard(guidance) {
  return `
    <div class="repair-hero warning">
      <div>
        ${repairBadge('warning', '手动确认')}
        <strong>${escapeHtml(guidance.title)}</strong>
        <p>${escapeHtml(guidance.detail)}</p>
      </div>
      <em>${escapeHtml(guidance.action)}</em>
    </div>
    <div class="settings-inline-actions">
      <button type="button" class="outline-btn" data-action="open-downloads">打开官方下载页</button>
      <button type="button" class="outline-btn" data-action="copy-download-guidance">复制下载说明</button>
    </div>
    ${renderSimpleRows(guidance.keywords.map(keyword => ({ label: '关键词', value: keyword })))}
  `
}

function renderClientSmokeCard(plan) {
  return `
    <div class="repair-hero ${escapeHtml(plan.level)}">
      <div>
        ${repairBadge(plan.level)}
        <strong>${escapeHtml(plan.title)}</strong>
        <p>${escapeHtml(plan.detail)}</p>
      </div>
      <em>${escapeHtml(plan.action)}</em>
    </div>
    <div class="command-preview compact">
      <pre>${escapeHtml(plan.templateText)}</pre>
      <button type="button" class="outline-btn small-btn" data-action="copy-integration-guide">复制</button>
    </div>
    <div class="settings-inline-actions">
      <button type="button" class="outline-btn" data-action="client-smoke-test">本机联调 smoke test</button>
    </div>
  `
}

function renderFeedbackCard() {
  return `
    <div class="repair-hero normal">
      <div>
        ${repairBadge('normal', '反馈')}
        <strong>一键复制反馈诊断</strong>
        <p>自动附带版本、启动命令、端口检查、模型路径和最近状态，方便直接粘贴给排查人员。</p>
      </div>
      <em>不自动上传任何信息，由你确认后再发送。</em>
    </div>
    <div class="settings-inline-actions">
      <button type="button" class="outline-btn" data-action="copy-feedback-bundle">复制反馈诊断</button>
      <button type="button" class="outline-btn" data-action="open-downloads">打开 llama.cpp releases</button>
    </div>
  `
}

function renderRescueSettingsContent() {
  const config = state.config || {}
  const validation = state.validation || {}
  const repair = startupDiagnosis({ config, validation, status: state.status, dirty: state.dirty })
  const steps = firstRunSteps({ config, validation, status: state.status, dirty: state.dirty })
  const guide = integrationGuide({ config, status: state.status })
  const hints = performanceHints({ config })
  const multimodal = multimodalAdvice({ config, validation })
  const integrity = environmentIntegrity({ config, validation })
  const endpointDiagnosis = portDiagnosis(state.health || { ok: null, kind: 'unchecked', url: state.status?.url, message: '尚未检查端口' })
  const recommendation = modelRecommendation({ config })
  const download = downloadGuidance()
  const portRepair = portRepairPlan({ config, status: state.status, inspection: state.portInspection, health: state.health })
  const hardware = hardwareRecommendation({ config, systemInfo: state.systemInfo || {} })
  const clientPlan = clientSmokePlan({ config, status: state.status, smoke: state.clientSmoke })
  const capability = modelCapabilityCatalog({ config, modelInfo: state.modelInfo || {} })
  const release = releaseCandidateChecklist({ build: { packaged: true, shortcut: true, opened: true, screenshots: 0 } })
  return `
    <div class="settings-stack rescue-stack">
      ${renderModernSettingsCard('启动救援', '把“为什么启动不了”和“下一步点哪里”集中到这一页。', `
        ${renderStartupRepairBox(repair)}
        ${renderPathSnapshot(config, validation)}
        ${renderFirstRunStepList(steps)}
        <div class="settings-inline-actions">
          <button type="button" class="outline-btn" data-action="open-first-run-wizard">重新打开首次启动向导</button>
        </div>
      `)}
      ${renderModernSettingsCard('环境完整性', '区分真正阻塞和只是需要留意的运行包问题。', renderEnvironmentIntegrityCard(integrity))}
      ${renderModernSettingsCard('完整包下载', '避免只下载 cudart/runtime 包导致找不到 server。', renderDownloadCard(download))}
      ${renderModernSettingsCard('端口诊断', '检查 base URL、/v1/models 和 chat completions 路由。', renderPortDiagnosisCard(endpointDiagnosis))}
      ${renderModernSettingsCard('端口占用修复', '不杀进程，优先检测并切换到可用端口。', renderPortRepairCard(portRepair))}
      ${renderModernSettingsCard('硬件推荐参数', '读取本机 CPU/内存/GPU 线索后给保守起点。', `
        ${renderRecommendationCard(recommendation)}
        ${renderSimpleRows(hardware.rows)}
      `)}
      ${renderModernSettingsCard('第三方接入', '给 Cherry Studio、Open WebUI 等 OpenAI 兼容客户端使用。', renderIntegrationRows(guide))}
      ${renderModernSettingsCard('第三方联调验证', '先用本机 OpenAI-compatible 请求验证模板。', renderClientSmokeCard(clientPlan))}
      ${renderModernSettingsCard('模型能力库', '基于文件名和服务端元数据做保守识别，未知时不硬猜。', `
        <div class="settings-callout">${escapeHtml(capability.title)} · ${escapeHtml(capability.action)}</div>
        ${renderSimpleRows(capability.rows)}
      `)}
      ${renderModernSettingsCard('性能与卡顿风险', '把评论区里最常见的内存、显存、超时问题提前摊开。', `
        ${renderPerformanceHintList(hints)}
        <div class="settings-callout">如果启动像卡住，先降 ctx_size、n_gpu_layers 或 batch，再复制支持诊断给排查人员。</div>
      `)}
      ${renderModernSettingsCard('反馈入口', '遇到问题时给排查人员一份完整上下文。', renderFeedbackCard())}
      ${renderModernSettingsCard('发布候选包', '本轮只生成本机验收包，不自动推送正式 release。', `
        <div class="repair-hero ${escapeHtml(release.summary.level)}">
          <div>
            ${repairBadge(release.summary.level)}
            <strong>${escapeHtml(release.summary.title)}</strong>
            <p>${escapeHtml(release.summary.detail)}</p>
          </div>
          <em>${escapeHtml(release.summary.action)}</em>
        </div>
        ${renderSimpleRows(release.rows)}
      `)}
      ${renderModernSettingsCard('图片理解', '图片上传不等于模型一定能看图。', `
        <div class="repair-hero ${escapeHtml(multimodal.level)}">
          <div>
            ${repairBadge(multimodal.level)}
            <strong>${escapeHtml(multimodal.title)}</strong>
            <p>${escapeHtml(multimodal.detail)}</p>
          </div>
          <em>${escapeHtml(multimodal.action)}</em>
        </div>
        <div class="settings-inline-actions">
          <button type="button" class="outline-btn" data-action="open-model-info">查看模型信息</button>
          <button type="button" class="outline-btn" data-action="copy-support-bundle">复制支持诊断</button>
        </div>
      `)}
    </div>
  `
}

function renderFirstRunWizard() {
  if (!state.firstRunWizardOpen) return ''
  const config = state.config || {}
  const validation = state.validation || {}
  const integrity = environmentIntegrity({ config, validation })
  const endpointDiagnosis = portDiagnosis(state.health || { ok: null, kind: 'unchecked', url: state.status?.url, message: '尚未检查端口' })
  const recommendation = modelRecommendation({ config })
  const guide = integrationGuide({ config, status: state.status })
  return `
    <div class="dialog-backdrop first-run-backdrop" data-action="close-first-run-wizard"></div>
    <section class="first-run-panel">
      <div class="first-run-head">
        <div>
          <span>首次启动向导</span>
          <strong>按顺序跑通本地 llama.cpp 服务</strong>
        </div>
        <button type="button" class="icon-btn" data-action="close-first-run-wizard">&times;</button>
      </div>
      <div class="first-run-body">
        ${renderModernSettingsCard('1. 环境完整性', '先确认你选的是完整 llama.cpp 包，不是 cudart 运行库包。', renderEnvironmentIntegrityCard(integrity))}
        ${renderModernSettingsCard('2. 模型文件', '没有 GGUF 模型，端口启动了也无法聊天。', renderPathSnapshot(config, validation))}
        ${renderModernSettingsCard('3. 推荐参数', '先用保守参数跑通，不要一上来拉满上下文和 GPU 层数。', renderRecommendationCard(recommendation))}
        ${renderModernSettingsCard('4. 端口诊断', '启动后检查 OpenAI 兼容接口是否真的可用。', renderPortDiagnosisCard(endpointDiagnosis))}
        ${renderModernSettingsCard('5. 第三方接入', '复制到 Cherry Studio、Open WebUI 或其他 OpenAI 兼容客户端。', renderIntegrationRows(guide))}
      </div>
      <div class="first-run-foot">
        <button type="button" class="outline-btn" data-action="close-first-run-wizard">稍后再说</button>
        <button type="button" class="outline-btn" data-action="health">检查端口</button>
        <button type="button" class="primary-btn" data-action="wizard-start">保存并启动</button>
      </div>
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
            <strong>${escapeHtml(state.localBaseUrl || state.status.url || '')}/v1</strong>
          </div>
          <div class="endpoint-box">
            <span>Chat Completions</span>
            <strong>${escapeHtml(state.chatCompletionsUrl || `${state.status.url || ''}/v1/chat/completions`)}</strong>
          </div>
        `)}
        ${renderModernSettingsCard('运行参数', '桌面端直连 llama.cpp 时，这一组就是最常用的核心参数。', `
          <div class="form-grid two">
            ${selectField('launch_mode', '启动方式', ['direct', 'launcher'], 'direct = 直接调用 llama-server.exe；launcher = 兼容旧启动器')}
            ${field('host', 'Host', { warningId: 'public-host' })}
            ${field('port', 'Port', { type: 'number', min: 1 })}
            ${field('ctx_size', '上下文大小 ctx_size', { type: 'number', min: 1, warningId: 'high-context' })}
            ${field('n_predict', '最大输出 n_predict', { type: 'number' })}
            ${field('n_gpu_layers', 'GPU 层数', { type: 'number' })}
            ${field('request_timeout_ms', '请求超时 ms', { type: 'number', min: 30000, warningId: 'short-timeout' })}
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

  if (tab === 'rescue') {
    return renderRescueSettingsContent()
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
            ${selectField('chat_quality_mode', '对话质量模式', ['quality', 'fast'], '质量模式 = 对齐网页端 Reasoning；极速模式 = 关闭 thinking 换取更短延迟。')}
            ${field('chat_template_kwargs', 'Chat Template Kwargs', { textarea: true, hint: '质量模式留空，使用模型默认 Reasoning；极速模式会写入 {"enable_thinking":false}。也兼容 --chat-template-kwargs \'{\\"enable_thinking\\":false}\'。' })}
          </div>
          <div class="settings-callout">质量模式会优先保证创意代码、复杂推理和长答案质量；下面的“显示思考过程”只是控制桌面端是否把已返回的 <think> 展示出来。图片理解需要视觉模型和 mmproj。</div>
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

  if (tab === 'appearance') {
    return `
      <div class="settings-stack">
        ${renderModernSettingsCard('外观', '把最影响观感的几项集中到一起，顺手做一轮界面收紧。', `
          <div class="form-grid single">
            ${selectField('theme_mode', '界面主题', ['system', 'light', 'dark'], '跟随系统会读取 Windows 当前深浅色。')}
          </div>
          <div class="appearance-preview">
            <div class="appearance-preview-sidebar">
              <span></span>
              <strong>llama.cpp</strong>
              <em>Local endpoint</em>
            </div>
            <div class="appearance-preview-chat">
              <p>你好，我可以直接读取本地附件，也能把网页代码做成可预览结果。</p>
              <code>http://127.0.0.1:8080/v1</code>
            </div>
          </div>
        `)}
        ${renderModernSettingsCard('聊天字体', '只影响对话内容，不改变设置面板和按钮尺寸。', `
          <div class="form-grid single">
            ${selectField('chat_font', '聊天字体', ['default', 'sans', 'system', 'readable'], '易读模式会使用更宽松的行高和更稳的中文字体栈。')}
          </div>
        `)}
        ${renderModernSettingsCard('关于', '应用标识与版本信息。', `
          <div class="about-card">
            <strong>llama.cpp Desktop</strong>
            <span>Windows 桌面客户端</span>
            <em>v0.6.13</em>
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

  applyAppearancePreferences()
  const previousFeed = document.getElementById('chatFeed')
  const previousFeedTop = previousFeed?.scrollTop || 0
  const previousFeedHeight = previousFeed?.scrollHeight || 0
  const hasChatMessages = state.chatMessages.length > 0
  const shouldStick = hasChatMessages && (options.stickToBottom ?? isNearBottom(previousFeed))
  const running = state.status.state === 'running' || state.status.state === 'starting'
  appEl.innerHTML = `
    <div class="drag-region">
      <span></span>
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
    ${renderFirstRunWizard()}
    ${renderAttachmentMenuPortal()}
    <div class="toast ${state.toast ? 'show' : ''}">${escapeHtml(state.toast)}</div>
  `

  const chatFeed = document.getElementById('chatFeed')
  if (chatFeed) {
    if (!hasChatMessages) {
      chatFeed.scrollTop = options.preserveChatScroll && previousFeed ? previousFeedTop : 0
    } else if (options.jumpToBottom) {
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
  if (payload.configWarnings) state.configWarnings = payload.configWarnings
  if (payload.listenBaseUrl) state.listenBaseUrl = payload.listenBaseUrl
  if (payload.localBaseUrl) state.localBaseUrl = payload.localBaseUrl
  if (payload.chatCompletionsUrl) state.chatCompletionsUrl = payload.chatCompletionsUrl
  if (payload.validation) state.validation = payload.validation
  if (payload.status) state.status = payload.status
  if (Array.isArray(payload.logs)) state.logs = { ...state.logs, entries: payload.logs }
  if (payload.logStats) state.logs = { ...state.logs, ...payload.logStats }
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
    scheduleStreamRender(lastIndex)
  }
  if (payload.thinkingDelta) {
    last.thinking = `${last.thinking || ''}${payload.thinkingDelta}`
    scheduleStreamRender(lastIndex)
  }
  if (payload.done) {
    flushStreamRender()
    last.thinking = payload.thinking || last.thinking || ''
    last.content = payload.content || last.content || (last.thinking ? '' : '模型返回了空内容。')
    updateLiveStats(last)
    last.streaming = false
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
  state.health = result
  const diagnosis = portDiagnosis(result)
  setToast(result.ok ? `端口正常：${result.endpointBase || `${result.url}/v1`}` : `${diagnosis.title}：${diagnosis.action}`)
  render({ preserveChatScroll: true })
}

async function inspectPort() {
  state.busy = true
  render({ preserveChatScroll: true })
  try {
    state.portInspection = await window.llamaDesktop.inspectPort({ config: state.config })
    const plan = portRepairPlan({ config: state.config || {}, status: state.status, inspection: state.portInspection, health: state.health })
    setToast(`${plan.title}：${plan.action}`)
  } catch (error) {
    setToast(error?.message || String(error))
  } finally {
    state.busy = false
    render({ preserveChatScroll: true })
  }
}

async function clientSmokeTest() {
  state.busy = true
  render({ preserveChatScroll: true })
  try {
    state.clientSmoke = await window.llamaDesktop.clientSmokeTest({ config: state.config })
    const plan = clientSmokePlan({ config: state.config || {}, status: state.status, smoke: state.clientSmoke })
    setToast(`${plan.title}：${plan.action}`)
  } catch (error) {
    state.clientSmoke = { ok: false, message: error?.message || String(error) }
    setToast(error?.message || String(error))
  } finally {
    state.busy = false
    render({ preserveChatScroll: true })
  }
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

function makeChatRequestId() {
  return `chat-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function createPendingAssistant(requestId) {
  const assistant = {
    role: 'assistant',
    content: '',
    thinking: '',
    createdAt: Date.now(),
    startedAt: Date.now(),
    model: modelName(),
    tokens: 0,
    estimatedTokens: 0,
    latencyMs: 0,
    speed: '',
    streaming: true,
  }
  assistant.requestId = requestId
  return assistant
}

function assistantForRequest(requestId) {
  if (!requestId) return null
  return state.chatMessages.find(message => message.role === 'assistant' && message.requestId === requestId) || null
}

function markAssistantFailed(requestId, error, retry = false) {
  const assistant = assistantForRequest(requestId)
  if (!assistant) return
  const errorText = String(error?.message || error || '')
  const cancelled = Boolean(assistant.cancelRequested) || /cancelled|canceled|request cancelled/i.test(errorText)
  const displayError = friendlyErrorMessage(error).replace(/^发送失败/, retry ? '重试失败' : '发送失败')
  assistant.streaming = false
  assistant.localOnly = true
  assistant.state = cancelled ? 'cancelled' : 'failed'
  assistant.error = displayError
  if (!assistant.content && !assistant.thinking) {
    assistant.content = cancelled ? '已停止生成。' : displayError
  }
}

async function cancelChat() {
  const requestId = state.streamRequestId
  const assistant = assistantForRequest(requestId)
  if (!state.chatBusy || !requestId || !assistant || assistant.cancelRequested) return
  assistant.cancelRequested = true
  assistant.state = 'cancelling'
  render({ preserveChatScroll: true })
  try {
    const result = await window.llamaDesktop.cancelChat(requestId)
    if (!result?.ok && state.chatBusy) {
      assistant.cancelRequested = false
      assistant.state = ''
      setToast('当前请求已结束，无法停止')
    }
  } catch (error) {
    assistant.cancelRequested = false
    assistant.state = ''
    setToast(error?.message || String(error))
  }
}

async function sendChat() {
  const content = state.chatInput.trim()
  if ((!content && state.attachments.length === 0) || state.chatBusy) return

  if (!state.currentSessionId) state.currentSessionId = makeSessionId()
  const attachments = state.attachments
  state.chatMessages.push({ role: 'user', content, attachments, createdAt: Date.now() })
  const requestId = makeChatRequestId()
  state.chatMessages.push(createPendingAssistant(requestId))
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
    const assistant = assistantForRequest(requestId)
    if (assistant?.role === 'assistant') {
      assistant.thinking = result.thinking || assistant.thinking || ''
      assistant.content = result.content || assistant.content || (assistant.thinking ? '' : '模型返回了空内容。')
      const estimatedTokens = estimateTokens(generatedTextForStats(assistant))
      const stats = responseStats(result.raw, generatedTextForStats(assistant), latencyMs)
      assistant.tokens = stats.tokens || estimatedTokens
      assistant.estimatedTokens = estimatedTokens
      assistant.latencyMs = latencyMs
      assistant.speed = stats.speed || ''
      assistant.speedSource = stats.speedSource || ''
      if (!assistant.speed && assistant.tokens) {
        assistant.liveSpeed = `${(Number(assistant.tokens) / (latencyMs / 1000)).toFixed(2)} t/s`
        assistant.liveSpeedSource = 'estimate'
      }
      assistant.streaming = false
      assistant.state = ''
    }
    saveCurrentSession()
  } catch (error) {
    markAssistantFailed(requestId, error)
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
  const requestId = makeChatRequestId()
  state.chatMessages.push(createPendingAssistant(requestId))
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
    const assistant = assistantForRequest(requestId)
    if (assistant?.role === 'assistant') {
      assistant.thinking = result.thinking || assistant.thinking || ''
      assistant.content = result.content || assistant.content || (assistant.thinking ? '' : `基于“${userMessage.content}”重试后，模型返回了空内容。`)
      const estimatedTokens = estimateTokens(generatedTextForStats(assistant))
      const stats = responseStats(result.raw, generatedTextForStats(assistant), latencyMs)
      assistant.tokens = stats.tokens || estimatedTokens
      assistant.estimatedTokens = estimatedTokens
      assistant.latencyMs = latencyMs
      assistant.speed = stats.speed || ''
      assistant.speedSource = stats.speedSource || ''
      if (!assistant.speed && assistant.tokens) {
        assistant.liveSpeed = `${(Number(assistant.tokens) / (latencyMs / 1000)).toFixed(2)} t/s`
        assistant.liveSpeedSource = 'estimate'
      }
      assistant.streaming = false
      assistant.state = ''
    }
    saveCurrentSession()
  } catch (error) {
    markAssistantFailed(requestId, error, true)
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
      addAttachments(picked, `${attachmentLabel(kind)}已添加`)
    } else {
      state.attachmentMenuOpen = false
      state.attachmentMenuPosition = null
      render()
    }
  } catch (error) {
    setToast(error.message || String(error))
  }
}

function addAttachments(picked, fallbackMessage = '文件已添加') {
  state.attachments = [...state.attachments, ...picked]
  state.attachmentMenuOpen = false
  state.attachmentMenuPosition = null
  state.draggingFiles = false
  state.dragDepth = 0
  const errors = picked.filter(item => item.error)
  const hasImage = picked.some(item => item.kind === 'image')
  const hasLargeImage = picked.some(item => item.kind === 'image' && !item.dataUrl)
  if (errors.length) {
    setToast(`已添加 ${picked.length} 个文件，其中 ${errors.length} 个只记录路径。`)
  } else if (hasLargeImage) {
    setToast('图片已添加，但文件较大，只会作为附件记录路径。')
  } else if (hasImage && !state.config?.mmproj) {
    setToast('图片已添加；未配置 mmproj 时，普通文本模型可能看不懂图片。')
  } else {
    setToast(fallbackMessage)
  }
}

function dragHasFiles(dataTransfer) {
  return Array.from(dataTransfer?.types || []).includes('Files')
}

function droppedFiles(dataTransfer) {
  return Array.from(dataTransfer?.files || [])
}

function droppedFilePath(file) {
  return file?.path || file?.webkitRelativePath || ''
}

function droppedFilePaths(files) {
  return files
    .map(file => droppedFilePath(file))
    .filter(Boolean)
}

function droppedMimeForFile(file) {
  const name = String(file?.name || '').toLowerCase()
  if (file?.type) return file.type
  if (/\.(png)$/i.test(name)) return 'image/png'
  if (/\.(jpe?g)$/i.test(name)) return 'image/jpeg'
  if (/\.(webp)$/i.test(name)) return 'image/webp'
  if (/\.(gif)$/i.test(name)) return 'image/gif'
  if (/\.(bmp)$/i.test(name)) return 'image/bmp'
  if (/\.(pdf)$/i.test(name)) return 'application/pdf'
  if (/\.(mp3)$/i.test(name)) return 'audio/mpeg'
  if (/\.(wav)$/i.test(name)) return 'audio/wav'
  if (/\.(flac)$/i.test(name)) return 'audio/flac'
  if (/\.(m4a)$/i.test(name)) return 'audio/mp4'
  if (/\.(ogg)$/i.test(name)) return 'audio/ogg'
  if (/\.(txt|md|json|toml|ya?ml|csv|log|py|js|ts|tsx|html|css|c|cpp|h|hpp)$/i.test(name)) return 'text/plain'
  return 'application/octet-stream'
}

function droppedKindForFile(file, mime = droppedMimeForFile(file)) {
  const name = String(file?.name || '').toLowerCase()
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  if (mime.startsWith('text/') || /\.(txt|md|json|toml|ya?ml|csv|log|py|js|ts|tsx|html|css|c|cpp|h|hpp)$/i.test(name)) return 'text'
  return 'file'
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  const chunks = []
  for (let index = 0; index < bytes.length; index += chunkSize) {
    chunks.push(String.fromCharCode(...bytes.subarray(index, index + chunkSize)))
  }
  return btoa(chunks.join(''))
}

async function readDroppedFileAsAttachment(file) {
  const mime = droppedMimeForFile(file)
  const kind = droppedKindForFile(file, mime)
  const attachment = {
    name: file.name || 'dropped-file',
    size: file.size || 0,
    mime,
    kind,
    source: 'drop',
  }

  if (kind === 'image' && file.size <= 10 * 1024 * 1024) {
    const base64 = arrayBufferToBase64(await file.arrayBuffer())
    attachment.dataUrl = `data:${attachment.mime};base64,${base64}`
  }

  if (kind === 'text' && file.size <= 256 * 1024) {
    attachment.text = await file.text()
  }

  return attachment
}

async function droppedFileAttachments(files) {
  const paths = droppedFilePaths(files)
  const pathSet = new Set(paths)
  const embeddedFiles = files.filter(file => !pathSet.has(droppedFilePath(file)))
  const attachments = []

  try {
    if (paths.length) {
      attachments.push(...(await window.llamaDesktop.importAttachments({ paths }) || []))
    }
    for (const file of embeddedFiles) {
      attachments.push(await readDroppedFileAsAttachment(file))
    }
  } catch (error) {
    setToast(error.message || String(error))
  }

  return attachments
}

async function importDroppedFiles(files) {
  const picked = await droppedFileAttachments(files)
  if (picked.length) {
    addAttachments(picked, `已拖入 ${picked.length} 个文件`)
  } else {
    setToast('拖拽来源没有提供可读取的文件，请从文件夹拖入原文件。')
  }
}

appEl.addEventListener('click', event => {
  const target = event.target.closest('[data-section], button, .settings-backdrop, .preview-backdrop, .dialog-backdrop, .attach-menu-backdrop')
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

  const section = target.dataset.section || target.closest('[data-section]')?.dataset.section
  if (section) {
    openSettingsSection(section)
    render()
    return
  }

  const pickField = target.dataset.pick
  if (pickField) {
    void pick(pickField, target.dataset.kind)
    return
  }

  const action = target.dataset.action
  if (action === 'toggle-thinking') {
    event.preventDefault()
    const key = target.dataset.thinkingKey || ''
    if (key) {
      const isOpen = state.openThinkingMessages.has(key) ||
        (Boolean(state.config?.expand_thinking) && !state.closedThinkingMessages.has(key))
      if (isOpen) {
        state.openThinkingMessages.delete(key)
        state.closedThinkingMessages.add(key)
      } else {
        state.closedThinkingMessages.delete(key)
        state.openThinkingMessages.add(key)
      }
      updateMessageDom(Number(target.dataset.messageIndex))
    }
    return
  }
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
  if (action === 'copy-terminal-diagnostics') {
    const text = diagnosticBundleText({
      config: state.config,
      status: state.status,
      logs: state.logs,
      terminalView: visibleTerminalLogs(),
    })
    void navigator.clipboard.writeText(text)
    setToast('终端诊断已复制，可直接粘贴给排查人员')
    return
  }
  if (action === 'toggle-run-check') {
    state.runCheckExpanded = !state.runCheckExpanded
    render({ preserveChatScroll: true })
    return
  }
  if (action === 'open-downloads') {
    void window.llamaDesktop.openUrl(downloadGuidance().releaseUrl)
    setToast('已打开 llama.cpp 官方 releases 页面')
    return
  }
  if (action === 'copy-download-guidance') {
    void navigator.clipboard.writeText(downloadGuidance().copyText)
    setToast('下载说明已复制')
    return
  }
  if (action === 'inspect-port') {
    void inspectPort()
    return
  }
  if (action === 'apply-port-fix') {
    const plan = portRepairPlan({ config: state.config || {}, status: state.status, inspection: state.portInspection, health: state.health })
    if (plan.canApply && plan.suggestedPort) {
      state.config.port = plan.suggestedPort
      state.dirty = true
      setToast(`已改用端口 ${plan.suggestedPort}，保存并重启后生效`)
      render({ preserveChatScroll: true })
    }
    return
  }
  if (action === 'client-smoke-test') {
    void clientSmokeTest()
    return
  }
  if (action === 'copy-integration-guide') {
    const text = integrationGuide({ config: state.config, status: state.status }).copyText
    void navigator.clipboard.writeText(text)
    setToast('第三方接入信息已复制')
    return
  }
  if (action === 'copy-support-bundle') {
    const text = supportBundleText({
      config: state.config,
      validation: state.validation,
      status: state.status,
      dirty: state.dirty,
    })
    void navigator.clipboard.writeText(text)
    setToast('支持诊断已复制')
    return
  }
  if (action === 'copy-feedback-bundle') {
    const parts = [
      supportBundleText({
        config: state.config,
        validation: state.validation,
        status: state.status,
        dirty: state.dirty,
      }),
      '',
      `Health: ${JSON.stringify(state.health || null)}`,
      `Port inspection: ${JSON.stringify(state.portInspection || null)}`,
      `System: ${JSON.stringify(state.systemInfo || null)}`,
      `Client smoke: ${JSON.stringify(state.clientSmoke || null)}`,
    ]
    void navigator.clipboard.writeText(parts.join('\n'))
    setToast('反馈诊断已复制，不会自动上传')
    return
  }
  if (action === 'open-first-run-wizard') {
    state.firstRunWizardOpen = true
    state.settingsOpen = false
    render({ preserveChatScroll: true })
    return
  }
  if (action === 'close-first-run-wizard') {
    state.firstRunWizardOpen = false
    state.firstRunWizardSeen = true
    try {
      window.localStorage?.setItem('llama-desktop:first-run-seen', '1')
    } catch {}
    render({ preserveChatScroll: true })
    return
  }
  if (action === 'apply-recommended-params') {
    const recommendation = modelRecommendation({ config: state.config || {} })
    state.config.ctx_size = recommendation.profile.ctxSize
    state.config.n_gpu_layers = recommendation.profile.gpuLayers
    state.config.batch_size = recommendation.profile.batchSize
    state.dirty = true
    setToast('已应用保守推荐参数，保存后生效')
    render({ preserveChatScroll: true })
    return
  }
  if (action === 'wizard-start') {
    state.firstRunWizardSeen = true
    state.firstRunWizardOpen = false
    try {
      window.localStorage?.setItem('llama-desktop:first-run-seen', '1')
    } catch {}
    void start()
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
    if (state.settingsOpen) {
      state.settingsOpen = false
    } else {
      openSettingsSection(settingsTabs.some(([id]) => id === state.active) ? state.active : 'overview')
    }
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
      const previewError = validateCodePreview(block.language || 'html', block.value || '')
      if (previewError) {
        state.preview = null
        state.previewError = previewError
        setToast(previewError)
        return
      }
      state.previewError = ''
      state.preview = {
        type: 'code',
        code: block.value || '',
        language: block.language || 'html',
        title: `${String(block.language || 'HTML').toUpperCase()} 预览`,
      }
      render({ preserveChatScroll: true })
    }
  }
  if (action === 'download-code') {
    const block = getCodeBlock(target.dataset.messageIndex, target.dataset.codeIndex)
    if (block) {
      const blob = new Blob([block.value || ''], { type: 'text/html;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'llama-artifact.html'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
      setToast('HTML 已保存')
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
    openSettingsSection('logs')
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
  if (action === 'cancel-chat') void cancelChat()
})

appEl.addEventListener('dragenter', event => {
  if (!dragHasFiles(event.dataTransfer)) return
  event.preventDefault()
  state.dragDepth += 1
  if (!state.draggingFiles) {
    state.draggingFiles = true
    render({ preserveChatScroll: true })
  }
})

appEl.addEventListener('dragover', event => {
  if (!dragHasFiles(event.dataTransfer)) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'copy'
})

appEl.addEventListener('dragleave', event => {
  if (!dragHasFiles(event.dataTransfer)) return
  state.dragDepth = Math.max(0, state.dragDepth - 1)
  if (state.dragDepth === 0 && state.draggingFiles) {
    state.draggingFiles = false
    render({ preserveChatScroll: true })
  }
})

appEl.addEventListener('drop', event => {
  if (!dragHasFiles(event.dataTransfer)) return
  event.preventDefault()
  const files = droppedFiles(event.dataTransfer)
  state.dragDepth = 0
  state.draggingFiles = false
  render({ preserveChatScroll: true })
  void importDroppedFiles(files)
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
  if (name === 'chat_quality_mode') {
    applyChatQualityMode(input.value)
  }
  if (name === 'theme_mode' || name === 'chat_font') {
    applyAppearancePreferences()
  }
  if (name === 'llama_bin_dir') {
    state.config.llama_server_path = `${String(input.value || '').replace(/[\\/]+$/, '')}\\llama-server.exe`
  }
  state.dirty = true
  refreshConfigWarnings()
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
    try {
      state.firstRunWizardSeen = window.localStorage?.getItem('llama-desktop:first-run-seen') === '1'
    } catch {
      state.firstRunWizardSeen = false
    }
    state.firstRunWizardOpen = shouldShowFirstRunWizard({
      config: state.config,
      validation: state.validation,
      status: state.status,
      seen: state.firstRunWizardSeen,
    })
    render()
    window.llamaDesktop.getSystemInfo?.()
      .then(info => {
        state.systemInfo = info
        render({ preserveChatScroll: true })
      })
      .catch(() => {})
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
      if (Array.isArray(payload.logs)) state.logs = { ...state.logs, entries: payload.logs }
      if (payload.logStats) state.logs = { ...state.logs, ...payload.logStats }
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

