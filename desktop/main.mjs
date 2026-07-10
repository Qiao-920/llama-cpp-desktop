import { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, shell } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildRequestMessages, createRequestRegistry, extractStreamDelta, normalizeChatTemplateKwargs } from './lib/chat-pipeline.mjs'
import { appendVisibleLogs, processLogChunk } from './lib/log-pipeline.mjs'
import { DEFAULT_HOST, assertNoCoreArgConflicts, assertStartableServerConfig, runtimeWarnings, serviceUrls, splitExtraArgs } from './lib/runtime-policy.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')
const preloadPath = path.join(__dirname, 'preload.cjs')
const rendererPath = path.join(rootDir, 'renderer', 'index.html')
const iconPath = path.join(rootDir, 'assets', 'llama-cpp.ico')
const trayIconPath = path.join(rootDir, 'assets', 'llama-cpp-tray.png')
const authoredBaseDir = 'G:\\llama.cpp\\llama.cpp启动器'
const authoredServerPath = 'G:\\llama.cpp\\llama-b8272-bin-win-cuda-12.4-x64\\llama-server.exe'
const authoredServerDir = path.dirname(authoredServerPath)

let mainWindow = null
let tray = null
let appIsQuitting = false
let firstHideNoticeShown = false
let serverChild = null
let stoppingServer = false
let runtimeStatus = {
  state: 'stopped',
  message: '服务未启动',
  pid: null,
  url: 'http://127.0.0.1:8080',
  startedAt: null,
}
let logs = { entries: [], filtered: 0, truncated: 0, dropped: 0 }
const requestRegistry = createRequestRegistry()

function defaultBaseDir() {
  const candidates = [
    authoredBaseDir,
    path.resolve(rootDir, '..'),
    path.dirname(process.execPath),
    path.resolve(path.dirname(process.execPath), '..'),
  ]
  return candidates.find(candidate => existsSync(path.join(candidate, 'config.toml'))) || authoredBaseDir
}

function defaultConfigPath() {
  return path.join(defaultBaseDir(), 'config.toml')
}

function defaultLauncherPath() {
  return path.join(defaultBaseDir(), 'llama-server-launcher.exe')
}

function defaultStatePath() {
  return path.join(app.getPath('userData'), 'desktop-state.json')
}

function defaultConfig() {
  return {
    launch_mode: 'direct',
    launcher_path: defaultLauncherPath(),
    config_path: defaultConfigPath(),
    llama_bin_dir: authoredServerDir,
    llama_server_path: authoredServerPath,
    model: '',
    mmproj: '',
    host: DEFAULT_HOST,
    port: 8080,
    ctx_size: 32768,
    n_predict: -1,
    n_gpu_layers: 99,
    chat_template_kwargs: '{"enable_thinking": false}',
    request_timeout_ms: 600000,
    temp: 0.8,
    top_k: 20,
    top_p: 0.95,
    min_p: 0,
    presence_penalty: 1.5,
    repeat_penalty: '',
    threads: '',
    threads_batch: '',
    batch_size: '',
    ubatch_size: '',
    cpu_moe: false,
    n_cpu_moe: '',
    device: '',
    split_mode: 'layer',
    tensor_split: '',
    main_gpu: '',
    extra_args: '',
    show_thinking: true,
    expand_thinking: false,
    show_raw_output: false,
    verbose: true,
    log_verbosity: 3,
    webui: true,
    embeddings: false,
    continuous_batching: true,
  }
}

function parseQuantization(fileName) {
  const text = String(fileName || '')
  const match = text.match(/\.(q\d[^.]*)\.gguf$/i) || text.match(/\.(iq\d[^.]*)\.gguf$/i)
  return match?.[1]?.toUpperCase() || '未标注'
}

function parseParameterScale(fileName) {
  const match = String(fileName || '').match(/(\d+(?:\.\d+)?)B/i)
  return match ? `${match[1]}B` : '未标注'
}

function parseFamily(fileName) {
  return String(fileName || '')
    .replace(/\.gguf$/i, '')
    .replace(/\.(q\d[^.]*)$/i, '')
    .replace(/\.(iq\d[^.]*)$/i, '')
}

async function fetchJson(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2800) })
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

