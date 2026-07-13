# Feedback Repair Implementation Plan

## Phase 1 - Product Diagnosis Helpers

- Add `renderer/lib/feedback-repair.js`.
- Cover startup package, first-run steps, third-party integration, performance hints, and support bundle text with tests.

## Phase 2 - Runtime Validation

- Extend main-process validation with stable path metadata.
- Keep existing `configExists`, `serverExists`, `modelExists`, and `mmprojExists` fields unchanged.

## Phase 3 - Settings Rescue Surface

- Add a "启动救援" settings tab.
- Render checklist, failure explanations, third-party API copy, resource warnings, and multimodal truth-in-copy.
- Add copy handlers for integration and support bundle text.

## Phase 4 - Verification and Packaging

- Run the full test suite and syntax checks.
- Build a fresh Windows package.
- Update/open the desktop shortcut so the user can inspect the app.
