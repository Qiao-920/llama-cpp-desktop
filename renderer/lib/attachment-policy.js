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