function humanParams(value) {
  const number = Number(value || 0)
  if (!Number.isFinite(number) || number <= 0) return ''
  if (number >= 1_000_000_000) return `${(number / 1_000_000_000).toFixed(2)}B`
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(2)}M`
  return String(number)
}

function sendEvent(payload) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }
  mainWindow.webContents.send('llama:event', payload)
}

function setStatus(next) {
  runtimeStatus = { ...runtimeStatus, ...next }
  sendEvent({ type: 'status', status: runtimeStatus })
  updateTrayMenu()
}

function logStats() {
  const { filtered, truncated, dropped } = logs
  return { filtered, truncated, dropped }
}

function addLog(source, chunk) {
  const result = processLogChunk(source, chunk)
  const entries = result.entries.map(entry => ({ ...entry, at: new Date().toISOString() }))
  logs = appendVisibleLogs({
    ...logs,
    filtered: logs.filtered + result.filtered,
    truncated: logs.truncated + result.truncated,
  }, entries, 1200)

  for (const entry of entries) {
    if (entry.line.includes('server is listening')) {
      setStatus({ state: 'running', message: '服务正在监听', pid: serverChild?.pid || null })
    }
    if (entry.line.toLowerCase().includes('error')) {
      setStatus({ message: entry.line })
    }
  }
  sendEvent({ type: 'logs', logs: logs.entries, logStats: logStats() })
}

function stripTomlComment(line) {
  let inString = false
  let escaped = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (char === '"') {
      inString = !inString
      continue
    }
    if (char === '#' && !inString) {
      return line.slice(0, index)
    }
  }
  return line
}

function parseTomlValue(value) {
  const text = value.trim()
  if (!text) {
    return ''
  }
  if (text.startsWith('"') && text.endsWith('"')) {
    try {
      return JSON.parse(text)
    } catch {
      return text.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
    }
  }
  if (text === 'true') {
    return true
  }
  if (text === 'false') {
    return false
  }
  if (/^[+-]?\d+$/.test(text)) {
    return Number.parseInt(text, 10)
  }
  if (/^[+-]?\d+\.\d+$/.test(text)) {
    return Number.parseFloat(text)
  }
  return text
}

function parseToml(raw) {
  const result = {}
  for (const originalLine of raw.split(/\r?\n/)) {
    const line = stripTomlComment(originalLine).trim()
    if (!line || line.startsWith('[')) {
      continue
    }
    const equalIndex = line.indexOf('=')
    if (equalIndex < 0) {
      continue
    }
    const key = line.slice(0, equalIndex).trim()
    const value = line.slice(equalIndex + 1)
    result[key] = parseTomlValue(value)
  }
  return result
}

function toNumber(value, fallback = '') {
  if (value === '' || value === null || value === undefined) {
    return fallback
  }
  const next = Number(value)
  return Number.isFinite(next) ? next : fallback
}

function normalizeConfig(values, state = {}) {
  const base = defaultConfig()
  const merged = { ...base, ...state, ...values }
  const launchMode = merged.launch_mode === 'launcher' ? 'launcher' : 'direct'
  const llamaBinDir = hasValue(merged.llama_bin_dir)
    ? String(merged.llama_bin_dir)
    : path.dirname(String(merged.llama_server_path || base.llama_server_path))
  return {
    ...merged,
    launch_mode: launchMode,
    llama_bin_dir: llamaBinDir,
    llama_server_path: path.join(llamaBinDir, 'llama-server.exe'),
    port: toNumber(merged.port, base.port),
    ctx_size: toNumber(merged.ctx_size, base.ctx_size),
    n_predict: toNumber(merged.n_predict, base.n_predict),
    n_gpu_layers: toNumber(merged.n_gpu_layers, base.n_gpu_layers),
    request_timeout_ms: toNumber(merged.request_timeout_ms, base.request_timeout_ms),
    temp: toNumber(merged.temp, base.temp),
    top_k: toNumber(merged.top_k, base.top_k),
    top_p: toNumber(merged.top_p, base.top_p),
    min_p: toNumber(merged.min_p, base.min_p),
    presence_penalty: toNumber(merged.presence_penalty, base.presence_penalty),
    log_verbosity: toNumber(merged.log_verbosity, base.log_verbosity),
    extra_args: String(merged.extra_args || ''),
    show_thinking: merged.show_thinking !== false,
    expand_thinking: Boolean(merged.expand_thinking),
    show_raw_output: Boolean(merged.show_raw_output),
    verbose: Boolean(merged.verbose),
    webui: Boolean(merged.webui),
    embeddings: Boolean(merged.embeddings),
    continuous_batching: Boolean(merged.continuous_batching),
    cpu_moe: Boolean(merged.cpu_moe),
  }
}

function tomlString(value) {
  return `"${String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function optionalNumberLine(key, value) {
  if (value === '' || value === null || value === undefined) {
    return null
  }
  return `${key} = ${value}`
}

