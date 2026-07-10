# llama.cpp Desktop Spec Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the B-F acceptance gaps in `spec/acceptance.md` with testable runtime, chat, attachment, log, and release behavior.

**Architecture:** Extract only high-risk policy code from the Electron entry files into dependency-free ES modules. Keep Electron IPC and renderer composition intact, and use Node's built-in test runner for deterministic evidence.

**Tech Stack:** Electron 41, Node.js 22 ES modules, `node:test`, PowerShell, electron-builder 26.

## Global Constraints

- Windows remains the only packaged platform.
- Do not bundle llama.cpp binaries, models, mmproj files, CUDA, or Vulkan.
- Do not overwrite existing user config, history, or runtime state.
- Default `ctx_size` is `32768`; warn when `ctx_size > 65536`.
- Default `request_timeout_ms` is `600000`; values below `30000` require an explicit warning.
- Final chat requests contain at most one system message and it is `messages[0]`.
- Local errors, cancellation state, and failed partial assistant output never enter the next model request.
- Terminal view shows at most `520` lines and reports filtered or dropped counts.
- Image previews stay within `min(280px, 52vw)` width and `320px` height.
- Release tag, package version, title, exe name, and sha256 name must agree.
- Do not push, create tags, or publish a GitHub Release without separate user confirmation.

---

### Task 1: Test Harness And Runtime Policy

**Files:**
- Create: `desktop/lib/runtime-policy.mjs`
- Create: `test/runtime-policy.test.mjs`
- Modify: `desktop/main.mjs`
- Modify: `renderer/app.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `DEFAULT_HOST`, `runtimeWarnings(config)`, `assertNoCoreArgConflicts(extraArgs)`, and `serviceUrls(config)`.
- `runtimeWarnings` returns `{ id, level, message }[]`.
- `serviceUrls` returns `{ listenBaseUrl, localBaseUrl, chatCompletionsUrl }`.

- [ ] **Step 1: Add the failing runtime tests**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_HOST, runtimeWarnings, assertNoCoreArgConflicts, serviceUrls } from '../desktop/lib/runtime-policy.mjs'

test('defaults to loopback host', () => assert.equal(DEFAULT_HOST, '127.0.0.1'))
test('warns for public bind, high context, and short timeout', () => {
  const ids = runtimeWarnings({ host: '0.0.0.0', ctx_size: 65537, request_timeout_ms: 29999 }).map(item => item.id)
  assert.deepEqual(ids, ['public-host', 'high-context', 'short-timeout'])
})
test('rejects extra args that override UI-owned values', () => {
  assert.throws(() => assertNoCoreArgConflicts('--port 9000 --ctx-size=131072'), /--port, --ctx-size/)
})
test('reports the configured listener and usable local URL separately', () => {
  assert.deepEqual(serviceUrls({ host: '0.0.0.0', port: 8080 }), {
    listenBaseUrl: 'http://0.0.0.0:8080',
    localBaseUrl: 'http://127.0.0.1:8080',
    chatCompletionsUrl: 'http://127.0.0.1:8080/v1/chat/completions'
  })
})
```

- [ ] **Step 2: Run RED**

Run: `node --test test/runtime-policy.test.mjs`

Expected: FAIL because `desktop/lib/runtime-policy.mjs` does not exist.

- [ ] **Step 3: Implement the runtime policy and wire it into main/renderer**

```js
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
```

Use `DEFAULT_HOST` in `defaultConfig()`, include `configWarnings` and URL fields in the snapshot, validate conflicts before spawn, and render warning callouts next to the relevant settings.

- [ ] **Step 4: Run GREEN and baseline checks**

Run: `npm test && node --check desktop/main.mjs && node --check renderer/app.js`

Expected: all tests pass and both syntax checks exit 0.

- [ ] **Step 5: Commit**

```powershell
git add package.json desktop/lib/runtime-policy.mjs desktop/main.mjs renderer/app.js test/runtime-policy.test.mjs
git commit -m "feat: validate runtime configuration"
```

### Task 2: Chat Request Safety And Cancellation

**Files:**
- Create: `desktop/lib/chat-pipeline.mjs`
- Create: `test/chat-pipeline.test.mjs`
- Modify: `desktop/main.mjs`
- Modify: `desktop/preload.cjs`
- Modify: `renderer/app.js`
- Modify: `renderer/styles.css`

