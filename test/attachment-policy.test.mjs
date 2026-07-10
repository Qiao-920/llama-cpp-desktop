import test from 'node:test'
import assert from 'node:assert/strict'
import { ATTACHMENT_MENU_ITEMS, attachmentNotice } from '../renderer/lib/attachment-policy.js'

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