function buildToml(config) {
  const lines = [
    '# config.toml',
    '# Generated by Llama.cpp Desktop.',
    '',
    '# desktop launch mode: direct or launcher',
    `launch_mode = ${tomlString(config.launch_mode || 'direct')}`,
    '',
    '# llama-server.exe 的绝对路径',
    `llama_server_path = ${tomlString(config.llama_server_path)}`,
    '',
    '# 模型路径',
    `model = ${tomlString(config.model)}`,
  ]

  if (config.mmproj) {
    lines.push('', '# 多模态投影文件', `mmproj = ${tomlString(config.mmproj)}`)
  } else {
    lines.push('', '# mmproj = "G:\\\\llama.cpp\\\\models\\\\your-model\\\\mmproj.gguf"')
  }

  lines.push(
    '',
    '# 服务器设置',
    `host = ${tomlString(config.host)}`,
    `port = ${config.port}`,
    '',
    '# 常用参数',
    `ctx_size = ${config.ctx_size}`,
    `n_predict = ${config.n_predict}`,
    `n_gpu_layers = ${config.n_gpu_layers}`,
    `request_timeout_ms = ${config.request_timeout_ms}`,
    '',
    '# 对话模板参数',
    `chat_template_kwargs = ${tomlString(config.chat_template_kwargs)}`,
    '',
    '# 采样设置',
    `temp = ${config.temp}`,
    `top_k = ${config.top_k}`,
    `top_p = ${config.top_p}`,
    `min_p = ${config.min_p}`,
    `presence_penalty = ${config.presence_penalty}`,
  )

  const repeatPenalty = optionalNumberLine('repeat_penalty', config.repeat_penalty)
  if (repeatPenalty) {
    lines.push(repeatPenalty)
  }

  lines.push('', '# 系统设置')
  for (const [key, value] of [
    ['threads', config.threads],
    ['threads_batch', config.threads_batch],
    ['batch_size', config.batch_size],
    ['ubatch_size', config.ubatch_size],
  ]) {
    const line = optionalNumberLine(key, value)
    lines.push(line || `# ${key} = `)
  }

  lines.push('', '# 混合专家模型设置')
  if (config.cpu_moe) {
    lines.push('cpu_moe = true')
  } else {
    lines.push('# cpu_moe = true')
  }
  const nCpuMoe = optionalNumberLine('n_cpu_moe', config.n_cpu_moe)
  lines.push(nCpuMoe || '# n_cpu_moe = 15')

  lines.push('', '# GPU 设置')
  if (config.device) {
    lines.push(`device = ${tomlString(config.device)}`)
  } else {
    lines.push('# device = ""')
  }
  if (config.split_mode) {
    lines.push(`split_mode = ${tomlString(config.split_mode)}`)
  }
  if (config.tensor_split) {
    lines.push(`tensor_split = ${tomlString(config.tensor_split)}`)
  } else {
    lines.push('# tensor_split = "3,1"')
  }
  const mainGpu = optionalNumberLine('main_gpu', config.main_gpu)
  lines.push(mainGpu || '# main_gpu = 0')

  lines.push(
    '',
    '# 日志与功能',
    `verbose = ${config.verbose ? 'true' : 'false'}`,
    `log_verbosity = ${config.log_verbosity}`,
    `webui = ${config.webui ? 'true' : 'false'}`,
    `embeddings = ${config.embeddings ? 'true' : 'false'}`,
    `continuous_batching = ${config.continuous_batching ? 'true' : 'false'}`,
    '',
    '# 额外 llama-server 参数，会追加到最终启动命令末尾',
    `extra_args = ${tomlString(config.extra_args)}`,
    `show_thinking = ${config.show_thinking ? 'true' : 'false'}`,
    `expand_thinking = ${config.expand_thinking ? 'true' : 'false'}`,
    `show_raw_output = ${config.show_raw_output ? 'true' : 'false'}`,
    '',
  )

  return lines.join('\n')
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'))
  } catch {
    return fallback
  }
}

async function writeDesktopState(config) {
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(
    defaultStatePath(),
    JSON.stringify(
      {
        config_path: config.config_path,
        launch_mode: config.launch_mode,
        launcher_path: config.launcher_path,
        config,
      },
      null,
      2,
    ),
    'utf8',
  )
}

async function loadConfig() {
  const state = await readJson(defaultStatePath(), {})
  const configPath = state.config_path || defaultConfigPath()
  let parsed = {}
  if (existsSync(configPath)) {
    try {
    parsed = parseToml(await readFile(configPath, 'utf8'))
    } catch (error) {
      addLog('desktop', `读取配置失败：${error instanceof Error ? error.message : String(error)}`)
    }
  }
  const config = normalizeConfig({ ...parsed, ...(state.config || {}) }, {
    config_path: configPath,
    launch_mode: state.launch_mode || state.config?.launch_mode || parsed.launch_mode || 'direct',
    launcher_path: state.launcher_path || defaultLauncherPath(),
  })
  runtimeStatus.url = localUrl(config)
  return config
}

async function saveConfig(config) {
  const normalized = normalizeConfig(config)
  if (normalized.launch_mode === 'launcher') {
    await mkdir(path.dirname(normalized.config_path), { recursive: true })
    await writeFile(normalized.config_path, buildToml(normalized), 'utf8')
  }
  await writeDesktopState(normalized)
  runtimeStatus.url = localUrl(normalized)
  return normalized
}

