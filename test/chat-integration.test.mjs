import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const mainSource = readFileSync(new URL('../desktop/main.mjs', import.meta.url), 'utf8')
const preloadSource = readFileSync(new URL('../desktop/preload.cjs', import.meta.url), 'utf8')
const rendererSource = readFileSync(new URL('../renderer/app.js', import.meta.url), 'utf8')
const stylesSource = readFileSync(new URL('../renderer/styles.css', import.meta.url), 'utf8')

test('both chat IPC handlers use the shared request message pipeline', () => {
  const completion = mainSource.match(/ipcMain\.handle\('llama:chat-completion'[\s\S]*?\n  \}\)/)?.[0] || ''
  const stream = mainSource.match(/ipcMain\.handle\('llama:chat-stream'[\s\S]*?\n  \}\)/)?.[0] || ''
  assert.match(completion, /buildRequestMessages\(/)
  assert.match(stream, /buildRequestMessages\(/)
})

test('main and preload expose request-scoped chat cancellation', () => {
  assert.match(mainSource, /ipcMain\.handle\('llama:cancel-chat'/)
  assert.match(mainSource, /requestRegistry\.cancel\(/)
  assert.match(preloadSource, /cancelChat:\s*requestId\s*=>\s*ipcRenderer\.invoke\('llama:cancel-chat'/)
})

test('streaming forwards structured thinking separately from content', () => {
  assert.match(mainSource, /extractStreamDelta\(/)
  assert.match(mainSource, /thinkingDelta/)
  assert.match(rendererSource, /payload\.thinkingDelta/)
})

test('renderer keeps failed output local and offers a stop action while busy', () => {
  assert.match(rendererSource, /assistant\.localOnly\s*=\s*true/)
  assert.match(rendererSource, /assistant\.requestId\s*=\s*requestId/)
  assert.match(rendererSource, /data-action="cancel-chat"/)
  assert.match(rendererSource, /window\.llamaDesktop\.cancelChat\(requestId\)/)
})

test('streaming UI batches DOM updates instead of rendering every chunk', () => {
  assert.match(rendererSource, /STREAM_RENDER_INTERVAL_MS/)
  assert.match(rendererSource, /scheduleStreamRender\(/)
  assert.match(rendererSource, /flushStreamRender\(/)
  assert.doesNotMatch(rendererSource, /payload\.delta[\s\S]{0,160}updateMessageDom\(lastIndex\)/)
  assert.doesNotMatch(rendererSource, /payload\.thinkingDelta[\s\S]{0,160}updateMessageDom\(lastIndex\)/)
})

test('default launch profile avoids verbose server logging for performance', () => {
  const defaults = mainSource.match(/function defaultConfig\(\) \{[\s\S]*?\n  \}/)?.[0] || ''
  assert.match(defaults, /verbose:\s*false/)
  assert.match(defaults, /log_verbosity:\s*''/)
  assert.doesNotMatch(defaults, /verbose:\s*true/)
  assert.doesNotMatch(defaults, /log_verbosity:\s*3/)
})

test('main process reads PowerShell-written UTF-8 BOM desktop state files', () => {
  assert.match(mainSource, /replace\(\s*\/\^\\uFEFF\/,\s*''\s*\)/)
})

test('health checks do not send empty chat-completion messages', () => {
  const health = mainSource.match(/ipcMain\.handle\('llama:test-health'[\s\S]*?ipcMain\.handle\('llama:get-system-info'/)?.[0] || ''
  assert.match(health, /method:\s*'OPTIONS'/)
  assert.doesNotMatch(health, /messages:\s*\[\s*\]/)
  assert.doesNotMatch(health, /method:\s*'POST'[\s\S]{0,240}chatCompletionsUrl/)
})

test('settings expose an explicit chat quality mode instead of hiding thinking controls', () => {
  assert.match(rendererSource, /selectField\('chat_quality_mode'/)
  assert.match(rendererSource, /质量模式/)
  assert.match(rendererSource, /极速模式/)
})

test('html preview blocks incomplete canvas snippets before opening a blank iframe', () => {
  assert.match(rendererSource, /validateCodePreview\(/)
  assert.match(rendererSource, /requestAnimationFrame/)
  assert.match(rendererSource, /预览代码不完整/)
  assert.match(rendererSource, /state\.previewError/)
})
test('thinking is visible in quality mode but not forced open while streaming', () => {
  const defaults = mainSource.match(/function defaultConfig\(\) \{[\s\S]*?\n  \}/)?.[0] || ''
  assert.match(defaults, /expand_thinking:\s*quality\.expand_thinking/)
  assert.match(rendererSource, /const expandThinking\s*=\s*Boolean\(state\.config\?\.expand_thinking\)/)
  assert.doesNotMatch(rendererSource, /expandThinking\s*=\s*Boolean\(state\.config\?\.expand_thinking\)\s*\|\|\s*Boolean\(message\.streaming\)/)
})

test('settings section navigation uses stable data-section targets', () => {
  assert.match(rendererSource, /closest\('\[data-section\], button/)
  assert.match(rendererSource, /target\.closest\('\[data-section\]'\)/)
  assert.match(rendererSource, /data-section="\$\{id\}"/)
})

test('manual thinking expansion survives stream re-rendering', () => {
  assert.match(rendererSource, /openThinkingMessages:\s*new Set\(\)/)
  assert.match(rendererSource, /thinkingMessageKey\(/)
  assert.match(rendererSource, /data-action="toggle-thinking"/)
  assert.match(rendererSource, /state\.openThinkingMessages\.has\(thinkingKey\)/)
  assert.doesNotMatch(rendererSource, /<details class="think-block" \$\{expandThinking \? 'open' : ''\}>/)
})

test('opening settings clears first-run overlays so rescue remains clickable', () => {
  assert.match(rendererSource, /function openSettingsSection\(/)
  assert.match(rendererSource, /state\.firstRunWizardOpen\s*=\s*false/)
  assert.match(rendererSource, /data-action="close-first-run-wizard"/)
})

test('sidebar toggle is merged into the llama app mark', () => {
  assert.match(rendererSource, /class="app-mark sidebar-brand-toggle"/)
  assert.match(rendererSource, /data-action="toggle-sidebar"/)
  assert.doesNotMatch(rendererSource, /class="sidebar-toggle"/)
  assert.match(stylesSource, /\.app-shell\.sidebar-collapsed\s*\{[\s\S]*grid-template-columns:\s*68px minmax\(0, 1fr\)/)
})

test('settings expose appearance preferences for theme and chat font', () => {
  assert.match(mainSource, /theme_mode:\s*'system'/)
  assert.match(mainSource, /chat_font:\s*'default'/)
  assert.match(rendererSource, /\['appearance',[\s\S]*'外观'/)
  assert.match(rendererSource, /selectField\('theme_mode'/)
  assert.match(rendererSource, /selectField\('chat_font'/)
  assert.match(rendererSource, /applyAppearancePreferences\(/)
  assert.match(stylesSource, /body\.theme-dark/)
  assert.match(stylesSource, /body\.font-readable/)
})

test('chat composer accepts dropped files through the shared attachment pipeline', () => {
  assert.match(preloadSource, /importAttachments:\s*payload\s*=>\s*ipcRenderer\.invoke\('llama:import-attachments'/)
  assert.match(mainSource, /ipcMain\.handle\('llama:import-attachments'/)
  assert.match(mainSource, /buildAttachmentsFromPaths\(/)
  assert.match(rendererSource, /data-drop-zone="chat"/)
  assert.match(rendererSource, /appEl\.addEventListener\('dragover'/)
  assert.match(rendererSource, /appEl\.addEventListener\('drop'/)
  assert.match(rendererSource, /window\.llamaDesktop\.importAttachments/)
})

test('dropped files without exposed paths are converted to in-memory attachments', () => {
  assert.match(rendererSource, /async function readDroppedFileAsAttachment\(/)
  assert.match(rendererSource, /async function droppedFileAttachments\(/)
  assert.match(rendererSource, /file\.arrayBuffer\(\)/)
  assert.match(rendererSource, /data:\$\{attachment\.mime\};base64,/)
  assert.match(rendererSource, /source:\s*'drop'/)
  assert.doesNotMatch(rendererSource, /没有拿到文件路径，请用加号选择文件/)
})

test('renderer separates natural-language thinking endings from the final answer', () => {
  assert.match(rendererSource, /End of thought process/)
  assert.match(rendererSource, /THINKING_END_MARKERS/)
  assert.match(rendererSource, /answer:\s*cleanMarkers\(text\.slice\(naturalBoundary\.endIndex\)\)/)
})

test('renderer counts thinking text when content is still empty', () => {
  assert.match(rendererSource, /generatedTextForStats\(/)
  assert.match(rendererSource, /message\.thinking/)
  assert.match(rendererSource, /responseStats\(result\.raw,\s*generatedTextForStats\(assistant\),\s*latencyMs\)/)
})

test('renderer extracts loose html artifacts and exposes direct preview actions', () => {
  assert.match(rendererSource, /splitLooseHtmlParts\(/)
  assert.match(rendererSource, /looseHtmlPattern/)
  assert.match(rendererSource, /data-action="preview-code"/)
  assert.match(rendererSource, /预览网页/)
  assert.match(rendererSource, /data-action="download-code"/)
})

test('renderer presents first-run onboarding as a responsive product surface', () => {
  assert.match(rendererSource, /onboarding-primary/)
  assert.match(rendererSource, /onboarding-roadmap/)
  assert.doesNotMatch(rendererSource, /onboarding-action-panel" style=/)
  assert.match(stylesSource, /\.onboarding-action-panel[\s\S]*grid-template-columns: minmax\(320px, 0\.9fr\) minmax\(360px, 1\.1fr\)/)
})

test('renderer sends clean conversation context without thinking or ui placeholder text', () => {
  assert.match(rendererSource, /sanitizeAssistantForContext\(/)
  assert.match(rendererSource, /delete next\.thinking/)
  assert.match(rendererSource, /系统消息：请在这里写给模型的长期要求/)
  assert.match(rendererSource, /continue/)
})

test('renderer labels native decode speed without using wall time as the primary rate', () => {
  assert.match(rendererSource, /speedSource\s*=\s*Number\.isFinite\(nativeTps\)[\s\S]*'native'/)
  assert.match(rendererSource, /生成速率/)
  assert.match(rendererSource, /估算速率/)
  assert.doesNotMatch(rendererSource, /const speed = message\.speed \|\| \(tokens && latencyMs/)
})
