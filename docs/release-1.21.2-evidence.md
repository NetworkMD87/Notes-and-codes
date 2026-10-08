# v1.21.2 release evidence — 2026-10-08

## Source and delivery

- Reviewed all commits since v1.21.1: PR #36 supplies Electron/Markdown updates and remembered dialog directories; PR #37 supplies compatible packaging/tooling fixes, proxy regression coverage and version 1.21.2.
- PR #37 and merged-master Windows build/unit CI passed. Release tag `v1.21.2` points to `32197c3a8489b927017932b5aabab71a4f597d2b`.
- [GitHub release](https://github.com/NetworkMD87/Notes-and-codes/releases/tag/v1.21.2) is published with both executables; GitHub asset SHA-256 digests and sizes match the local files.
- The final Windows x64 NSIS and portable files were rebuilt after creating the tag. Earlier QA outputs and the cancelled candidate output were not published.

## Validation and limits

- Final packaged metadata identifies version 1.21.2 (Windows product version 1.21.2.0). Its ASAR contains 3,088 entries and none of the inspected electron-builder, app-builder-lib, global-agent or Electron-get package paths.
- Final dependency tree: 1,079 unit tests across 100 files passed; build/typecheck and Windows CI passed.
- Existing focused Electron checks covered the runtime/sandbox, clipboard IPC, remembered dialog directories across restart, popup/navigation denial and real HTML/PDF export. Packaged-app checks used isolated profiles and mocked only the native picker.
- Full local UI run (181 tests, six workers) was cancelled because of machine load. It is incomplete, not green. Preserved reports contain 16 cleanup errors, 18 timeouts/closed-renderer failures, and two test-body mismatches.
- A one-worker follow-up passed session persistence; close-tab and overwrite-warning checks timed out under the original 30-second deadline. A bounded follow-up with a 90-second deadline passed settings persistence, overwrite warnings and queued saves. Close-tab app assertions passed; cleanup failed with Windows `EPERM` removing its temporary profile. Earlier failed receipts remain preserved.
- The final build used two CPU cores with no parallel test run. No additional full unit/UI suite was repeated after green CI.
- Manual tray/hotkey checks are optional per the owner's instruction. Native picker interaction and installed-app replacement were not manually exercised.
- Production npm audit snapshot: zero warnings. Nine development-tool entries remain (one high, eight moderate), with the upstream/age-gated chains recorded in [dependency evidence](packaging-dependency-evidence-2026-10-08.md). The incompatible global-agent 4.1.3 replacement was rejected; compatible 3.0.0 is retained.

## Release files

The repository-output scan was skipped by Defender. A custom scan of temporary copies completed and reported no threats, without changing security settings.

| File | SHA-256 |
| --- | --- |
| Setup executable | `2ab3dfadb4931d0f59d306575897aa56eb5d1d42bf86fbb5fe1487670a6da4cd` |
| Portable executable | `758df6bfa6f44bdf84e5b3b956f9cfa1421090f4e8f69c2b532afd158b0492c1` |

## Retained local receipts

The ignored `.superpowers/release-1.21.2-*` logs retain the interrupted full run, error contexts, both focused rechecks, cancelled candidate packaging and final packaging. Local receipts are not shipped in the application.
