import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ATTACHMENT_MENU_ITEMS,
  attachmentMenuPosition,
  attachmentNotice,
  renderAttachmentMenu,
  renderAttachmentNotice,
} from '../renderer/lib/attachment-policy.js'

test('menu exposes the six specified entries in order', () => {
  assert.deepEqual(ATTACHMENT_MENU_ITEMS.map(item => item.id), ['image', 'audio', 'text', 'pdf', 'system', 'mcp'])
})

test('MCP is disabled with a visible reason', () => {
  const mcp = ATTACHMENT_MENU_ITEMS.find(item => item.id === 'mcp')
  assert.equal(mcp.enabled, false)
  assert.match(mcp.reason, /暂未实现/)
})

test('audio and file errors produce visible notices', () => {
  assert.match(attachmentNotice({ kind: 'audio' }), /模型能力/)
  assert.equal(attachmentNotice({ error: '读取失败' }), '读取失败')
})

test('rendered menu preserves policy order and gives disabled MCP no action', () => {
  const markup = renderAttachmentMenu(ATTACHMENT_MENU_ITEMS)
  const positions = ATTACHMENT_MENU_ITEMS.map(item => markup.indexOf(`menu-icon ${item.id}`))

  assert.ok(positions.every(position => position >= 0))
  assert.deepEqual(positions, [...positions].sort((left, right) => left - right))
  assert.match(markup, /暂未实现 MCP 附件。/)
  assert.doesNotMatch(markup, /data-action="pick-mcp"/)
})

test('rendered notices carry warning and error markup', () => {
  assert.match(renderAttachmentNotice({ kind: 'audio' }), /attachment-notice warning/)
  assert.match(renderAttachmentNotice({ kind: 'audio' }), /模型能力/)
  assert.equal(renderAttachmentNotice({ error: '读取失败' }), '<span class="attachment-notice error">读取失败</span>')
})

test('attachment menu stays within a narrow viewport using its effective width', () => {
  const position = attachmentMenuPosition({
    triggerRect: { left: 160, top: 20, bottom: 50 },
    viewportWidth: 180,
    viewportHeight: 600,
  })

  assert.deepEqual(position, { left: 8, top: 58, menuWidth: 164 })
})
