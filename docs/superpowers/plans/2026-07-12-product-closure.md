# Product Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close PM review gaps with first-screen onboarding, explainable checks, repair actions, smoke validation, support feedback, and release-candidate evidence.

**Architecture:** Keep new decision logic in pure renderer helpers, wire safe platform checks through Electron IPC, and render the product closure controls inside existing chat and settings surfaces. Avoid new dependencies and do not perform destructive actions such as killing port-owning processes.

**Tech Stack:** Electron 41, Node.js ES modules, vanilla renderer JS/CSS, `node:test`, PowerShell-backed Windows inspection where available.

## Global Constraints

- Preserve existing IPC fields and current renderer actions.
- Do not push, tag, publish a GitHub release, or kill another process.
- Download help must point to official llama.cpp releases and remain user-confirmed.
- Hardware recommendations must say when VRAM is unknown.
- All user-facing diagnostics must provide a next action.

---

### Task 1: Pure Product Closure Helpers

**Files:**
- Modify: `renderer/lib/feedback-repair.js`
- Modify: `test/feedback-repair.test.mjs`

**Interfaces:**
- Produces: `downloadGuidance()`
- Produces: `portRepairPlan({ config, status, inspection, health })`
- Produces: `hardwareRecommendation({ config, systemInfo })`
- Produces: `clientSmokePlan({ config, status, smoke })`
- Produces: `modelCapabilityCatalog({ config, modelInfo })`
- Produces: `releaseCandidateChecklist({ build })`

- [ ] Add failing tests for each helper.
- [ ] Run `node --test test/feedback-repair.test.mjs` and verify failure.
- [ ] Implement the helpers.
- [ ] Run the focused test and verify pass.

### Task 2: Main Process Repair IPC

**Files:**
- Modify: `desktop/main.mjs`
- Modify: `desktop/preload.cjs`
- Modify: `test/feedback-repair.test.mjs`

**Interfaces:**
- Produces preload methods: `getSystemInfo`, `inspectPort`, `clientSmokeTest`.
- Produces IPC handlers: `llama:get-system-info`, `llama:inspect-port`, `llama:client-smoke-test`.

- [ ] Add source-contract tests for the new IPC names and methods.
- [ ] Run the focused test and verify failure.
- [ ] Implement non-destructive system info, port inspection, and OpenAI chat smoke test.
- [ ] Run focused tests and syntax checks.

### Task 3: Product UI Closure

**Files:**
- Modify: `renderer/app.js`
- Modify: `renderer/styles.css`
- Modify: `test/feedback-repair.test.mjs`

**Interfaces:**
- Adds actions: `toggle-run-check`, `open-downloads`, `copy-download-guidance`, `inspect-port`, `apply-port-fix`, `client-smoke-test`, `copy-feedback-bundle`.

- [ ] Add source-contract tests for the actions and responsive class names.
- [ ] Run the focused test and verify failure.
- [ ] Render onboarding action panel, expandable run-check details, and rescue-page closure cards.
- [ ] Add responsive CSS for narrow windows.
- [ ] Run focused and full tests.

### Task 4: Package And Visual Audit

**Files:**
- Build: `dist-release-candidate/`
- Screenshot: `docs/audit-screenshots/2026-07-12-product-closure/`
- Shortcut: `C:\Users\Administrator\Desktop\Llama.cpp Desktop - Release Candidate.lnk`

- [ ] Run full tests, syntax checks, and `git diff --check`.
- [ ] Build `dist-release-candidate`.
- [ ] Refresh desktop shortcut and open the app.
- [ ] Capture desktop and narrow screenshots for main screen, first-run wizard, and rescue settings.
- [ ] Report passed, not passed, and manual external items.
