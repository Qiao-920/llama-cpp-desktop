# Product Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the launcher from a technical chat shell into a productized local-LLM workbench with clear readiness, model capability, diagnostics, and handoff affordances.

**Architecture:** Add small pure renderer helpers for product insights and diagnostics, then render them inside the existing chat, settings, and terminal surfaces without redesigning the application shell. Keep Electron IPC contracts stable and avoid touching runtime state persistence unless a visible product workflow needs it.

**Tech Stack:** Electron 41, vanilla JavaScript modules, Node test runner, existing CSS.

## Global Constraints

- Preserve existing user config, history, runtime state, and the pre-existing unstaged `package-lock.json`.
- Do not push, tag, publish a GitHub Release, or clean the current worktree.
- Keep the existing quiet desktop-tool visual language; no landing page, marketing hero, or decorative redesign.
- Add tests before production behavior changes.
- The final app must be opened locally for user inspection.

---

### Task 1: Product Insight Helpers

**Files:**
- Create: `renderer/lib/product-insights.js`
- Create: `test/product-insights.test.mjs`

**Interfaces:**
- Produces `readinessChecklist({ config, validation, status, dirty })`.
- Produces `modelCapability({ config, modelInfo })`.
- Produces `terminalDiagnosis({ status, logs, terminalView })`.
- Produces `sessionBudget({ config, messages })`.
- Produces `diagnosticBundleText({ config, status, logs, terminalView })`.

- [ ] **Step 1: Write failing helper tests**

Run: `node --test test/product-insights.test.mjs`

Expected: fail because the module does not exist.

- [ ] **Step 2: Implement helpers**

Expected behavior:
- Readiness groups config file, llama-server, model file, service running, saved config, and endpoint into actionable checklist rows.
- Model capability labels text-only vs vision-ready based on `mmproj` and model info.
- Terminal diagnosis returns a human-readable status, risk level, and next action using log stats and status state.
- Session budget reports configured context and approximate used tokens from message metadata.

- [ ] **Step 3: Run GREEN**

Run: `node --test test/product-insights.test.mjs`

- [ ] **Step 4: Commit**

Commit message: `feat: add product insight helpers`

---

### Task 2: Chat And Settings Product Surface

**Files:**
- Modify: `renderer/app.js`
- Modify: `renderer/styles.css`
- Modify: `test/product-insights.test.mjs`

**Interfaces:**
- Consumes helpers from `renderer/lib/product-insights.js`.

- [ ] **Step 1: Add tests for product copy/derived states**

Use helper-level tests for copy and status classifications rather than brittle DOM regex where possible.

- [ ] **Step 2: Render readiness and model capability**

Add a compact "运行检查" strip above the composer or at the top of the chat surface showing pass/warn/block counts and the next action.

Add a "模型能力" card in the model info panel covering model file, quantization, context, endpoint, multimodal readiness, and whether image/PDF/audio are actually supported or source-inspected.

- [ ] **Step 3: Improve tool discoverability**

Ensure icon-only message actions have concrete `title` labels and user-facing Chinese copy where visible.

- [ ] **Step 4: Run verification**

Run: `npm test && node --check renderer/app.js && git diff --check`

- [ ] **Step 5: Commit**

Commit message: `feat: surface model readiness in chat`

---

### Task 3: Terminal Diagnostic Experience

**Files:**
- Modify: `renderer/app.js`
- Modify: `renderer/styles.css`
- Modify: `test/product-insights.test.mjs`

**Interfaces:**
- Consumes `terminalDiagnosis`.

- [ ] **Step 1: Add tests for terminal diagnosis**

Cover running, error, noisy logs, hidden logs, and empty terminal states.

- [ ] **Step 2: Render diagnostic summary**

Above raw logs, add a product-facing summary with health, last meaningful event, counters, and next action.

Keep raw logs visible and scrollable, but label them as detail.

- [ ] **Step 3: Add diagnostic export affordance**

Add a button that copies a compact diagnostic bundle to clipboard: status, endpoint, model path basename, log stats, and recent terminal lines.

- [ ] **Step 4: Run verification**

Run: `npm test && node --check renderer/app.js && git diff --check`

- [ ] **Step 5: Commit**

Commit message: `feat: productize terminal diagnostics`

---

### Task 4: Product QA, Package, And Open

**Files:**
- Modify: `spec/evidence/2026-07-10-spec-stabilization.md` if the verification result changes.

- [ ] **Step 1: Run full gate**

Run: `npm test; node --check desktop/main.mjs; node --check desktop/preload.cjs; node --check renderer/app.js; git diff --check; git status -sb`

- [ ] **Step 2: Rebuild portable app**

Run: `npx electron-builder --publish never --config.directories.output=dist-product-polish`

Generate `dist-product-polish/Llama.cpp-Desktop.exe.sha256`.

- [ ] **Step 3: Launch app**

Open `dist-product-polish/Llama.cpp-Desktop.exe` locally for user inspection.

- [ ] **Step 4: Commit evidence if changed**

Commit message: `docs: record product polish evidence`
