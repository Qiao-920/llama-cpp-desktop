export const DEFAULT_HOST = '127.0.0.1'
const CORE_ARGS = new Set(['--host', '--port', '--model', '--mmproj', '--ctx-size', '--n-gpu-layers', '--threads', '--batch-size', '--ubatch-size', '--chat-template-kwargs'])

export function runtimeWarnings(config = {}) {
  const warnings = []
  if (['0.0.0.0', '::'].includes(String(config.host || '').trim())) warnings.push({ id: 'public-host', level: 'warning', message: '当前监听地址可能允许局域网设备访问。' })
  if (Number(config.ctx_size) > 65536) warnings.push({ id: 'high-context', level: 'warning', message: '上下文超过 65536，可能显著增加内存占用。' })
  if (Number(config.request_timeout_ms) < 30000) warnings.push({ id: 'short-timeout', level: 'warning', message: '请求超时低于 30000 ms，长回答可能被提前中断。' })
  return warnings
}

export function assertNoCoreArgConflicts(extraArgs = '') {
  const conflicts = [...String(extraArgs).matchAll(/(?:^|\s)(--[\w-]+)(?:=|\s|$)/g)].map(match => match[1]).filter(name => CORE_ARGS.has(name))
  const unique = [...new Set(conflicts)]
  if (unique.length) throw new Error(`额外参数不能覆盖界面配置：${unique.join(', ')}`)
}

export function serviceUrls(config = {}) {
  const host = String(config.host || DEFAULT_HOST).trim()
  const port = Number(config.port) || 8080
  const localHost = ['0.0.0.0', '::'].includes(host) ? '127.0.0.1' : host
  return {
    listenBaseUrl: `http://${host}:${port}`,
    localBaseUrl: `http://${localHost}:${port}`,
    chatCompletionsUrl: `http://${localHost}:${port}/v1/chat/completions`
  }
}
