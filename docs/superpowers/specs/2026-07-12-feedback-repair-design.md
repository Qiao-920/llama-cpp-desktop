# Feedback Repair Design - 2026-07-12

## Goal

Turn the most common public feedback from the launch video into in-product repair paths. The product should not only show that a file or service is missing; it should tell a first-time Windows user what went wrong, why it matters, and the next action.

## Feedback Themes

- Startup fails because the user selected a CUDA runtime package or a directory without `llama-server.exe`.
- Model path, saved config, and port state are hard to understand before pressing start.
- Users do not know which URL and model name to paste into Cherry Studio, Open WebUI, or other OpenAI-compatible clients.
- Image upload creates a false expectation that any GGUF can understand images.
- Large context, GPU layers, and batch parameters can fill memory or make the app look frozen.
- Current UI has pieces of the answer spread across paths, logs, and settings, but lacks one guided rescue surface.

## Product Shape

Add a compact "启动救援" tab in Settings and surface the same core diagnosis in the chat readiness strip. This tab should include:

- First-run checklist with clear pass/warn/block states.
- Startup package diagnosis for `llama-server.exe`, CUDA runtime-only folders, model file, config save state, and service state.
- Third-party integration copy blocks for Base URL, Chat Completions URL, and model name.
- Performance guardrails for context size, GPU layers, batch size, timeout, and host binding.
- Multimodal explanation that image understanding needs both a vision model and matching `mmproj`.
- A copyable diagnostic summary that can be pasted into support conversations.

## Acceptance Criteria

- Pure helper tests cover startup, integration, performance, and first-run guidance.
- Main process extends `validation` without breaking existing IPC consumers.
- Settings includes a discoverable rescue tab and copy buttons.
- Source tests verify the new UI strings/actions remain present.
- Full test suite, syntax checks, and packaging pass.
