function stripWrappingQuotes(value) {
  const text = String(value || '').trim()
  if (text.length < 2) return text
  const first = text[0]
  const last = text[text.length - 1]
  return (first === '"' && last === '"') || (first === "'" && last === "'")
    ? text.slice(1, -1).trim()
    : text
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
