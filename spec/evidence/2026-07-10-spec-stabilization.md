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
npm test: exit 0; 36 passed, 0 failed, 0 skipped
node --check desktop/main.mjs: exit 0
node --check desktop/preload.cjs: exit 0
node --check renderer/app.js: exit 0
git diff --check: exit 0
```

`npm test` covered runtime warnings, request-message construction and cancellation, attachment policy, terminal filtering/capacity accounting, and release-contract checks. The 2026-07-11 terminal visible-cap fix rerun completed with 36 passing tests, including `reports terminal entries hidden by the 520-line visible cap`.

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
| Terminal shell | 1365x768 | `spec/evidence/2026-07-10-spec-stabilization-1365x768-terminal-empty.png` | Historical shell-only evidence: captured before the 2026-07-11 visible-cap copy fix, so it does not verify the current hidden-at-520 wording. Fresh source capture was blocked by the incomplete worktree Electron installation. |
| Settings warnings for `ctx_size=65537` and `request_timeout_ms=29999` | 1920x1080 | `spec/evidence/2026-07-10-spec-stabilization-1920x1080-settings-warnings.png` | PASS: both warnings are visible. |
| Complete attachment menu, including disabled MCP reason | 1920x1080 | `spec/evidence/2026-07-10-spec-stabilization-1920x1080-attachment-menu-mcp-disabled.png` | PASS: all six entries and the MCP reason are visible. |
| Terminal shell | 1920x1080 | `spec/evidence/2026-07-10-spec-stabilization-1920x1080-terminal-empty.png` | Historical shell-only evidence: captured before the 2026-07-11 visible-cap copy fix, so it does not verify the current hidden-at-520 wording. Fresh source capture was blocked by the incomplete worktree Electron installation. |
| Composer stop state | 1365x768 and 1920x1080 | Not captured | BLOCKED: requires an active real llama.cpp streaming request. |

## Terminal Filtering Evidence

| Filter item | Evidence | Result |
| --- | --- | --- |
| Streamed JSON chunks | `npm test`: `filters streamed JSON, prompt, code echo, and idle polling` | Automated pass; live llama.cpp terminal check unrun. |
| Prompt echo | Same automated test | Automated pass; live llama.cpp terminal check unrun. |
| HTML/CSS/JS echo | Same automated test | Automated pass; live llama.cpp terminal check unrun. |
| Idle polling | Same automated test | Automated pass; live llama.cpp terminal check unrun. |
| 520-line terminal visible cap | `npm test`: `reports terminal entries hidden by the 520-line visible cap` | Automated pass: 521 terminal-displayable entries produce 520 visible entries and hidden count `1`. |

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
| E-05 | PASS (automated) | Regression test proves 521 terminal-displayable entries produce 520 visible lines and a hidden count of 1. Live llama.cpp output remains unrun, and the existing terminal screenshots predate the changed count wording. |
| F-01 | UNRUN | `package.json` is `0.6.13`, but no release tag was created or inspected. |
| F-03 | UNRUN | No GitHub Actions run or GitHub Release was executed/inspected. |
| F-04 | UNRUN | No GitHub Actions run or GitHub Release was executed/inspected. |

## Unrun Or Blocked Checks

| Area | Reason | Next step |
| --- | --- | --- |
| Live chat stream and composer stop/cancel | No configured model/server was started. | Start a real llama.cpp server with a GGUF model and record streaming plus cancellation at both viewports. |
| Image attachment presentation | No file-picker/image upload flow was run. | Attach representative landscape and portrait images; capture preview dimensions and sent-message layout. |
| Terminal acceptance with real output and fresh cap-copy screenshots | No llama.cpp process emitted runtime logs; additionally, this worktree's Electron install cannot launch the source app (`Electron failed to install correctly`). | Repair/reinstall the worktree Electron dependency without changing user state, then start the server, generate filtered and retained log lines, and capture both terminal viewports. |
| Remote GitHub Actions/Release assets | No remote workflow was triggered, tag created, or release published. | With separate authorization, trigger the version tag workflow and inspect both release assets. |

## Defects Found

Critical defect found and fixed on 2026-07-11: the renderer silently filtered and sliced terminal-displayable logs to 520 lines, while only main-process overflow beyond the separate 1200-entry store incremented `dropped`. Therefore 521 to 1200 retained terminal entries could be hidden without a visible count. The pure `selectVisibleTerminalLogs` helper now returns the 520-entry view and its hidden count; the UI labels hidden-at-520 lines separately from entries discarded at the 1200-entry stored cap. The regression test reproduces 521 terminal-displayable entries and verifies 520 visible entries plus hidden count 1.

## Final Conclusion

This evidence run passes the requested automated gate, package revalidation, and model-independent UI captures. The terminal visible-cap defect is fixed and covered by a fresh regression test. It is not a full end-to-end acceptance pass because the live model/server, real attachment, live terminal, fresh terminal copy screenshots, and remote release checks remain unrun or blocked.
