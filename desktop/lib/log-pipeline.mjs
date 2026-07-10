const ANSI_ESCAPE = /\x1B\[[0-?]*[ -/]*[@-~]/g
const ANSI_COLOR = /\[[0-9;]*m/g
const ROUTINE_PATTERNS = [
  'que start_loop: waiting for new tasks',
  'que start_loop: processing new tasks',
  'srv update_slots: all slots are idle',
  'srv update_slots: run slots completed',
  'srv update_slots: update slots',
]

function cleanLogText(chunk) {
  const text = typeof chunk === 'string' ? chunk : chunk?.toString?.('utf8') || String(chunk || '')
  return text.replace(ANSI_ESCAPE, '').replace(ANSI_COLOR, '').replace(/\r\n?/g, '\n')
}

function isErrorLine(line) {
  return /\b(error|failed?|exception|fatal|crash|exit)\b/i.test(line)
}

function isCodeEcho(line) {
  return /^\s*(?:<!doctype html|<\/?[a-z][^>]*>|(?:body|html|[.#][\w-]+)\s*\{|(?:const|let|var|function|class|import|export)\b)/i.test(line)
}

function shouldFilterLine(line) {
  const lower = line.toLowerCase()
  if (isErrorLine(line)) return false
  if (ROUTINE_PATTERNS.some(pattern => lower.includes(pattern))) return true
  if (lower.includes('http: streamed chunk: data:')) return true
  if (
    lower.startsWith('parsed message:') ||
    lower.startsWith('parsed chat message:') ||
    lower.startsWith('response:') ||
    lower.startsWith('assistant:') ||
    lower.startsWith('prompt:') ||
    line.includes('"prompt":') ||
    line.includes('<|im_start|>') ||
    isCodeEcho(line)
  ) {
    return true
  }
  return false
}

export function isImportantRuntimeLine(line) {
  const text = String(line || '').trim()
  if (!text) return false
  if (isErrorLine(text)) return true
  return /^(?:llama_|load_|clip_|common_|sched_|ggml|cuda|cublas|main:|server|srv\b|srv_|slot|system_info|webui|warn|warning)/i.test(text) ||
    /\b(?:cpu|cuda\d*|metal)\b/i.test(text) ||
    /\b(?:server is listening|server listening|listening on|model loaded|request (?:started|completed)|tokens per second)\b/i.test(text)
}

export function processLogChunk(source, chunk) {
  const entries = []
  let filtered = 0
  let truncated = 0

  for (const rawLine of cleanLogText(chunk).split('\n')) {
    const text = rawLine.trim()
    if (!text) continue
    if (shouldFilterLine(text)) {
      filtered += 1
      continue
    }

    const line = text.length > 420
      ? `${text.slice(0, 260)} ... [truncated ${text.length - 260} chars]`
      : text
    if (line !== text) truncated += 1
    entries.push({ source, line })
  }

  return { entries, filtered, truncated }
}

export function appendVisibleLogs(state, entries, limit) {
  const currentEntries = Array.isArray(state?.entries) ? state.entries : []
  const nextEntries = Array.isArray(entries) ? entries : []
  const maximum = Math.max(0, Number.isFinite(limit) ? Math.floor(limit) : 0)
  const combined = [...currentEntries, ...nextEntries]
  const overflow = Math.max(0, combined.length - maximum)

  return {
    entries: overflow ? (maximum ? combined.slice(-maximum) : []) : combined,
    filtered: Number(state?.filtered || 0),
    truncated: Number(state?.truncated || 0),
    dropped: Number(state?.dropped || 0) + overflow,
  }
}