function localUrl(config) {
  return serviceUrls(config).localBaseUrl
}

function hasValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== ''
}

function pushArg(args, flag, value) {
  if (hasValue(value)) {
    args.push(flag, String(value))
  }
}

function buildServerArgs(config) {
  assertNoCoreArgConflicts(config.extra_args)
  const args = []
  pushArg(args, '--model', config.model)
  pushArg(args, '--mmproj', config.mmproj)
  pushArg(args, '--host', config.host)
  pushArg(args, '--port', config.port)
  pushArg(args, '--ctx-size', config.ctx_size)
  pushArg(args, '--n-predict', config.n_predict)
  pushArg(args, '--n-gpu-layers', config.n_gpu_layers)
  pushArg(args, '--chat-template-kwargs', normalizeChatTemplateKwargsText(config.chat_template_kwargs))
  pushArg(args, '--temp', config.temp)
  pushArg(args, '--top-k', config.top_k)
  pushArg(args, '--top-p', config.top_p)
  pushArg(args, '--min-p', config.min_p)
  pushArg(args, '--presence-penalty', config.presence_penalty)
  pushArg(args, '--repeat-penalty', config.repeat_penalty)
  pushArg(args, '--threads', config.threads)
  pushArg(args, '--threads-batch', config.threads_batch)
  pushArg(args, '--batch-size', config.batch_size)
  pushArg(args, '--ubatch-size', config.ubatch_size)
  pushArg(args, '--device', config.device)
  pushArg(args, '--split-mode', config.split_mode)
  pushArg(args, '--tensor-split', config.tensor_split)
  pushArg(args, '--main-gpu', config.main_gpu)
  pushArg(args, '--n-cpu-moe', config.n_cpu_moe)
  pushArg(args, '--log-verbosity', config.log_verbosity)

  if (config.cpu_moe) args.push('--cpu-moe')
  if (config.verbose) args.push('--verbose')
  args.push(config.webui ? '--webui' : '--no-webui')
  if (config.embeddings) args.push('--embeddings')
  args.push(config.continuous_batching ? '--cont-batching' : '--no-cont-batching')
  args.push(...splitExtraArgs(config.extra_args))

  return args
}

