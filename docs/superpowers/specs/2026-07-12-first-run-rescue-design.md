# First Run Rescue Design - 2026-07-12

## Goal

Move from "the app explains common failures" to "the app actively guides a first-time user through a successful local llama.cpp setup." The design keeps the existing desktop control-panel style and adds a persistent, inspectable path for startup, environment, port, and parameter decisions.

## Product Decisions

- Use a progressive first-run wizard, not a separate onboarding app. It opens automatically when `llama-server.exe` or the GGUF model is missing, and it can be reopened from Settings.
- Treat missing `llama-server.exe`, missing model, and missing `mmproj` path as blockers. Treat suspicious runtime DLL/package issues as warnings unless the server executable is missing.
- Make port diagnosis explain what was tested: base URL, `/v1/models`, and chat completions endpoint. The app should distinguish "service not started", "port responded but is not OpenAI-compatible", and "OpenAI endpoint is healthy".
- Provide recommendations as conservative starting points, not promises. Model-size and resource hints should say "try this first" and avoid claiming exact VRAM fit.
- Keep third-party setup copyable and concrete: Base URL, API Key hint, model name, and client-specific labels for Cherry Studio and Open WebUI.

## User-Facing Surfaces

- First-run wizard panel with five steps: runtime folder, model file, environment integrity, save/start/check port, third-party integration.
- Environment integrity cards showing runtime package classification, CUDA/ggml DLL clues, and exact next action.
- Port diagnosis card with status, endpoint results, and next action.
- Model recommendation card that derives a safe starting profile from the model filename and current config.
- Existing rescue page gains a button to reopen the wizard and shows the richer diagnostics.

## Acceptance Criteria

- Pure tests cover wizard visibility, environment integrity rows, port diagnosis, and model recommendation copy.
- `llama:test-health` returns a richer but backward-compatible object: existing `ok`, `status`, `url`, and `message` stay present.
- `validation` remains backward-compatible while adding runtime issue metadata.
- UI source contains discoverable entry points for "首次启动向导", "环境完整性", "端口诊断", and "推荐参数".
- Full tests, syntax checks, package build, and desktop shortcut refresh complete before handoff.
