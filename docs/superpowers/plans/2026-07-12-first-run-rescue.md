# First Run Rescue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-run wizard, richer environment checks, endpoint diagnosis, and conservative model recommendations.

**Architecture:** Keep diagnosis logic in `renderer/lib/feedback-repair.js` as pure functions, extend `desktop/main.mjs` with backward-compatible validation and health metadata, and render the wizard inside the existing Electron renderer. Avoid new dependencies and avoid replacing the current settings system.

**Tech Stack:** Electron 41, Node.js ES modules, vanilla renderer JS/CSS, `node:test`, electron-builder.

## Global Constraints

- Preserve existing IPC fields and call names.
- Do not block startup on DLL warnings when `llama-server.exe` exists.
- Copy must be concrete and conservative: no guaranteed VRAM claims, no guaranteed image understanding.
- Keep `package-lock.json` untouched because it predates this task.
- Build output must stay under ignored `dist-*` folders.

---

### Task 1: Pure Diagnosis Contracts

**Files:**
- Modify: `renderer/lib/feedback-repair.js`
- Modify: `test/feedback-repair.test.mjs`

**Interfaces:**
- Produces: `shouldShowFirstRunWizard({ config, validation, status, seen })`
- Produces: `environmentIntegrity({ config, validation })`
- Produces: `portDiagnosis(result)`
- Produces: `modelRecommendation({ config, validation })`

- [ ] Write failing tests for the four pure functions.
- [ ] Run `node --test test/feedback-repair.test.mjs` and verify failure.
- [ ] Implement minimal pure functions.
- [ ] Run the focused test and verify pass.

### Task 2: Runtime and Port Metadata

**Files:**
- Modify: `desktop/main.mjs`

**Interfaces:**
- Extends `validation` with `runtimeIssues`.
- Extends `llama:test-health` result with `kind`, `checks`, and `nextAction`.

- [ ] Write or extend tests that inspect source/API contract.
- [ ] Run focused tests and verify failure.
- [ ] Add runtime issue metadata without removing existing fields.
- [ ] Add health checks for base URL, `/v1/models`, and `/v1/chat/completions` shape.
- [ ] Run focused tests and verify pass.

### Task 3: Wizard and Rescue UI

**Files:**
- Modify: `renderer/app.js`
- Modify: `renderer/styles.css`
- Modify: `test/feedback-repair.test.mjs`

**Interfaces:**
- Uses `state.firstRunWizardOpen`.
- Adds actions `open-first-run-wizard`, `close-first-run-wizard`, `wizard-save`, `wizard-start`, and `copy-integration-guide`.

- [ ] Write source tests for wizard strings and actions.
- [ ] Run focused tests and verify failure.
- [ ] Render wizard overlay and rescue-page entry point.
- [ ] Add environment, port, recommendation, and integration cards.
- [ ] Run focused tests and verify pass.

### Task 4: Verification and Packaging

**Files:**
- Build output: `dist-first-run-rescue/`
- Desktop shortcut: `C:\Users\Administrator\Desktop\Llama.cpp Desktop - First Run Rescue.lnk`

- [ ] Run full test suite.
- [ ] Run syntax checks.
- [ ] Run `git diff --check`.
- [ ] Build `dist-first-run-rescue`.
- [ ] Generate SHA256.
- [ ] Open the inspection build or refresh the desktop shortcut if Windows focus prevents automated foregrounding.
