# Task 5: Release Contract And Build Evidence Report

## What I Implemented

- Added `test/release-contract.test.mjs` to prove that all `dist-*` outputs are ignored, the release workflow validates a strict `vX.Y.Z` tag against `package.json.version`, and the configured exe/checksum assets plus generated release notes are present.
- Added `dist-*/` to `.gitignore` so isolated build output is not tracked.
- Added a PowerShell release-contract step to `.github/workflows/release.yml`. It rejects tags that are not `vX.Y.Z` and tags that do not equal `v` plus the package version.
- Aligned the release title with the package product name, enabled generated release notes, and added static Assets, Known limitations, and Configuration migration sections.
- Added a reproducible isolated-build and SHA-256 evidence block to `spec/evidence-template.md`.

## TDD Evidence

### RED

Command:

```powershell
node --test test/release-contract.test.mjs
```

Output:

```text
tests 3
pass 0
fail 3
```

The three failures were expected: `.gitignore` lacked `dist-*/`; the workflow lacked the strict semver/package-version validation text; and the release action lacked `generate_release_notes: true`.

### GREEN

Command:

```powershell
node --test test/release-contract.test.mjs
```

Output:

```text
tests 3
pass 3
fail 0
```

## Verification Evidence

### Full test suite

Command:

```powershell
npm test
```

Result: 35 tests passed, 0 failed, 0 cancelled, 0 skipped.

### Isolated Windows portable build

Command:

```powershell
npx electron-builder --publish never --config.directories.output=dist-spec-stabilization
```

Result: the portable packaging process produced `dist-spec-stabilization\Llama.cpp-Desktop.exe`.

### Package and checksum verification

Command:

```powershell
$exe = 'dist-spec-stabilization\Llama.cpp-Desktop.exe'
$hash = (Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash
"$hash  Llama.cpp-Desktop.exe" | Set-Content 'dist-spec-stabilization\Llama.cpp-Desktop.exe.sha256' -Encoding ascii
Get-FileHash -LiteralPath $exe -Algorithm SHA256
```

Results:

```text
Package path: dist-spec-stabilization\Llama.cpp-Desktop.exe
Executable size: 90849323 bytes
SHA256: AB8B4BCE1170D04004B97074B6BFA110A3B439EA6969702A44D1AF0163930D5B
Checksum path: dist-spec-stabilization\Llama.cpp-Desktop.exe.sha256
Checksum content: AB8B4BCE1170D04004B97074B6BFA110A3B439EA6969702A44D1AF0163930D5B  Llama.cpp-Desktop.exe
```

The executable exceeds 10 MB. `git check-ignore -v -- dist-spec-stabilization/Llama.cpp-Desktop.exe dist-spec-stabilization/Llama.cpp-Desktop.exe.sha256` reported `.gitignore:6:dist-*/` for both files. The generated `dist-spec-stabilization` output remained untracked and ignored.

### Diff checks

Commands:

```powershell
git diff --check
git diff --cached --check
```

Result: both checks exited successfully with no whitespace errors.

## Commit

Commit: `447f456 ci: enforce release version contract`

Files staged and committed:

- `.github/workflows/release.yml`
- `.gitignore`
- `spec/evidence-template.md`
- `test/release-contract.test.mjs`

`package-lock.json` was pre-existing unstaged work and was deliberately not staged or committed.

## Self-Review Findings

- The workflow's strict version gate runs before dependency installation and compares `github.ref_name` to the parsed `package.json.version`.
- The portable artifact name remains `Llama.cpp-Desktop.exe`, and the checksum file uses the same basename. The release title uses the configured product name followed by the validated tag.
- No runtime, chat, attachment, or terminal-log files were changed.

## Concerns And Limitations

- The local `electron-builder` parent process returned after launching its `7za.exe` archive worker. The worker completed successfully and produced the verified portable exe, but the parent command's captured log stopped while compression was still in progress.
- The builder generated ignored intermediate output (`win-unpacked`, an archive scratch file, and `builder-debug.yml`). None was staged.
- Git emitted standard local line-ending warnings that LF will become CRLF on a future Git touch; `git diff --check` found no whitespace errors.
- The GitHub Actions workflow was not executed remotely, and no tag, push, or GitHub Release was created.

---

## Fix Appendix: Release Contract Test Review Follow-up

### What Changed

- Strengthened `test/release-contract.test.mjs` to parse `package.json` and `electron-builder.yml` instead of hard-coding the portable asset names.
- The test now derives the executable and checksum paths from `directories.output` and `artifactName`, verifies the package and builder product names agree, and checks the derived release title and asset paths in the workflow.
- Added assertions for the exact PowerShell mismatch guard, `if ($tag -ne $expectedTag)`, and its rejection message.

### RED

Command:

```powershell
node --test test/release-contract.test.mjs
```

Output:

```text
tests 4
pass 3
fail 1
AssertionError: release contract tests derive artifact identity from package and builder configuration
```

This failed as expected because the original shallow test only searched the workflow text and did not read either `package.json` or `electron-builder.yml`.

### GREEN

Command:

```powershell
node --test test/release-contract.test.mjs
```

Output:

```text
tests 3
pass 3
fail 0
cancelled 0
skipped 0
```

### Full Verification

```powershell
node --test test/release-contract.test.mjs
npm test
git diff --check
```

Results:

- Focused release-contract test: 3 passed, 0 failed.
- Full `npm test`: 35 passed, 0 failed, 0 cancelled, 0 skipped.
- `git diff --check`: completed with no whitespace errors.

### Files Changed

- `test/release-contract.test.mjs`
- `.superpowers/sdd/task-5-report.md`

### Electron-builder

Skipped. This fix changes only release-contract coverage and the task report; `electron-builder.yml`, the workflow artifact configuration, and the prior verified output names are unchanged.

### Concerns

- The workflow was not executed remotely, and no tag, push, or GitHub Release was created.
- `package-lock.json` remains a pre-existing unstaged change and was not staged or committed.

---

## Fix Appendix: Checksum Manifest Label Follow-up

### What Changed

- Added a release-contract assertion that derives the checksum manifest filename label from `executableName` and verifies it appears after the SHA-256 hash before `Set-Content`.

### RED

Command:

```powershell
node --test test/release-contract.test.mjs
```

Result: 2 passed, 1 failed. The failure was expected after temporarily changing the workflow manifest label to `stale.exe`; the assertion rejected the missing derived `Llama.cpp-Desktop.exe` label.

### GREEN And Verification

```powershell
node --test test/release-contract.test.mjs
npm test
git diff --check
```

Results:

- Focused release-contract test: 3 passed, 0 failed.
- Full `npm test`: 35 passed, 0 failed, 0 cancelled, 0 skipped.
- `git diff --check`: completed with no whitespace errors.

### Scope And Concerns

- Only `test/release-contract.test.mjs` and this report were changed by the fix.
- `package-lock.json` remains a pre-existing unstaged change and was not staged.
- `electron-builder` was not rerun; no tag, push, or release was created.
