# Notes & Codes — Roadmap

Open work first; shipped history and settled decisions last. Based on the **2026-09-08 audit of v1.21.0**; reliability fixes and P1 released in **v1.21.1** on **2026-10-02**.

Security dependency follow-up added on **2026-10-08** after checking the current source and live npm advisories. Earlier security fixes remain recorded at their original scope; they do not close newer advisories.

**Legend:** 🐛 open defect · 🛠️ fixed, awaiting release · ⬜ planned · ❓ decision required · 🧊 parked / deferred · 💡 someday · ✅ shipped · **S / M / L** effort where already estimated.

| At a glance | Status / order |
| --- | --- |
| [Security dependencies](#security-dependencies--2026-10-08-follow-up) | S1 Markdown and S2 Electron fixes validated, awaiting release; S3–S4 dependency updates queued. |
| [Reliability](#1-reliability--completed) | R1–R4 released in v1.21.1. |
| [UI and performance](#2-ui-and-performance--planned) | P1 released in v1.21.1; four improvements remain. Agree material UX choices before implementation. |
| [Delivery and existing features](#3-delivery-and-existing-features) | CI smoke trial → MSIX → Safe Replace → snippet placeholders. |
| [Feature decisions](#4-feature-ideas--decision-required) | Four suggestions; **none approved or scheduled**. |
| [Parked work](#5-parked-and-deferred) | Retained for later; no implied commitment. |
| Latest release | v1.21.1: reliable saves, rename/history fixes, and less tab-rendering work. |

---

## Security dependencies — 2026-10-08 follow-up

- 🛠️ **S1 — Markdown linkification fixed, awaiting release.** Updated `markdown-it` from 14.2.0 to 14.3.1 for [GHSA-253c-mchw-3w2r](https://github.com/markdown-it/markdown-it/security/advisories/GHSA-253c-mchw-3w2r), retaining patched `linkify-it`, sanitization and offline exports. Dependency-floor and linkification regression coverage passed. Broader preview profiling remains P2.
- 🛠️ **S2 — Electron runtime fixed, awaiting release.** Updated unsupported 41.10.4 to 43.7.7, the newest 43.x patch permitted by the machine's seven-day npm release-age safeguard on 2026-10-08; 43.7.9 was rejected and the safeguard retained. Open, Save As/untitled export and Open Folder remember separate directories across restarts. First use starts in Documents; previous Windows picker history is not imported. CI explicitly downloads the Electron runtime before smoke tests.
  - **Release gate:** manual native-picker, tray/hotkey and installer acceptance remain outstanding. Local build/typecheck, 1,058 unit tests, 23 focused Electron checks, Windows QA packaging and three packaged-app checks passed. Picker tests mock the OS dialog; no installed-app replacement or release is implied. [Detailed evidence and advisory scope](docs/roadmap-evidence-2026-10-08.md).
  - **Next runtime upgrade:** move to a supported major before [Electron 43 support ends on 2027-01-05](https://releases.electronjs.org/schedule); account for Electron 44's clipboard API migration.

- ⬜ **S3 — Refresh and assess packaging dependencies** — earlier archive/updater fixes are present (`electron-builder` 26.15.3, `tar` 7.5.22, `builder-util-runtime` 9.7.0), but the live audit flags the current packaging tree, including `@electron/get` → `global-agent` → `roarr` → `sprintf-js`, plus affected archive/glob, YAML and XML helpers.
  - **Accept when:** map current advisories to the actual Windows build paths; update the narrowest compatible dependency set and verify the lockfile, build and approved packaging checks. Record any remaining non-applicable warnings with evidence. Do not blindly apply npm's suggested builder downgrade or use `npm audit fix --force`.

- ⬜ **S4 — Triage and update remaining flagged dependencies** — track `dompurify`, `vitest` / `@vitest/mocker`, `sharp`, `source-map-js`, `undici`, `http-cache-semantics`, `fast-uri`, `browserslist`, `baseline-browser-mapping`, `brace-expansion`, `js-yaml`, and `@xmldom/xmldom`; coordinate overlapping packages with S3.
  - **Accept when:** separate shipped runtime exposure from build/test-only and configuration-dependent warnings, choose supported patched versions, and run focused validation for each affected surface. DOMPurify's new warnings concern particular `IN_PLACE` behavior; dependency presence alone does not demonstrate that the app reaches it.

**Evidence boundary:** the pre-fix `npm audit --json --ignore-scripts` reported 23 affected dependency entries (10 high, 12 moderate, 1 low), including indirect warnings. After S1/S2, 21 entries remain (9 high, 11 moderate, 1 low), tracked in S3/S4; Electron and Markdown are no longer flagged. These are dependency warnings, not independently demonstrated app exploits. The screenshot supplied titles without advisory IDs, so the exact historical alert records were not closed. The esbuild cross-origin read, remote renderer override, and document-driven PDF resource-fetch findings remain patched in the inspected source.

---

## 1. Reliability — completed

R1–R4 shipped in v1.21.1: shared split-pane models, ordered saves that preserve newer edits, rename-safe open paths, and buffer-bound history actions. See [CHANGELOG.md](CHANGELOG.md#1211--2026-10-02) and [retained validation evidence](docs/roadmap-evidence-2026-10-08.md). Stored history/highlight migration across rename remains parked below.

---

## 2. UI and performance — planned

### UI / keyboard access

- ⬜ **U1 — Keep context menus inside the window.** Clamp or flip placement at window edges and bound oversized menus with scrolling. Verify editor, spelling, and folder menus near every edge, including keyboard opening. [Source](src/renderer/contextMenu.ts).
- ⬜ **U2 — Keyboard-accessible folder tree.** Add focusable tree items, arrow navigation, expansion state, and keyboard context-menu access. Verify that browsing and New/Rename/Delete work without a pointer. [Source](src/renderer/sidebar.ts).
- ⬜ **U3 — Distinguish same-named tabs.** Agree full-path tooltips/accessibility labels and minimal parent-folder disambiguation for duplicate filenames; expose unsaved status to assistive technology. Verify bounded tabs remain readable. [Source](src/renderer/tabBar.ts).

---

### Performance

- ⬜ **P2 — Bound large Markdown preview work.** Profile parsing, sanitization, and full DOM replacement in Electron before choosing an optimization. Consider a size-based preview policy only after UX approval; preserve sanitization, task rendering, focus, and scroll behavior. [Source](src/renderer/markdownPreview.ts).
  - **Evidence limit:** a synthetic 500 KiB document took about 2.4 seconds through rendering and DOM replacement in Node/jsdom. This is not an Electron responsiveness measurement. The existing debounce is already shipped; this item addresses work remaining after it fires. Broader large-file mode remains a separate someday idea.

---

## 3. Delivery and existing features

The reliability fixes are released; the remaining delivery sequence follows. The CI experiment is not a release blocker.

- ⬜ **CI renderer smoke support** (**S**, before MSIX; trial) — automatic push/PR CI currently runs build + unit tests, while the hosted Electron smoke job is manual-only because Monaco did not reliably paint on GitHub’s Windows runners.
  - Retry the manual hosted suite with software rendering (`--use-gl=swiftshader` and/or `--disable-gpu`) supplied through the Electron launch arguments.
  - Promote smoke to the automatic push/PR gate only if repeated hosted runs are reliable; otherwise record the new evidence and retain the manual hosted job plus the local pre-release gate.

---

### Microsoft Store and feature delivery

- ⬜ **Microsoft Store release via MSIX** (**M**, after the reliability work and CI trial) — a design-and-trial pass, not a repackage-and-submit exercise.
  - MSIX virtualises registry writes. Explorer context-menu registration and launch-on-login must therefore use Store manifest declarations or be hidden in Store builds; a packaged-only gate would silently no-op.
  - Use `process.windowsStore` as the Store-specific branch. Decide the Explorer integration and startup-task behaviour, then configure the `appx` target, account/identity, IARC rating, privacy-policy URL, Store listing/screenshots, and certification submission.
  - The Store channel is Microsoft-signed; direct downloads remain a separate signing decision.

- ⬜ **Safe Replace in Files** (**L**, after MSIX) — preview the change set; let users opt files in/out; snapshot history before writes; use atomic writes and stale-mtime conflict checks; make destructive scope unmistakable. Keep it separate from Find in Files.

- ⬜ **Snippet placeholders / tabstops** (**M–L**, after Safe Replace) — VS Code-style `$1` and abbreviation expansion. Prefer Monaco’s snippet support; design placeholder syntax, malformed-snippet behaviour, and keyboard navigation before implementation.

---

## 4. Feature ideas — decision required

**Each idea needs its own owner decision: adopt, defer, or reject. None is approved, planned for implementation, or assigned a release.** The suggested behavior below is for discussion; agree scope and acceptance before moving any item into planned work.

| Idea | Potential value | Decision needed |
| --- | --- | --- |
| ❓ **Reopen closed tab** | Recover accidentally closed scratch notes, potentially through `Ctrl+Shift+T`. | Whether to add it; retention limits, unsaved-content recovery, selection restoration, and restart behavior. |
| ❓ **Markdown heading picker** | Search headings and jump to their source without a permanent panel. | Whether to add it; entry point, shortcut, and source/preview navigation behavior. |
| ❓ **Command-palette text utilities** | Insert timestamps, copy file paths, sort lines, or remove duplicate lines without more toolbar clutter. | Whether to add any; approve each utility and its selection/document behavior separately. |
| ❓ **Compare buffer with saved file** | Inspect unsaved changes using the existing diff experience. | Whether to add it; command placement and handling of untitled, missing, or externally changed files. |

---

## 5. Parked and deferred

### Platform and design

- 🧊 **Installed taskbar identity icon** (**M**) — parked by the owner on 2026-08-17 as a low-priority cosmetic defect. An installed packaged build can still show `{N&C}` on the Windows taskbar at 125% / dark theme where the small `{&}` identity is required. Both the in-place and clean-install experiments failed; do not repeat artifact-only, `WM_GETICON`, Alt+Tab, or `win-unpacked` checks as though they close this.
  - When revisited, trace the taskbar’s live identity source and selected ICO frame while retaining the small-size `{&}` / large-size `{N&C}` contract.
  - Acceptance: observe the exact installed packaged build at 100%, 125%, and above-125% DPI in light and dark taskbar themes. Automated/artifact evidence is supporting evidence only.
  - This no longer blocks MSIX, but must be resolved before another taskbar-icon claim is marked fixed.
- 🧊 **Purchased code-signing certificate** (**M**) — only revisit for the unsigned direct-download channel after the Store path is live or if direct downloads remain primary.
- 🧊 **Native Windows 11 top-level “Open with”** (**L**) — `IExplorerCommand` integration so it is not under “Show more options”.
- 🧊 **Re-harmonize theme chrome hues** — avoid altering canonical upstream theme colours without a compelling design reason.
- 🧊 **One gradient moment** — low-value visual experiment.

---

### Deferred extensions to shipped features

- 🧊 **File History:** add restore confirmation; consider a total storage budget beyond the existing 50 versions per file. Orphan cleanup is already shipped; the proposed status-bar entry was superseded by the toolbar command.
- 🧊 **Preserve history/highlights across rename:** migrate stored records to the new path, including folder descendants. Separate from R3's open-tab/save-path fix; startup cleanup currently removes confirmed-missing source records instead of migrating them.
- 🧊 **Save before closing a tab:** decide whether to offer Save / Don't Save / Cancel instead of the current discard confirmation. This historical UX suggestion is not approved for implementation.
- 🧊 **Markdown export:** relative-image embedding; custom page size/margins; batch export; code syntax highlighting.
- 🧊 **Autosave:** untitled-buffer support; per-file opt-out; configurable delay.
- 🧊 **Format Document:** configurable options UI; more languages; `.prettierrc` discovery.
- 🧊 **Folder mode:** drag-to-move; cut/copy/paste; multi-root; `.gitignore` awareness.
- 🧊 **Text highlighter:** re-anchor after external edits; highlights panel; export highlights to HTML/PDF; custom colour picker; Edit-menu command; keyboard-only painting.
- 🧊 **Tab animation:** live-shift / FLIP animation for neighbouring tabs while reordering.
- 🧊 **Find in Files:** regex search only after its safety/performance model is designed; streaming results if measurements still justify it.
- 🧊 **In-app Help:** dedicated hotkey (without conflicting with Monaco); clickable commands; generated content; shared shortcut constants.

---

### Long-horizon ideas

- 💡 **Large-file mode** — lazy load / feature degradation above a size threshold (**M**).
- 💡 **Cloud sync** for session, snippets, and settings (**L**).
- 💡 **Plugin / extension hooks** (**L**).
- 💡 **Linux distribution and installer support** (**L**) — choose supported architectures, distributions, and package formats; audit case-sensitive path handling and gate or replace Windows-only integrations; add Linux build, unit, smoke, and installed-package validation before calling Linux supported.
- 💡 **macOS build and distribution** (**M–L**).

---

### Small maintenance follow-up

- 🧊 **Unused full-settings-save IPC:** consider removing `saveSettings` from the renderer API, preload, and handler; renderer callers already use `updateSettings`. Preserve the store's internal save behavior and tests. This is cleanup, not an open settings-write defect.

**Audit-record reconciliation (2026-09-08):** the historical checklist has no unchecked findings. The valid deferred items above were checked against current source; stale orphan-pruning work was removed. Rejected `fsync` and speculative Windows rename retries are not queued. See [the audit review note](AUDIT-CHECKLIST.md#2026-09-08-backlog-review) for scope and evidence.

---

## 6. Shipped and settled

| Release | Outcome |
| --- | --- |
| **v1.21.1** · 2026-10-02 | Reliable split-pane and overlapping saves; rename/save-path and stale-history fixes; in-place tab updates while typing. |
| **v1.21.0** · 2026-09-04 | Markdown authoring tools and smart lists; preview before Save As; safe task checkboxes; clearer responsive Editor settings. |
| **v1.20.0** · 2026-09-03 | Markdown Preview Off, Side by side, and Focus layouts; accessible resizing and focus; optional restoration of mode and divider position across restarts. |
| **v1.19.5** · 2026-08-18 | Optional persistent minimap; wrapped text stays clear of it at startup and after editor-font changes. |
| **v1.19.4** · 2026-08-18 | Tighter and fully themed tab sizing; Find in Files path and selection correctness; distinct Slate TXT and Lime Markdown badges. |
| **v1.19.3** · 2026-08-17 | Responsive bounded tabs keep long filenames, badges, and close controls usable; natural-width tabs remain available in Appearance settings. |
| **v1.19.2** · 2026-08-15 | Electron and build-toolchain security update; offline PDF exports; guarded app navigation; reliable external-change warnings after **Keep mine**. |
| **v1.19.1** · 2026-08-13 | Explorer opens replace only a disposable blank placeholder; the highlighter persists its active colour. |
| **v1.19.0** · 2026-08-09 | Quality, scale, and keyboard-access pass: semantic controls and dialogs, 20k-file responsiveness, workspace exclusions, scoped/cancellable Find in Files, session/preview efficiency, and installed-build accessibility validation. |
| **v1.18.1** · 2026-08-08 | Markdown dependency hardening and deterministic Windows Electron smoke teardown. Production dependency audit was clean at that release; current warnings are tracked in S3/S4. |
| **v1.17.0–v1.18.0** · 2026-08-07 | Fully offline UK/US spell checking, settings and personal dictionary, then right-click corrections and startup file-open readiness fixes. |
| **v1.14.0–v1.16.0** · 2026-07 | Settings home, configurable hotkey, launch-on-login, design polish, Format Document hotkey repair, Find in Files, and sidebar recent folders. |
| **v1.9.0–v1.13.0** · 2026-07 | In-app Help, drag-reorder tabs, visual/token polish, file-type badges, highlighter cursor, taskbar/Explorer identity work, and the completed audit remediation. |
| **v1.0.0–v1.7.0** | Core editor: tabs and splits, themes, recovery and encoding, diffs, snippets and paste history, tray/hotkey, file routing, safety prompts, zoom, file watching, history, Markdown export, autosave, Format Document, folder mode, and highlighting. |

---

### Durable shipped decisions

- ✅ **Hybrid identity:** a fast scratchpad by default; optional folder sidebar and `Ctrl+P` quick-open for project work.
- ✅ **Phase 4.6 verification:** automated checks plus the reported installed-build Narrator, keyboard, pointer, large-workspace, tray/hotkey/login, and Markdown/session validation are complete.
- ✅ **Historical audit record:** the v1.7/v1.12 checklist in [AUDIT-CHECKLIST.md](AUDIT-CHECKLIST.md) is closed at its recorded scope. This does not close the newer findings above. Release history is recorded here and published releases are tagged on `master`.

---

### ❌ Closed decision

- ❌ **Remove accent borders from floating chrome** — rejected after design review; retain the established accent-border convention.

---

_Keep an item here until it is implemented, validated, released, and marked ✅._
