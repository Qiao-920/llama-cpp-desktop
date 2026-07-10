# Spec Stabilization Evidence

## Basic Information

| Item | Value |
| --- | --- |
| Date | 2026-07-11 (evidence for 2026-07-10 stabilization) |
| Branch | `feat/spec-stabilization` |
| Baseline commit | `7fe7058ba3c360a021c139a29fffa756e386fa91` |
| Package version | `0.6.13` |
| Windows | Windows 11 Pro `10.0.22631` |
| Node | `v24.13.0` |
| llama.cpp live server/model | Not configured for this run; no live model request was made. |

The existing unstaged `package-lock.json` modification predates this task and was preserved. UI captures used the Task 5 unpacked package with an isolated ignored Electron user-data directory, so user configuration, history, and runtime state were not written.

## Scope

1. Run the required automated gate and record each exit code.
2. Capture model-independent UI states at both required viewport sizes.
3. Reverify the Task 5 Windows package and record explicit limits on model- and release-dependent acceptance checks.

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
npm test: exit 0; 35 passed, 0 failed, 0 skipped
node --check desktop/main.mjs: exit 0
node --check desktop/preload.cjs: exit 0
node --check renderer/app.js: exit 0
git diff --check: exit 0
```

`npm test` covered runtime warnings, request-message construction and cancellation, attachment policy, terminal filtering/capacity accounting, and release-contract checks.

## Release Build Evidence

```powershell
$exe = 'dist-spec-stabilization\Llama.cpp-Desktop.exe'
(Get-Item -LiteralPath $exe).Length
Get-FileHash -LiteralPath $exe -Algorithm SHA256
Get-Content -Raw 'dist-spec-stabilization\Llama.cpp-Desktop.exe.sha256'
git check-ignore -v dist-spec-stabilization
```

Result:

```text
Package path: dist-spec-stabilization\Llama.cpp-Desktop.exe
Executable size: 90,849,323 bytes (86.64 MiB)
SHA256: AB8B4BCE1170D04004B97074B6BFA110A3B439EA6969702A44D1AF0163930D5B
SHA256 file: AB8B4BCE1170D04004B97074B6BFA110A3B439EA6969702A44D1AF0163930D5B  Llama.cpp-Desktop.exe
Build output ignored: .gitignore:6:dist-*/  dist-spec-stabilization
```

This task reverified the Task 5 artifact only; it did not rebuild or publish it.

## UI Screenshot Evidence

The packaged app was launched with a clean, ignored profile. CDP confirmed the actual renderer viewport before each capture.

| Scenario | Viewport | Screenshot path | Result |
| --- | --- | --- | --- |
| Settings warnings for `ctx_size=65537` and `request_timeout_ms=29999` | 1365x768 | `spec/evidence/2026-07-10-spec-stabilization-1365x768-settings-warnings.png` | PASS: both warnings are visible. |
| Complete attachment menu, including disabled MCP reason | 1365x768 | `spec/evidence/2026-07-10-spec-stabilization-1365x768-attachment-menu-mcp-disabled.png` | PASS: image, audio, text, PDF, system, and disabled MCP entries are visible. |
| Terminal shell | 1365x768 | `spec/evidence/2026-07-10-spec-stabilization-1365x768-terminal-empty.png` | PASS for shell only: terminal view and its count indicators are visible; no live output was available. |
| Settings warnings for `ctx_size=65537` and `request_timeout_ms=29999` | 1920x1080 | `spec/evidence/2026-07-10-spec-stabilization-1920x1080-settings-warnings.png` | PASS: both warnings are visible. |
| Complete attachment menu, including disabled MCP reason | 1920x1080 | `spec/evidence/2026-07-10-spec-stabilization-1920x1080-attachment-menu-mcp-disabled.png` | PASS: all six entries and the MCP reason are visible. |
| Terminal shell | 1920x1080 | `spec/evidence/2026-07-10-spec-stabilization-1920x1080-terminal-empty.png` | PASS for shell only: terminal view and its count indicators are visible; no live output was available. |
| Composer stop state | 1365x768 and 1920x1080 | Not captured | BLOCKED: requires an active real llama.cpp streaming request. |

## Terminal Filtering Evidence

| Filter item | Evidence | Result |
| --- | --- | --- |
| Streamed JSON chunks | `npm test`: `filters streamed JSON, prompt, code echo, and idle polling` | Automated pass; live llama.cpp terminal check unrun. |
| Prompt echo | Same automated test | Automated pass; live llama.cpp terminal check unrun. |
| HTML/CSS/JS echo | Same automated test | Automated pass; live llama.cpp terminal check unrun. |
| Idle polling | Same automated test | Automated pass; live llama.cpp terminal check unrun. |

## Request Evidence

| Item | Result | Evidence |
| --- | --- | --- |
| `chat_template_kwargs` is sent | PASS (automated) | `npm test`: JSON and CLI forms normalize through the shared request pipeline. |
| CLI form is normalized | PASS (automated) | `npm test`: `normalizes JSON and CLI chat-template-kwargs forms`. |
| `messages[0]` is system | PASS (automated) | `npm test`: `merges system messages at index zero and excludes local-only messages`. |
| Local errors stay out of context | PASS (automated) | `npm test`: local-only and failed partial assistant output exclusions. |
| Attachment contents are handled by type | PASS (automated) | `npm test`: attachment policy menu/error cases and renderer integration coverage. |
| Live stream/cancel smoke | BLOCKED | No configured GGUF model and live llama.cpp `/v1/chat/completions` stream in this run. |

## Acceptance Checklist

| ID | Result | Notes |
| --- | --- | --- |
| A-01 | PASS | `git status -sb` is explained; pre-existing unstaged `package-lock.json` preserved. |
| A-02 | PASS | `node --check desktop/main.mjs` exit 0. |
| A-03 | PASS | `node --check renderer/app.js` exit 0. |
| A-04 | PASS | `git diff --check` exit 0 before evidence commit. |
| A-05 | PASS | Task 5 package exists, exceeds 10 MB, and hash was reverified. |
| B-01 | PASS | Automated runtime-policy coverage verifies default `ctx_size=32768`. |
| B-02 | PASS | Automated warning coverage plus both settings-warning screenshots. |
| B-03 | PASS | Automated warning coverage plus both settings-warning screenshots. |
| C-01 | PASS (automated) | Shared request pipeline coverage; live request summary not captured. |
| C-02 | PASS (automated) | CLI/JSON normalization test passed. |
| C-04 | PASS (automated) | System-message ordering test passed. |
| C-06 | PASS (automated) | Local-only and failed-output exclusion tests passed. |
| D-01 | PASS | Attachment menu is fully visible at both required viewports. |
| D-03 | UNRUN | Requires real image attachment selection and visual inspection. |
| D-04 | UNRUN | Requires real image attachment selection and visual inspection. |
| E-01 | PASS | Terminal shell is visible at both required viewports. |
| E-02 | UNRUN | Unit filter test passed, but live llama.cpp output was not available. |
| E-03 | UNRUN | Unit filter test passed, but live llama.cpp output was not available. |
| E-05 | UNRUN | Unit capacity/count test passed, but no long-running live log was produced. |
| F-01 | UNRUN | `package.json` is `0.6.13`, but no release tag was created or inspected. |
| F-03 | UNRUN | No GitHub Actions run or GitHub Release was executed/inspected. |
| F-04 | UNRUN | No GitHub Actions run or GitHub Release was executed/inspected. |

## Unrun Or Blocked Checks

| Area | Reason | Next step |
| --- | --- | --- |
| Live chat stream and composer stop/cancel | No configured model/server was started. | Start a real llama.cpp server with a GGUF model and record streaming plus cancellation at both viewports. |
| Image attachment presentation | No file-picker/image upload flow was run. | Attach representative landscape and portrait images; capture preview dimensions and sent-message layout. |
| Terminal acceptance with real output | No llama.cpp process emitted runtime logs. | Start the server, generate filtered and retained log lines, then verify counters and 520-line cap. |
| Remote GitHub Actions/Release assets | No remote workflow was triggered, tag created, or release published. | With separate authorization, trigger the version tag workflow and inspect both release assets. |

## Defects Found

No reproducible defect in prior task code was found. The unrun items above are evidence gaps, not passes.

## Final Conclusion

This evidence run passes the requested automated gate, package revalidation, and model-independent UI captures. It is not a full end-to-end acceptance pass because the live model/server, real attachment, live terminal, and remote release checks remain unrun or blocked.