**Interfaces:**
- Produces: `normalizeChatTemplateKwargs(text)`, `buildRequestMessages(messages)`, `extractStreamDelta(payload)`, `createRequestRegistry()`.
- `extractStreamDelta` returns `{ content, thinking }`.
- `createRequestRegistry` exposes `start(id, timeoutMs)`, `cancel(id)`, and `finish(id)`.

- [ ] **Step 1: Add failing chat tests**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRequestMessages, normalizeChatTemplateKwargs, extractStreamDelta, createRequestRegistry } from '../desktop/lib/chat-pipeline.mjs'

test('merges system messages at index zero and excludes local-only messages', () => {
  const result = buildRequestMessages([
    { role: 'user', content: 'one' },
    { role: 'system', content: 'alpha' },
    { role: 'assistant', content: 'broken', localOnly: true },
    { role: 'system', content: 'beta' }
  ])
  assert.deepEqual(result, [
    { role: 'system', content: 'alpha\n\nbeta' },
    { role: 'user', content: 'one' }
  ])
})

test('normalizes JSON and CLI chat-template-kwargs forms', () => {
  assert.deepEqual(normalizeChatTemplateKwargs('{"enable_thinking":false}'), { enable_thinking: false })
  assert.deepEqual(normalizeChatTemplateKwargs('--chat-template-kwargs \'{\\"enable_thinking\\":false}\''), { enable_thinking: false })
})

test('extracts structured reasoning fields without losing content', () => {
  assert.deepEqual(extractStreamDelta({ choices: [{ delta: { content: 'answer', reasoning_content: 'reason' } }] }), { content: 'answer', thinking: 'reason' })
  assert.deepEqual(extractStreamDelta({ choices: [{ delta: { thinking: 'plan' } }] }), { content: '', thinking: 'plan' })
})

test('cancels only the matching active request', () => {
  const registry = createRequestRegistry()
  const first = registry.start('first', 600000)
  const second = registry.start('second', 600000)
  assert.equal(registry.cancel('first'), true)
  assert.equal(first.aborted, true)
  assert.equal(second.aborted, false)
  registry.finish('second')
})
```

- [ ] **Step 2: Run RED**

Run: `node --test test/chat-pipeline.test.mjs`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement and integrate the shared request pipeline**

```js
export function buildRequestMessages(input = []) {
  const systems = []
  const messages = []
  for (const item of input) {
    if (!item || item.localOnly || !['system', 'user', 'assistant'].includes(item.role)) continue
    if (item.role === 'system') systems.push(String(item.content || '').trim())
    else if (Array.isArray(item.content) || String(item.content || '').trim()) messages.push({ role: item.role, content: item.content })
  }
  const systemText = systems.filter(Boolean).join('\n\n')
  return systemText ? [{ role: 'system', content: systemText }, ...messages] : messages
}

export function extractStreamDelta(payload = {}) {
  const value = payload.choices?.[0]?.delta || payload.choices?.[0]?.message || payload
  return {
    content: String(value.content || ''),
    thinking: String(value.reasoning_content || value.thinking || '')
  }
}