function quoteCommandPart(value) {
  const text = String(value || '')
  if (!text) {
    return '""'
  }
  return /[\s"]/u.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text
}

function buildLaunchDetails(config) {
  const directMode = config.launch_mode !== 'launcher'
  const command = directMode ? config.llama_server_path : config.launcher_path
  try {
    const args = directMode ? buildServerArgs(config) : []
    return {
      mode: directMode ? 'direct' : 'launcher',
      command,
      args,
      cwd: directMode ? path.dirname(config.llama_server_path) : path.dirname(config.config_path),
      preview: [command, ...args].map(quoteCommandPart).join(' '),
      error: '',
    }
  } catch (error) {
    return {
      mode: directMode ? 'direct' : 'launcher',
      command,
      args: [],
      cwd: directMode ? path.dirname(config.llama_server_path) : path.dirname(config.config_path),
      preview: quoteCommandPart(command),
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function stripWrappingQuotes(text) {
  const value = String(text || '').trim()
  if (value.length >= 2) {
    const first = value[0]
    const last = value[value.length - 1]
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1).trim()
    }
  }
  return value
}

function normalizeChatTemplateKwargsText(raw) {
  let text = stripWrappingQuotes(raw)
  if (!text) {
    return ''
  }
  text = text.replace(/^--chat-template-kwargs\s+/i, '').trim()
  text = stripWrappingQuotes(text)
  if (text.includes('\\"')) {
    text = text.replace(/\\"/g, '"')
  }
  return text
}

function parseChatTemplateKwargs(raw) {
  return normalizeChatTemplateKwargs(raw)
}

function prepareChatMessages(rawMessages) {
  const messages = []

  for (const message of Array.isArray(rawMessages) ? rawMessages : []) {
    if (!message || message.localOnly) continue
    if (!['user', 'assistant', 'system'].includes(message.role)) continue

    const text = String(message.content || '')
    const attachments = Array.isArray(message.attachments) ? message.attachments : []
    const textBlocks = attachments
      .filter(item => item.kind === 'text' && item.text)
      .map(item => `\n\n--- Attachment: ${item.name} ---\n${item.text}`)
    const fileBlocks = attachments
      .filter(item => item.kind !== 'text' && item.kind !== 'image')
      .map(item => `\n\n[Attachment: ${item.name}; ${item.mime || 'file'}; path: ${item.path}]`)
    const imageAttachments = attachments.filter(item => item.kind === 'image' && item.dataUrl)
    const mergedText = `${text}${textBlocks.join('')}${fileBlocks.join('')}`.trim()

    let next
    if (imageAttachments.length > 0) {
      next = {
        role: message.role,
        content: [
          {
            type: 'text',
            text: mergedText || 'Please analyze these images.',
          },
          ...imageAttachments.map(item => ({
            type: 'image_url',
            image_url: { url: item.dataUrl },
          })),
        ],
      }
    } else {
      next = {
        role: message.role,
        content: mergedText,
      }
    }

    if (!Array.isArray(next.content) && !String(next.content || '').trim()) continue
    messages.push(next)
  }

  return messages
}

function buildChatRequestBody(config, messages, stream) {
  const body = {
    model: path.basename(config.model || 'local-model'),
    messages,
    temperature: toNumber(config.temp, 0.8),
    top_p: toNumber(config.top_p, 0.95),
    max_tokens: config.n_predict === -1 ? undefined : toNumber(config.n_predict, undefined),
    stream,
  }
  const templateKwargs = parseChatTemplateKwargs(config.chat_template_kwargs)
  if (templateKwargs) {
    body.chat_template_kwargs = templateKwargs
  }
  return body
}

function validation(config) {
  return {
    configExists: config.launch_mode !== 'launcher' || existsSync(config.config_path),
    launcherExists: config.launch_mode !== 'launcher' || existsSync(config.launcher_path),
    serverExists: existsSync(config.llama_server_path),
    modelExists: existsSync(config.model),
    mmprojExists: !config.mmproj || existsSync(config.mmproj),
  }
}

function mimeForFile(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  return {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.flac': 'audio/flac',
    '.m4a': 'audio/mp4',
    '.ogg': 'audio/ogg',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.json': 'application/json',
    '.toml': 'text/plain',
    '.yaml': 'text/yaml',
    '.yml': 'text/yaml',
    '.csv': 'text/csv',
    '.log': 'text/plain',
    '.py': 'text/x-python',
    '.js': 'text/javascript',
    '.ts': 'text/typescript',
    '.tsx': 'text/typescript',
    '.html': 'text/html',
    '.css': 'text/css',
  }[ext] || 'application/octet-stream'
}

function isTextLike(filePath) {
  return [
    '.txt',
    '.md',
    '.json',
    '.toml',
    '.yaml',
    '.yml',
    '.csv',
    '.log',
    '.py',
    '.js',
    '.ts',
    '.tsx',
    '.html',
    '.css',
    '.c',
    '.cpp',
    '.h',
    '.hpp',
  ].includes(path.extname(filePath).toLowerCase())
}

function isImageLike(filePath) {
  return ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'].includes(path.extname(filePath).toLowerCase())
}

function isAudioLike(filePath) {
  return ['.mp3', '.wav', '.flac', '.m4a', '.ogg'].includes(path.extname(filePath).toLowerCase())
}

function isPdfLike(filePath) {
  return path.extname(filePath).toLowerCase() === '.pdf'
}

async function buildAttachment(filePath) {
  const stat = await import('node:fs/promises').then(fs => fs.stat(filePath))
  const attachment = {
    path: filePath,
    name: path.basename(filePath),
    size: stat.size,
    mime: mimeForFile(filePath),
    kind: isImageLike(filePath) ? 'image' : isAudioLike(filePath) ? 'audio' : isPdfLike(filePath) ? 'pdf' : isTextLike(filePath) ? 'text' : 'file',
  }

  if (attachment.kind === 'image' && stat.size <= 10 * 1024 * 1024) {
    const raw = await readFile(filePath)
    attachment.dataUrl = `data:${attachment.mime};base64,${raw.toString('base64')}`
  }

  if (attachment.kind === 'text' && stat.size <= 256 * 1024) {
    attachment.text = await readFile(filePath, 'utf8')
  }

  return attachment
}

async function appState() {
  const config = await loadConfig()
  return {
    config,
    configWarnings: runtimeWarnings(config),
    ...serviceUrls(config),
    status: runtimeStatus,
    logs: logs.entries,
    logStats: logStats(),
    validation: validation(config),
    launch: buildLaunchDetails(config),
  }
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow()
    return
  }
  mainWindow.setSkipTaskbar(false)
  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }
  mainWindow.show()
  mainWindow.focus()
}

function statusLabel() {
  return {
    stopped: '未启动',
    starting: '启动中',
    running: '运行中',
    stopping: '停止中',
    error: '需要处理',
  }[runtimeStatus.state] || runtimeStatus.state
}

function updateTrayMenu() {
  if (!tray) {
    return
  }

  tray.setToolTip(`Llama.cpp Desktop - ${statusLabel()} - ${runtimeStatus.url}`)
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: '打开 Llama.cpp Desktop',
      click: showMainWindow,
    },
    {
      label: `${statusLabel()}  ${runtimeStatus.url}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: '打开 OpenAI Base URL',
      click: () => shell.openExternal(`${runtimeStatus.url}/v1`),
    },
    {
      label: '停止服务',
      enabled: Boolean(serverChild && serverChild.exitCode === null),
      click: async () => {
        if (serverChild && serverChild.exitCode === null) {
          stoppingServer = true
          setStatus({ state: 'stopping', message: '正在停止服务' })
          await taskkill(serverChild.pid)
        }
      },
    },
    { type: 'separator' },
    {
      label: '退出并停止服务',
      click: () => {
        appIsQuitting = true
        app.quit()
      },
    },
  ]))
}

function createTray() {
  if (tray) {
    return
  }

  const image = nativeImage.createFromPath(trayIconPath)
  tray = new Tray(image.isEmpty() ? nativeImage.createFromPath(iconPath) : image)
  tray.on('click', showMainWindow)
  tray.on('double-click', showMainWindow)
  updateTrayMenu()
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 1120,
    minHeight: 720,
    title: 'Llama.cpp Desktop',
    backgroundColor: '#F7F7F4',
    icon: iconPath,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#F4F3EC',
      symbolColor: '#2B2922',
      height: 36,
    },
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('close', event => {
    if (appIsQuitting) {
      return
    }

    event.preventDefault()
    mainWindow.hide()
    mainWindow.setSkipTaskbar(true)
    if (!firstHideNoticeShown) {
      firstHideNoticeShown = true
      tray?.displayBalloon?.({
        title: 'Llama.cpp Desktop 仍在运行',
        content: '窗口已隐藏到系统托盘，本地服务会继续监听。',
      })
    }
  })

  mainWindow.loadFile(rendererPath)
  Menu.setApplicationMenu(null)
}

async function taskkill(pid) {
  await new Promise(resolve => {
    const child = spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
      windowsHide: true,
      stdio: 'ignore',
    })
    child.once('exit', resolve)
    child.once('error', resolve)
  })
}

function registerIpc() {
  ipcMain.handle('llama:get-state', async () => appState())

  ipcMain.handle('llama:save-config', async (_event, payload) => {
    const config = await saveConfig(payload.config)
    addLog('desktop', `配置已保存：${config.config_path}`)
    return appState()
  })

  ipcMain.handle('llama:start-server', async (_event, payload) => {
    if (serverChild && serverChild.exitCode === null) {
      return appState()
    }

    const config = normalizeConfig(payload.config)
    assertStartableServerConfig(config, existsSync)
    await saveConfig(config)
    const directMode = config.launch_mode !== 'launcher'
    const launch = buildLaunchDetails(config)
    if (launch.error) {
      throw new Error(launch.error)
    }

    logs = { entries: [], filtered: 0, truncated: 0, dropped: 0 }
    stoppingServer = false
    setStatus({
      state: 'starting',
      message: '正在启动服务',
      pid: null,
      url: localUrl(config),
      startedAt: new Date().toISOString(),
    })
    const serverDir = path.dirname(config.llama_server_path)
    const command = launch.command
    const args = launch.args
    const cwd = launch.cwd
    addLog('desktop', `启动方式：${directMode ? 'direct llama-server.exe' : 'launcher'}`)
    addLog('desktop', `llama-server：${config.llama_server_path}`)
    if (directMode) {
      addLog('desktop', `参数：${args.join(' ')}`)
      addLog('desktop', `完整命令：${launch.preview}`)
      addLog('desktop', `关键参数：ctx=${config.ctx_size}, gpu_layers=${config.n_gpu_layers}, batch=${config.batch_size || 'auto'}, ubatch=${config.ubatch_size || 'auto'}, threads=${config.threads || 'auto'}`)
    }
    addLog('desktop', `启动器：${config.launcher_path}`)
    addLog('desktop', `配置：${config.config_path}`)

    serverChild = spawn(command, args, {
      cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NO_COLOR: '1',
        Path: `${serverDir};${process.env.Path || process.env.PATH || ''}`,
      },
    })

    setStatus({ pid: serverChild.pid })
    serverChild.stdout?.on('data', chunk => addLog('stdout', chunk))
    serverChild.stderr?.on('data', chunk => addLog('stderr', chunk))
    serverChild.once('error', error => {
      addLog('desktop', `启动失败：${error.message}`)
      setStatus({ state: 'error', message: error.message, pid: null })
    })
    serverChild.once('exit', code => {
      const message = stoppingServer ? '服务已停止' : `服务进程已退出：${code ?? 'unknown'}`
      addLog('desktop', message)
      serverChild = null
      setStatus({
        state: stoppingServer ? 'stopped' : 'error',
        message,
        pid: null,
      })
      stoppingServer = false
    })

    return appState()
  })

  ipcMain.handle('llama:stop-server', async () => {
    if (serverChild && serverChild.exitCode === null) {
      stoppingServer = true
      setStatus({ state: 'stopping', message: '正在停止服务' })
      await taskkill(serverChild.pid)
    }
    return appState()
  })

  ipcMain.handle('llama:test-health', async (_event, payload) => {
    const config = normalizeConfig(payload.config)
    const url = localUrl(config)
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3500) })
      return { ok: response.ok, status: response.status, url }
    } catch (error) {
      return { ok: false, status: 0, url, message: error instanceof Error ? error.message : String(error) }
    }
  })

  ipcMain.handle('llama:get-model-info', async (_event, payload) => {
    const config = normalizeConfig(payload?.config || {})
    const serverUrl = localUrl(config)
    const modelPath = config.model || ''
    const fileName = path.basename(modelPath || 'local-model')
    let fileSize = 0
    if (modelPath && existsSync(modelPath)) {
      try {
        fileSize = (await stat(modelPath)).size
      } catch {
        fileSize = 0
      }
    }

    const [modelsPayload, propsPayload] = await Promise.all([
      fetchJson(`${serverUrl}/v1/models`),
      fetchJson(`${serverUrl}/props`),
    ])

    const apiModel = modelsPayload?.data?.[0] || {}
    const apiMeta = apiModel?.meta || {}
    const listedModel = modelsPayload?.models?.[0] || {}

    return {
      name: listedModel?.name || apiModel?.id || propsPayload?.model_alias || fileName,
      filePath: propsPayload?.model_path || modelPath,
      fileSize: Number(apiMeta?.size || fileSize || 0),
      family: listedModel?.details?.family || parseFamily(fileName),
      quantization: listedModel?.details?.quantization_level || parseQuantization(fileName),
      parameterScale: listedModel?.details?.parameter_size || parseParameterScale(fileName),
      nParams: Number(apiMeta?.n_params || 0),
      ctxSize: toNumber(propsPayload?.default_generation_settings?.n_ctx, toNumber(config.ctx_size, '')),
      trainingContext: toNumber(apiMeta?.n_ctx_train, ''),
      embeddingSize: toNumber(apiMeta?.n_embd, ''),
      vocabSize: toNumber(apiMeta?.n_vocab, ''),
      vocabType: toNumber(apiMeta?.vocab_type, ''),
      parallelSlots: toNumber(propsPayload?.total_slots, ''),
      nPredict: toNumber(config.n_predict, ''),
      gpuLayers: toNumber(config.n_gpu_layers, ''),
      temperature: toNumber(config.temp, ''),
      topP: toNumber(config.top_p, ''),
      topK: toNumber(config.top_k, ''),
      minP: toNumber(config.min_p, ''),
      presencePenalty: toNumber(config.presence_penalty, ''),
      repeatPenalty: toNumber(config.repeat_penalty, ''),
      serverUrl,
      build: propsPayload?.build_info || path.basename(config.llama_server_path || 'llama-server.exe'),
      chatTemplateText: String(propsPayload?.chat_template || config.chat_template_kwargs || '').trim(),
      propsSource: Boolean(propsPayload),
      modelSource: Boolean(modelsPayload),
      parameterLabel: humanParams(apiMeta?.n_params),
    }
  })

  ipcMain.handle('llama:chat-completion', async (_event, payload) => {
    const config = normalizeConfig(payload.config)
    const requestId = String(payload.requestId || `chat-${Date.now()}`)
    const url = serviceUrls(config).chatCompletionsUrl
    const messages = buildRequestMessages(prepareChatMessages(payload.messages))

    if (messages.length === 0) {
      throw new Error('没有可发送的消息')
    }

    const signal = requestRegistry.start(requestId, Math.max(30000, toNumber(config.request_timeout_ms, 600000)))
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildChatRequestBody(config, messages, false)),
        signal,
      })

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(`模型接口返回 ${response.status}${text ? `：${text.slice(0, 500)}` : ''}`)
      }

      const data = await response.json()
      const { content, thinking } = extractStreamDelta(data)
      return { ok: true, content, thinking, raw: data }
    } finally {
      requestRegistry.finish(requestId, signal)
    }
  })

  ipcMain.handle('llama:chat-stream', async (_event, payload) => {
    const config = normalizeConfig(payload.config)
    const requestId = String(payload.requestId || `chat-${Date.now()}`)
    const url = serviceUrls(config).chatCompletionsUrl
    const startedAt = Date.now()
    const messages = buildRequestMessages(prepareChatMessages(payload.messages))

    if (messages.length === 0) {
      throw new Error('没有可发送的消息')
    }

    addLog('chat', `request ${requestId}: ${messages.length} messages -> ${url}`)

    const signal = requestRegistry.start(requestId, Math.max(30000, toNumber(config.request_timeout_ms, 600000)))
    try {
      let response
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildChatRequestBody(config, messages, true)),
          signal,
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        addLog('chat', `request failed: ${message}`)
        throw error
      }

    if (!response.ok) {
      const text = await response.text().catch(() => '')
      const message = `模型接口返回 ${response.status}${text ? `：${text.slice(0, 500)}` : ''}`
      addLog('chat', `request failed: ${message}`)
      throw new Error(message)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      addLog('chat', 'request failed: response body is not a readable stream')
      throw new Error('模型接口没有返回可读取的流')
    }

    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    let content = ''
    let thinking = ''
    let raw = null
    let streamAnnounced = false

    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split(/\r?\n\r?\n/)
      buffer = parts.pop() || ''

      for (const part of parts) {
        const lines = part
          .split(/\r?\n/)
          .map(line => line.trim())
          .filter(line => line.startsWith('data:'))
          .map(line => line.slice(5).trim())

        for (const line of lines) {
          if (!line || line === '[DONE]') continue
          try {
            const data = JSON.parse(line)
            raw = data
            const delta = extractStreamDelta(data)
            if (delta.content || delta.thinking) {
              if (!streamAnnounced) {
                addLog('chat', `streaming response for ${requestId}`)
                streamAnnounced = true
              }
              content += delta.content
              thinking += delta.thinking
              sendEvent({ type: 'chat-stream', requestId, delta: delta.content, thinkingDelta: delta.thinking })
            }
          } catch {
            // Ignore malformed stream fragments; llama.cpp can occasionally split aggressively.
          }
        }
      }
    }

    const elapsed = Math.max(0.1, (Date.now() - startedAt) / 1000)
    const approxTokens = Math.max(1, Math.round(String(content || '').length / 3))
    addLog('chat', `stream done: ${approxTokens} approx tokens, ${elapsed.toFixed(1)}s`)
    sendEvent({ type: 'chat-stream', requestId, done: true, content, thinking })
      return { ok: true, content, thinking, raw }
    } finally {
      requestRegistry.finish(requestId, signal)
    }
  })

  ipcMain.handle('llama:cancel-chat', async (_event, payload) => ({
    ok: requestRegistry.cancel(String(payload?.requestId || '')),
  }))

  ipcMain.handle('llama:pick-file', async (_event, payload) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: payload?.properties || ['openFile'],
      filters: payload?.filters || [{ name: 'All Files', extensions: ['*'] }],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  ipcMain.handle('llama:pick-attachments', async (_event, payload) => {
    const kind = payload?.kind || 'file'
    const filterMap = {
      image: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      audio: [
        { name: 'Audio', extensions: ['mp3', 'wav', 'flac', 'm4a', 'ogg'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      text: [
        { name: 'Text and Code', extensions: ['txt', 'md', 'json', 'toml', 'yaml', 'yml', 'csv', 'log', 'py', 'js', 'ts', 'tsx', 'html', 'css', 'c', 'cpp', 'h', 'hpp'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      pdf: [
        { name: 'PDF', extensions: ['pdf'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      file: [
        { name: 'Documents and Images', extensions: ['txt', 'md', 'json', 'toml', 'yaml', 'yml', 'csv', 'log', 'py', 'js', 'ts', 'tsx', 'html', 'css', 'pdf', 'mp3', 'wav', 'flac', 'm4a', 'ogg', 'png', 'jpg', 'jpeg', 'webp'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    }
    const filters = filterMap[kind] || filterMap.file

    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters,
    })

    if (result.canceled) {
      return []
    }

    const attachments = []
    for (const filePath of result.filePaths) {
      try {
        attachments.push(await buildAttachment(filePath))
      } catch (error) {
        attachments.push({
          path: filePath,
          name: path.basename(filePath),
          size: 0,
          mime: mimeForFile(filePath),
          kind: 'file',
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
    return attachments
  })

  ipcMain.handle('llama:reveal-path', async (_event, payload) => {
    if (payload?.filePath) {
      shell.showItemInFolder(payload.filePath)
    }
    return { ok: true }
  })

  ipcMain.handle('llama:open-url', async (_event, payload) => {
    if (payload?.url) {
      await shell.openExternal(payload.url)
    }
    return { ok: true }
  })
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.whenReady().then(() => {
    registerIpc()
    createTray()
    createMainWindow()
  })

  app.on('second-instance', () => {
    if (mainWindow) {
      showMainWindow()
    }
  })

  app.on('before-quit', async event => {
    appIsQuitting = true
    if (serverChild && serverChild.exitCode === null && !stoppingServer) {
      event.preventDefault()
      stoppingServer = true
      await taskkill(serverChild.pid)
      app.quit()
    }
  })

  app.on('window-all-closed', () => {
    // Keep the local server alive in the system tray.
  })
}
