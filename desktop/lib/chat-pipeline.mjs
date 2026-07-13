function stripWrappingQuotes(value) {
  const text = String(value || '').trim()
  if (text.length < 2) return text
  const first = text[0]
  const last = text[text.length - 1]
  return (first === '"' && last === '"') || (first === "'" && last === "'")
    ? text.slice(1, -1).trim()
    : text
}

function hasRequestValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== ''
}

function toRequestNumber(value, fallback = undefined) {
  if (!hasRequestValue(value)) return fallback
  const next = Number(value)
  return Number.isFinite(next) ? next : fallback
}

function basename(value) {
  return String(value || '').split(/[\\/]/).pop() || 'local-model'
}

const DEFAULT_MAX_TOKENS = 4096
const SIMPLE_PROMPT_MAX_TOKENS = 512

export function chatQualityDefaults(mode = 'quality') {
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
      timings_per_token: true,
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
    timings_per_token: true,
  }
}

function contentText(content) {
  if (Array.isArray(content)) {
    return content
      .map(part => {
        if (typeof part === 'string') return part
        if (part && typeof part === 'object') return part.text || part.content || ''
        return ''
      })
      .join(' ')
  }
  return String(content || '')
}

function latestUserText(messages = []) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const item = messages[index]
    if (item?.role === 'user') return contentText(item.content).trim()
  }
  return ''
}

function isSimplePrompt(text) {
  const compact = String(text || '').replace(/\s+/g, '')
  if (!compact) return false
  const complexSignals = /(?:代码|网页|程序|分析|总结|解释|方案|计划|推理|证明|比较|写一|生成|实现|debug|html|css|javascript|python|api|reason|analy[sz]e|explain|compare|implement|write|create|generate|plan)/i
  if (complexSignals.test(text)) return false
  return compact.length <= 24
}

export function normalizeChatTemplateKwargs(raw) {
  let text = stripWrappingQuotes(raw)
  if (!text) return null
  text = stripWrappingQuotes(text.replace(/^--chat-template-kwargs\s+/i, '').trim())
  if (text.includes('\\"')) text = text.replace(/\\"/g, '"')

  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new Error(`Chat Template Kwargs must be valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Chat Template Kwargs must be a JSON object, for example {"enable_thinking": false}')
  }
  return parsed
}

export function buildChatRequestBody(config = {}, messages = [], stream = false) {
  const latestPrompt = latestUserText(messages)
  const simplePrompt = isSimplePrompt(latestPrompt)
  const body = {
    model: basename(config.model),
    messages,
    temperature: toRequestNumber(config.temp, 1),
    top_k: toRequestNumber(config.top_k, 20),
    top_p: toRequestNumber(config.top_p, 0.95),
    min_p: toRequestNumber(config.min_p, 0.05),
    presence_penalty: toRequestNumber(config.presence_penalty, 0),
    stream,
    timings_per_token: true,
  }

  const repeatPenalty = toRequestNumber(config.repeat_penalty, undefined)
  if (repeatPenalty !== undefined) body.repeat_penalty = repeatPenalty
  const maxTokens = config.n_predict === -1
    ? (simplePrompt ? SIMPLE_PROMPT_MAX_TOKENS : DEFAULT_MAX_TOKENS)
    : toRequestNumber(config.n_predict, undefined)
  if (maxTokens !== undefined) body.max_tokens = maxTokens

  const templateKwargs = normalizeChatTemplateKwargs(config.chat_template_kwargs)
  if (templateKwargs) {
    body.chat_template_kwargs = templateKwargs
  } else if (config.chat_quality_mode !== 'fast' && simplePrompt) {
    body.chat_template_kwargs = { enable_thinking: false }
  }
  return body
}

export function buildRequestMessages(input = []) {
  const systems = []
  const messages = []
  for (const item of input) {
    if (!item || item.localOnly || !['system', 'user', 'assistant'].includes(item.role)) continue
    if (item.role === 'system') {
      systems.push(String(item.content || '').trim())
    } else if (Array.isArray(item.content) || String(item.content || '').trim()) {
      messages.push({ role: item.role, content: item.content })
    }
  }
  const systemText = systems.filter(Boolean).join('\n\n')
  return systemText ? [{ role: 'system', content: systemText }, ...messages] : messages
}

export function extractStreamDelta(payload = {}) {
  const value = payload.choices?.[0]?.delta || payload.choices?.[0]?.message || payload
  return {
    content: String(value.content || ''),
    thinking: String(value.reasoning_content || value.thinking || value.reasoning || ''),
  }
}

export function createRequestRegistry() {
  const active = new Map()
  const finish = (id, signal) => {
    const current = active.get(id)
    if (!current || (signal && current.controller.signal !== signal)) return false
    clearTimeout(current.timer)
    active.delete(id)
    return true
  }

  return {
    start(id, timeoutMs) {
      const previous = active.get(id)
      if (previous) {
        previous.controller.abort(new DOMException('Request replaced', 'AbortError'))
        finish(id)
      }

      const controller = new AbortController()
      const duration = Math.max(0, Number(timeoutMs) || 600000)
      const entry = { controller, timer: null }
      entry.timer = setTimeout(() => {
        if (active.get(id) !== entry) return
        controller.abort(new DOMException('Request timed out', 'TimeoutError'))
        finish(id, controller.signal)
      }, duration)
      active.set(id, entry)
      return controller.signal
    },
    cancel(id) {
      const current = active.get(id)
      if (!current) return false
      current.controller.abort(new DOMException('Request cancelled', 'AbortError'))
      finish(id)
      return true
    },
    finish,
  }
}