export function createRequestRegistry() {
  const active = new Map()
  const finish = id => {
    const current = active.get(id)
    if (!current) return false
    clearTimeout(current.timer)
    active.delete(id)
    return true
  }
  return {
    start(id, timeoutMs) {
      finish(id)
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), timeoutMs)
      active.set(id, { controller, timer })
      return controller.signal
    },
    cancel(id) {
      const current = active.get(id)
      if (!current) return false
      current.controller.abort(new DOMException('Request cancelled', 'AbortError'))
      finish(id)
      return true
    },
    finish
  }
}
```

Both chat IPC handlers must call `buildRequestMessages`. Add `llama:cancel-chat`, expose `cancelChat(requestId)`, and use a stable request id per renderer send/retry. On failure after partial output, keep the message visible but set `localOnly: true` and a failed/cancelled state. The next `buildApiMessages` call must skip it. Replace the busy ellipsis with a stop control that calls cancellation.

- [ ] **Step 4: Run GREEN and regression checks**

Run: `npm test && node --check desktop/main.mjs && node --check desktop/preload.cjs && node --check renderer/app.js`

Expected: all pass.

- [ ] **Step 5: Commit**

```powershell
git add desktop/lib/chat-pipeline.mjs desktop/main.mjs desktop/preload.cjs renderer/app.js renderer/styles.css test/chat-pipeline.test.mjs
git commit -m "fix: keep failed chat output out of context"
```

### Task 3: Attachment Menu And Visible States

**Files:**
- Create: `renderer/lib/attachment-policy.js`
- Create: `test/attachment-policy.test.mjs`
- Modify: `renderer/app.js`
- Modify: `renderer/styles.css`

**Interfaces:**
- Produces: `ATTACHMENT_MENU_ITEMS` and `attachmentNotice(item)`.
- Menu item shape: `{ id, label, enabled, reason }`.

- [ ] **Step 1: Add failing attachment tests**

```js
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
```

- [ ] **Step 2: Run RED**

Run: `node --test test/attachment-policy.test.mjs`

Expected: FAIL because the policy module does not exist.

- [ ] **Step 3: Implement menu and attachment states**

Use the policy array to render the six entries, remove video, prevent disabled MCP clicks, render reason text, and show `warning`/`error` below the compact file name. Set menu `max-height: calc(100vh - 16px)` with vertical overflow and clamp its fixed coordinates to the viewport.

- [ ] **Step 4: Run GREEN and syntax checks**

Run: `npm test && node --check renderer/app.js`

Expected: all pass.

- [ ] **Step 5: Commit**

```powershell
git add renderer/lib/attachment-policy.js renderer/app.js renderer/styles.css test/attachment-policy.test.mjs
git commit -m "fix: align attachment menu with specification"
```

### Task 4: Deterministic Terminal Log Pipeline

**Files:**
- Create: `desktop/lib/log-pipeline.mjs`
- Create: `test/log-pipeline.test.mjs`
- Modify: `desktop/main.mjs`
- Modify: `renderer/app.js`
- Modify: `renderer/styles.css`
- Modify: `spec/evidence-template.md`

**Interfaces:**
- Produces: `processLogChunk(source, chunk)`, `appendVisibleLogs(state, entries, limit)`, and `isImportantRuntimeLine(line)`.
- Log state shape: `{ entries, filtered, truncated, dropped }`.

- [ ] **Step 1: Add failing log tests**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { processLogChunk, appendVisibleLogs } from '../desktop/lib/log-pipeline.mjs'

test('filters streamed JSON, prompt, code echo, and idle polling', () => {
  const input = ['http: streamed chunk: data: {"choices":[]}', 'prompt: <|im_start|>user', '<div>echo</div>', 'body { color: red; }', 'const answer = 1;', 'que start_loop: waiting for new tasks'].join('\n')
  const result = processLogChunk('stdout', input)
  assert.deepEqual(result.entries, [])
  assert.equal(result.filtered, 6)
})

test('keeps CPU CUDA Metal listener and error lines', () => {
  const input = ['CPU backend loaded', 'CUDA0 ready', 'Metal device selected', 'server listening at 127.0.0.1:8080', 'error: port in use'].join('\n')
  assert.equal(processLogChunk('stdout', input).entries.length, 5)
})

test('tracks filtered truncated and capacity-dropped counts separately', () => {
  let state = { entries: [], filtered: 2, truncated: 1, dropped: 0 }
  state = appendVisibleLogs(state, Array.from({ length: 521 }, (_, index) => ({ source: 'stdout', line: `line ${index}` })), 520)
  assert.equal(state.entries.length, 520)
  assert.deepEqual({ filtered: state.filtered, truncated: state.truncated, dropped: state.dropped }, { filtered: 2, truncated: 1, dropped: 1 })
})
```

- [ ] **Step 2: Run RED**

Run: `node --test test/log-pipeline.test.mjs`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement and wire the log state**

Move ANSI cleanup and noise rules into the pure module. Keep no more than 1200 stored main-process entries, send `logStats` with snapshots/events, render no more than 520 terminal lines, and show separate filtered/truncated/dropped counts. Add E-03 and explicit filter evidence rows to the evidence template.

- [ ] **Step 4: Run GREEN and syntax checks**

Run: `npm test && node --check desktop/main.mjs && node --check renderer/app.js`

Expected: all pass.

- [ ] **Step 5: Commit**

```powershell
git add desktop/lib/log-pipeline.mjs desktop/main.mjs renderer/app.js renderer/styles.css test/log-pipeline.test.mjs spec/evidence-template.md
git commit -m "fix: make terminal filtering measurable"
```

### Task 5: Release Contract And Build Evidence

