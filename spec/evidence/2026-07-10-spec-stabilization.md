# Spec Stabilization Evidence

## Basic Information

| Item | Value |
| --- | --- |
| Date | 2026-07-11 (evidence for 2026-07-10 stabilization) |
| Branch | `feat/spec-stabilization` |
| Production source commit at rebuild | `46165f37ab546e6b99514b8e1bf8729fba708718` |
| Package version | `0.6.13` |
| Windows | Windows 11 Pro `10.0.22631` |
| Node | `v24.13.0` |
| llama.cpp live server/model | Not configured for this run; no live model request was made. |

The existing unstaged `package-lock.json` modification predates this task and was preserved. UI captures remain historical Task 5 captures made with an isolated ignored Electron user-data directory; they are not evidence for the final-review code changes. The package evidence below is a fresh rebuild from the committed production source shown above.

## Scope

1. Run the required automated gate and record each exit code.
2. Capture model-independent UI states at both required viewport sizes.
3. Rebuild the committed final-review production source and record explicit limits on model- and release-dependent acceptance checks.

## Command Evidence

```powershell
npm test
node --check desktop/main.mjs
node --check desktop/preload.cjs
node --check renderer/app.js
git diff --check
```

Result:

```text
npm test: exit 0; 38 passed, 0 failed, 0 skipped
node --check desktop/main.mjs: exit 0
node --check desktop/preload.cjs: exit 0
node --check renderer/app.js: exit 0
git diff --check: exit 0
```

`npm test` covered runtime warnings, request-message construction and cancellation, attachment policy, runtime-argument aliases, terminal filtering/capacity accounting, exact chat lifecycle log strings, renderer exclusion-count reporting, and release-contract checks. It does not directly execute Electron-private `defaultConfig`, final request-body construction, or attachment serialization.

## Release Build Evidence

```powershell
npx electron-builder --publish never --config.directories.output=dist-spec-stabilization-head
$exe = 'dist-spec-stabilization-head\Llama.cpp-Desktop.exe'
(Get-Item -LiteralPath $exe).Length
Get-FileHash -LiteralPath $exe -Algorithm SHA256
Get-Content -Raw 'dist-spec-stabilization-head\Llama.cpp-Desktop.exe.sha256'
git check-ignore -v dist-spec-stabilization-head
```

Result:

```text
Build: exit 0 from production source commit `46165f37ab546e6b99514b8e1bf8729fba708718`
Package path: dist-spec-stabilization-head\Llama.cpp-Desktop.exe
Executable size: 90,849,715 bytes (86.64 MiB)
SHA256: 81CA75414D2005AB8DE2A3813A6D46F642E042ABE05C74506D3CCF5916F67CA8
SHA256 file: 81CA75414D2005AB8DE2A3813A6D46F642E042ABE05C74506D3CCF5916F67CA8  Llama.cpp-Desktop.exe
Build output ignored: .gitignore:6:dist-*/  dist-spec-stabilization-head
```

This task rebuilt the portable Windows package after the final-review production fixes. The later evidence-only amend does not change packaged inputs because `electron-builder.yml` includes only `assets/**`, `desktop/**`, `renderer/**`, and `package.json`. Nothing was published.

## UI Screenshot Evidence

For Task 5, the then-current packaged app was launched with a clean, ignored profile and CDP confirmed the renderer viewport before each capture. These captures were not rerun against the final-review package.

| Scenario | Viewport | Screenshot path | Result |
| --- | --- | --- | --- |
| Settings warnings for `ctx_size=65537` and `request_timeout_ms=29999` | 1365x768 | `spec/evidence/2026-07-10-spec-stabilization-1365x768-settings-warnings.png` | PASS: both warnings are visible. |
| Complete attachment menu, including disabled MCP reason | 1365x768 | `spec/evidence/2026-07-10-spec-stabilization-1365x768-attachment-menu-mcp-disabled.png` | PASS: image, audio, text, PDF, system, and disabled MCP entries are visible. |
| Terminal shell | 1365x768 | `spec/evidence/2026-07-10-spec-stabilization-1365x768-terminal-empty.png` | Historical shell-only evidence: captured before the final-review count changes, so it does not verify the current exclusion/hidden wording. Not rerun because no live model/server terminal session was configured. |
| Settings warnings for `ctx_size=65537` and `request_timeout_ms=29999` | 1920x1080 | `spec/evidence/2026-07-10-spec-stabilization-1920x1080-settings-warnings.png` | PASS: both warnings are visible. |
| Complete attachment menu, including disabled MCP reason | 1920x1080 | `spec/evidence/2026-07-10-spec-stabilization-1920x1080-attachment-menu-mcp-disabled.png` | PASS: all six entries and the MCP reason are visible. |
| Terminal shell | 1920x1080 | `spec/evidence/2026-07-10-spec-stabilization-1920x1080-terminal-empty.png` | Historical shell-only evidence: captured before the final-review count changes, so it does not verify the current exclusion/hidden wording. Not rerun because no live model/server terminal session was configured. |
| Composer stop state | 1365x768 and 1920x1080 | Not captured | BLOCKED: requires an active real llama.cpp streaming request. |

## Terminal Filtering Evidence

