export const ATTACHMENT_MENU_ITEMS = [
  { id: 'image', label: '图片', enabled: true, reason: '' },
  { id: 'audio', label: '音频文件', enabled: true, reason: '' },
  { id: 'text', label: '文本文件', enabled: true, reason: '' },
  { id: 'pdf', label: 'PDF 文件', enabled: true, reason: '' },
  { id: 'system', label: '系统消息', enabled: true, reason: '' },
  { id: 'mcp', label: 'MCP', enabled: false, reason: '暂未实现 MCP 附件。' },
]

export function attachmentNotice(item = {}) {
  const error = String(item.error || '').trim()
  if (error) return error

  const warning = String(item.warning || '').trim()
  if (warning) return warning

  if (item.kind === 'audio') {
    return '音频会作为附件发送，是否能理解取决于模型能力。'
  }

  return ''
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function renderAttachmentNotice(item = {}, escape = escapeHtml) {
  const notice = attachmentNotice(item)
  if (!notice) return ''

  const noticeClass = item?.error ? 'error' : 'warning'
  return `<span class="attachment-notice ${noticeClass}">${escape(notice)}</span>`
}

export function renderAttachmentMenu(items = ATTACHMENT_MENU_ITEMS, escape = escapeHtml) {
  return items.map(item => {
    const action = item.id === 'system' ? 'insert-system-message' : `pick-${item.id}`
    const disabled = item.enabled ? '' : 'disabled'
    const actionAttribute = item.enabled ? `data-action="${action}"` : ''
    const reason = item.reason ? `<span class="menu-reason">${escape(item.reason)}</span>` : ''
    return `
      <button type="button" ${actionAttribute} ${disabled}>
        <span class="menu-icon ${escape(item.id)}"></span>
        <span class="menu-copy"><span>${escape(item.label)}</span>${reason}</span>
      </button>
    `
  }).join('')
}

export function attachmentMenuPosition({
  triggerRect = {},
  viewportWidth,
  viewportHeight,
  menuWidth = 206,
  menuHeight = 304,
  gap = 8,
  inset = 8,
} = {}) {
  const width = Math.max(0, Number(viewportWidth) || 0)
  const height = Math.max(0, Number(viewportHeight) || 0)
  const horizontalInset = Math.min(inset, width / 2)
  const verticalInset = Math.min(inset, height / 2)
  const effectiveMenuWidth = Math.min(menuWidth, Math.max(0, width - horizontalInset * 2))
  const effectiveMenuHeight = Math.min(menuHeight, Math.max(0, height - verticalInset * 2))
  const maxLeft = Math.max(horizontalInset, width - effectiveMenuWidth - horizontalInset)
  const maxTop = Math.max(verticalInset, height - effectiveMenuHeight - verticalInset)
  const clamp = (value, min, max) => Math.min(Math.max(Number(value) || 0, min), max)
  const below = (Number(triggerRect.bottom) || 0) + gap
  const above = (Number(triggerRect.top) || 0) - effectiveMenuHeight - gap
  const preferredTop = below + effectiveMenuHeight <= height - verticalInset || above < verticalInset
    ? below
    : above

  return {
    left: Math.round(clamp(triggerRect.left, horizontalInset, maxLeft)),
    top: Math.round(clamp(preferredTop, verticalInset, maxTop)),
    menuWidth: effectiveMenuWidth,
  }
}
