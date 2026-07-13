# Product Closure Design - 2026-07-12

## Goal

Close the remaining product gaps found in PM review so the app feels like a first-time Windows launcher, not only a developer control panel.

## Product Decisions

- The first screen must show a clear next step before the chat box, with actions for setup, port check, download help, and diagnostics.
- Small windows must reflow instead of clipping the hero, run-check strip, composer, or service actions.
- Run-check counts must be expandable and explain which item needs action, why it matters, and which button to press next.
- Port repair should detect likely occupation, suggest a safe alternate port, and apply it without killing another process.
- Hardware recommendations must use real local CPU and memory data when available, while staying conservative about VRAM.
- Third-party validation should include a real local OpenAI-compatible smoke test, not only copyable URLs.
- Model capability should use a local heuristic catalog and label unknown capabilities honestly.
- Feedback should be one-click copyable with enough context for support.
- Packaging should produce a release-candidate build and refreshed desktop shortcut, but must not push, tag, or publish a GitHub release without separate confirmation.

## Surfaces

- Main empty/chat screen: onboarding action panel and expandable run-check details.
- Rescue settings page: download help, port repair, hardware-aware recommendation, third-party smoke test, model capability catalog, feedback bundle, release-candidate evidence.
- Main process IPC: system info, port inspection, and client smoke test.
- Preload API: exposes the new IPC methods without breaking existing names.

## Acceptance Criteria

- Tests cover the pure product helper outputs and renderer/main source contracts.
- `npm test`, JS syntax checks, and `git diff --check` pass.
- Visual audit captures main screen, first-run wizard, and rescue settings at desktop and narrow widths.
- A `dist-release-candidate` package is built and a desktop shortcut points at the latest unpacked exe.
- Remaining non-automated items are explicitly labeled as external/manual, not counted as passed.