| Filter item | Evidence | Result |
| --- | --- | --- |
| Streamed JSON chunks | `npm test`: `filters streamed JSON, prompt, code echo, and idle polling` | Automated pass; live llama.cpp terminal check unrun. |
| Prompt echo | Same automated test | Automated pass; live llama.cpp terminal check unrun. |
| HTML/CSS/JS echo | Same automated test | Automated pass; live llama.cpp terminal check unrun. |
| Idle polling | Same automated test | Automated pass; live llama.cpp terminal check unrun. |
| Main-process request lifecycle strings | `npm test`: `recognizes the runtime lines retained by the terminal` | Automated pass for exact `request chat-123: 2 messages -> ...` and `stream done: 42 approx tokens, 1.2s` shapes emitted by `desktop/main.mjs`. |
| Second-stage relevance exclusions | `npm test`: `reports terminal relevance exclusions and entries hidden by the 520-line visible cap`; `terminal summary reports entries excluded by the relevance filter` | Automated pass: exclusions are counted and the renderer reports the count. |
| 520-line terminal visible cap | Same pure-pipeline test | Automated pass: 521 terminal-displayable entries produce 520 visible entries and hidden count `1`. |

## Request Evidence

| Item | Result | Evidence |
| --- | --- | --- |
| `chat_template_kwargs` is sent | SOURCE-INSPECTED | `desktop/main.mjs` assigns parsed kwargs to `body.chat_template_kwargs` in `buildChatRequestBody`, and both fetch handlers stringify that body. No direct request-body assertion or live request was run. |
| CLI form is normalized | PASS (automated) | `npm test`: `normalizes JSON and CLI chat-template-kwargs forms`. |
| `messages[0]` is system | PASS (automated) | `npm test`: `merges system messages at index zero and excludes local-only messages`. |
| Local errors stay out of context | PASS (automated) | `npm test`: local-only and failed partial assistant output exclusions. |
| Attachment contents are handled by type | SOURCE-INSPECTED | `prepareChatMessages` serializes text, image, and other file kinds differently. Existing automated tests cover menu/notices, not this serialization; real attachment send remains unrun. |
| Live stream/cancel smoke | BLOCKED | No configured GGUF model and live llama.cpp `/v1/chat/completions` stream in this run. |

## Acceptance Checklist

| ID | Result | Notes |
| --- | --- | --- |
| A-01 | PASS | `git status -sb` is explained; pre-existing unstaged `package-lock.json` preserved. |
| A-02 | PASS | `node --check desktop/main.mjs` exit 0. |
| A-03 | PASS | `node --check renderer/app.js` exit 0. |
| A-04 | PASS | `git diff --check` exit 0 before evidence commit. |
| A-05 | PASS (package-rebuilt) | Final-review production source was rebuilt; the portable exe exceeds 10 MB and its fresh SHA-256 is recorded above. |
| B-01 | PASS (source-inspected) | `defaultConfig()` in `desktop/main.mjs` sets `ctx_size: 32768`; no direct assertion executes this Electron-private builder. |
| B-02 | PASS | Automated warning coverage plus both settings-warning screenshots. |
| B-03 | PASS | Automated warning coverage plus both settings-warning screenshots. |
| C-01 | PASS (source-inspected) | `buildChatRequestBody` writes parsed `chat_template_kwargs`; no direct request-body assertion or live request was run. |
| C-02 | PASS (automated) | CLI/JSON normalization test passed. |
| C-04 | PASS (automated) | System-message ordering test passed. |
| C-06 | PASS (automated) | Local-only and failed-output exclusion tests passed. |
| D-01 | PASS | Attachment menu is fully visible at both required viewports. |
| D-03 | UNRUN | Requires real image attachment selection and visual inspection. |
| D-04 | UNRUN | Requires real image attachment selection and visual inspection. |
| E-01 | PASS | Terminal shell is visible at both required viewports. |
| E-02 | UNRUN | Unit filter test passed, but live llama.cpp output was not available. |
| E-03 | UNRUN | Unit filter test passed, but live llama.cpp output was not available. |
| E-05 | PASS (automated) | Regression test proves 521 terminal-displayable entries produce 520 visible lines and a hidden count of 1. Live llama.cpp output remains unrun, and the existing terminal screenshots predate the changed count wording. |
| F-01 | UNRUN | `package.json` is `0.6.13`, but no release tag was created or inspected. |
| F-03 | UNRUN | No GitHub Actions run or GitHub Release was executed/inspected. |
| F-04 | UNRUN | No GitHub Actions run or GitHub Release was executed/inspected. |

## Unrun Or Blocked Checks

| Area | Reason | Next step |
| --- | --- | --- |
| Live chat stream and composer stop/cancel | No configured model/server was started. | Start a real llama.cpp server with a GGUF model and record streaming plus cancellation at both viewports. |
| Image attachment presentation | No file-picker/image upload flow was run. | Attach representative landscape and portrait images; capture preview dimensions and sent-message layout. |
| Terminal acceptance with real output and fresh count screenshots | No llama.cpp process emitted runtime logs and no final-review UI capture was run. | Start the server, generate excluded, filtered, retained, and cap-hidden log lines, then capture both terminal viewports. |
| Remote GitHub Actions/Release assets | No remote workflow was triggered, tag created, or release published. | With separate authorization, trigger the version tag workflow and inspect both release assets. |

## Defects Found

Final-review defects fixed on 2026-07-11: common llama-server aliases could override UI-owned runtime values; the terminal silently excluded stored non-runtime lines; and exact chat request/stream-completion lifecycle logs were omitted. Alias names are now canonicalized before validation, terminal selection returns both relevance-excluded and cap-hidden counts, the UI reports both, and exact lifecycle shapes are retained. Regression tests captured RED for each behavior before the fixes.

## Final Conclusion

This evidence run passes the requested automated gate and a fresh HEAD package rebuild. Historical model-independent UI captures are retained but are not claimed as fresh final-review evidence. This is not a full end-to-end acceptance pass because the live model/server, final request-body observation, real attachment serialization, live terminal, fresh terminal screenshots, and remote release checks remain source-inspected, unrun, or blocked as labeled above.