**Files:**
- Create: `test/release-contract.test.mjs`
- Modify: `.gitignore`
- Modify: `.github/workflows/release.yml`
- Modify: `spec/evidence-template.md`

**Interfaces:**
- Consumes: `package.json`, `electron-builder.yml`, and release workflow text.
- Produces: a local test proving version/tag validation and asset-name consistency.

- [ ] **Step 1: Add failing release-contract tests**

```js
test('ignores all dist variants', () => assert.match(gitignore, /^dist-\*\/$/m))
test('workflow validates strict semver tag against package version', () => {
  assert.match(workflow, /\^v\\d\+\\\.\\d\+\\\.\\d\+\$/)
  assert.match(workflow, /package\.json/)
  assert.match(workflow, /github\.ref_name/)
})
test('workflow uploads the configured exe and sha256 and generates notes', () => {
  assert.match(workflow, /dist\/Llama\.cpp-Desktop\.exe\r?\n/)
  assert.match(workflow, /dist\/Llama\.cpp-Desktop\.exe\.sha256/)
  assert.match(workflow, /generate_release_notes:\s*true/)
})
```

- [ ] **Step 2: Run RED**

Run: `node --test test/release-contract.test.mjs`

Expected: FAIL on missing `dist-*/`, version validation, and release notes.

- [ ] **Step 3: Update release policy**

Add `dist-*/` to `.gitignore`. Add a PowerShell workflow step that rejects non-`vX.Y.Z` tags and mismatched `package.json.version`. Enable generated notes and add static sections for assets, known limitations, and configuration migration.

- [ ] **Step 4: Run GREEN and package to an isolated output**

Run: `npm test`

Then: `npx electron-builder --publish never --config.directories.output=dist-spec-stabilization`

Expected: tests pass and `dist-spec-stabilization/Llama.cpp-Desktop.exe` is larger than 10 MB.

- [ ] **Step 5: Generate and verify checksum evidence**

```powershell
$exe = 'dist-spec-stabilization\Llama.cpp-Desktop.exe'
$hash = (Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash
"$hash  Llama.cpp-Desktop.exe" | Set-Content 'dist-spec-stabilization\Llama.cpp-Desktop.exe.sha256' -Encoding ascii
Get-FileHash -LiteralPath $exe -Algorithm SHA256
```

- [ ] **Step 6: Commit**

```powershell
git add .gitignore .github/workflows/release.yml spec/evidence-template.md test/release-contract.test.mjs
git commit -m "ci: enforce release version contract"
```

### Task 6: Integrated UI And Evidence Verification

**Files:**
- Create: `spec/evidence/2026-07-10-spec-stabilization.md`
- Modify only if verification reveals a reproducible defect in a prior task.

**Interfaces:**
- Consumes all previous task outputs.
- Produces command evidence, package hash, screenshot paths, and an explicit list of model-dependent checks not run.

- [ ] **Step 1: Run the complete automated gate**

Run: `npm test; node --check desktop/main.mjs; node --check desktop/preload.cjs; node --check renderer/app.js; git diff --check`

Expected: every command exits 0.

- [ ] **Step 2: Capture UI states**

Launch the Electron app and capture `1365x768` and `1920x1080` evidence for the settings warnings, complete attachment menu, disabled MCP reason, terminal view, and composer stop state. Record exact screenshot paths.

- [ ] **Step 3: Fill the evidence report**

Copy the evidence template into the dated report and fill commands, exit codes, screenshot paths, package size, sha256, passed acceptance IDs, and blocked model-dependent checks. Do not mark unrun checks as passed.

- [ ] **Step 4: Commit**

```powershell
git add spec/evidence/2026-07-10-spec-stabilization.md
git commit -m "docs: record stabilization evidence"
```

### Task 7: Final Review And Branch Completion

**Files:**
- Review all changes from merge base through HEAD.

- [ ] **Step 1: Run the full verification gate again**

Run: `npm test; node --check desktop/main.mjs; node --check desktop/preload.cjs; node --check renderer/app.js; git diff --check; git status -sb`

- [ ] **Step 2: Dispatch whole-branch review**

Generate a review package from the branch merge base to HEAD and dispatch an independent final reviewer. Fix all Critical/Important findings in one fix wave, rerun covering tests, and re-review.

- [ ] **Step 3: Report branch state**

Report worktree path, branch name, commits, tests, package path/hash, screenshot evidence, remaining model-dependent checks, and integration options. Do not push or create a release.
