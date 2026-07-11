export const DEFAULT_HOST = '127.0.0.1'
const CORE_ARGS = new Set(['--host', '--port', '--model', '--mmproj', '--ctx-size', '--n-gpu-layers', '--threads', '--batch-size', '--ubatch-size', '--chat-template-kwargs'])
const CORE_ARG_ALIASES = new Map([
  ['-c', '--ctx-size'],
  ['-m', '--model'],
  ['-t', '--threads'],
  ['-b', '--batch-size'],
  ['-ub', '--ubatch-size'],
  ['-ngl', '--n-gpu-layers'],
  ['--gpu-layers', '--n-gpu-layers'],
])

export function runtimeWarnings(config = {}) {
  const warnings = []
  if (['0.0.0.0', '::'].includes(String(config.host || '').trim())) warnings.push({ id: 'public-host', level: 'warning', message: '当前监听地址可能允许局域网设备访问。' })
  if (Number(config.ctx_size) > 65536) warnings.push({ id: 'high-context', level: 'warning', message: '上下文超过 65536，可能显著增加内存占用。' })
  if (Number(config.request_timeout_ms) < 30000) warnings.push({ id: 'short-timeout', level: 'warning', message: '请求超时低于 30000 ms，长回答可能被提前中断。' })
  return warnings
}

export function assertNoCoreArgConflicts(extraArgs = '') {
  const conflicts = splitExtraArgs(extraArgs)
    .map(arg => arg.match(/^(-{1,2}[\w-]+)(?:=.*)?$/)?.[1])
    .map(name => CORE_ARG_ALIASES.get(name) || name)
    .filter(name => CORE_ARGS.has(name))
  const unique = [...new Set(conflicts)]
  if (unique.length) throw new Error(`额外参数不能覆盖界面配置：${unique.join(', ')}`)
}

export function splitExtraArgs(raw) {
  const text = String(raw || '').replace(/\r?\n/g, ' ').trim()
  if (!text) return []

  const args = []
  let current = ''
  let quote = ''
  for (const char of text) {
    if (quote) {
      if (char === quote) quote = ''
      else current += char
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (/\s/.test(char)) {
      if (current) {
        args.push(current)
        current = ''
      }
      continue
    }
    current += char
  }
  if (quote) throw new Error('自定义附加参数里有未闭合的引号')
  if (current) args.push(current)
  return args
}

export function assertStartableServerConfig(config = {}, pathExists = () => true) {
  assertNoCoreArgConflicts(config.extra_args)
  if (config.launch_mode === 'launcher' && !pathExists(config.launcher_path)) {
    throw new Error(`找不到启动器：${config.launcher_path}`)
  }
  if (!pathExists(config.llama_server_path)) {
    throw new Error(`找不到 llama-server.exe：${config.llama_server_path}`)
  }
  if (!pathExists(config.model)) {
    throw new Error(`找不到模型文件：${config.model}`)
  }
}

function formatUrlHost(host) {
  return host.includes(':') && !(host.startsWith('[') && host.endsWith(']')) ? `[${host}]` : host
}

export function serviceUrls(config = {}) {
  const host = String(config.host || DEFAULT_HOST).trim()
  const port = Number(config.port) || 8080
  const localHost = ['0.0.0.0', '::'].includes(host) ? '127.0.0.1' : host
  const listenUrlHost = formatUrlHost(host)
  const localUrlHost = formatUrlHost(localHost)
  return {
    listenBaseUrl: `http://${listenUrlHost}:${port}`,
    localBaseUrl: `http://${localUrlHost}:${port}`,
    chatCompletionsUrl: `http://${localUrlHost}:${port}/v1/chat/completions`
  }
}
