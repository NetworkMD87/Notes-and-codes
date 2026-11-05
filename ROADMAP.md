# Notes & Codes — Roadmap

Last updated: 2026-11-05

## 🎯 Next up

[MSIX design and trial](#microsoft-store-release-via-msix) — owner decision on starting the planned pass, before Safe Replace and snippet placeholders. v1.22.0 installation is owner-confirmed working with notes/settings preserved. [P2](#p2-bound-large-markdown-preview-work) and [dependency follow-ups](#security-dependencies--2026-10-08-follow-up) remain open.

Open work first; shipped history and settled decisions last. Based on the **2026-09-08 audit of v1.21.0**; reliability fixes and P1 released in **v1.21.1** on **2026-10-02**.

Security dependency follow-up added on **2026-10-08** after checking the current source and live npm advisories. Earlier security fixes remain recorded at their original scope; they do not close newer advisories.

**Legend:** 🐛 open defect · 🛠️ fixed, awaiting release · ⬜ planned · ❓ decision required · 🧊 parked / deferred · 💡 someday · ✅ shipped · **S / M / L** effort where already estimated.

| At a glance | Status / order |
| --- | --- |
| [Security dependencies](#november-security-patch-handoff) | November patches released in v1.22.0; GitHub confirms 27 imported alerts fixed and one minimatch alert open. Earlier S3 qualification decisions are preserved. |
| [Reliability](#1-reliability--completed) | R1–R4 released in v1.21.1. |
| [UI and performance](#2-ui-and-performance--planned) | Libron and the partial P2 optimization released in v1.22.0; U2 and broader P2 work remain open. U1/U3 and P1 retain their earlier release status. |
| [Delivery and existing features](#3-delivery-and-existing-features) | Bounded full CI qualification merged → MSIX design/trial awaits approval → Safe Replace → snippet placeholders. |
| [Feature decisions](#4-feature-ideas--decision-required) | Four suggestions; **none approved or scheduled**. |
| [Parked work](#5-parked-and-deferred) | Retained for later; no implied commitment. |
| Latest release | [v1.22.0](https://github.com/NetworkMD87/Notes-and-codes/releases/tag/v1.22.0): security updates, offline Libron fonts and partial Markdown preview optimization. |

---

## Security dependencies — 2026-10-08 follow-up

### v1.22.0 release and installed acceptance

- [x] **Release v1.22.0 — Published 2026-11-05.** Installer and portable assets were built from tag `v1.22.0` at `ea787a1`; Windows CI and four packaged runtime/font checks passed.
  Defender scans, uploaded hashes/sizes and independent public-download checks passed. [Release](https://github.com/NetworkMD87/Notes-and-codes/releases/tag/v1.22.0); [evidence and limits](docs/release-1.22.0-evidence.md).
- [x] **Installed-app acceptance — Owner-confirmed 2026-11-05.** The owner reports v1.22.0 installed and working fine, with existing notes and settings present. This is general installed acceptance, not separate verification of every feature or manual test. [Evidence and remaining limits](docs/release-1.22.0-evidence.md#owner-installed-acceptance).

### November security patch handoff

- [x] **NC-01/02 — Parser and shipped-runtime patches released in v1.22.0 (2026-11-05).** Markdown-it **14.3.3**, DOMPurify **3.4.17** and Electron **43.8.4**; release-age safeguard retained.
  Malformed-reference guards failed before repair and passed after; build, unit, type and focused Electron checks passed. [Results and limits](docs/release-1.22.0-evidence.md).
- [x] **NC-03 — Conditional findings assessed (2026-11-05).** Conservative parser/sanitizer options remain; the imported #1/#5 explanation swap is corrected in the [release evidence](docs/release-1.22.0-evidence.md). Both render outputs retain sanitization and ordinary reference links.
- [x] **NC-04 — Compatible tooling patches delivered with v1.22.0 (2026-11-05).** Vite **7.3.7**, Vitest/mocker **4.1.12**, Undici **6.29.1 / 7.30.1**, fast-uri **3.1.9**; matching Vitest siblings updated together.
  Full audit: six moderate entries in one minimatch chain; production audit: zero. Prior HTTP-cache and sprintf qualifications were not repeated. [Release evidence](docs/release-1.22.0-evidence.md).
- [ ] **NC-04 residual — Blocked upstream.** Await a compatible minimatch parent fix; even app-builder-lib **26.18.1** still requests minimatch **^10.2.5**. The flaw requires optimization level **2+**, while inspected callers use **1**. No forced major override or suppression. [Advisory and qualification](docs/release-1.22.0-evidence.md#remaining-advisories-and-acceptance-limits).

### Earlier dependency work

- [x] **S1 — Markdown linkification** — released in v1.21.2. Dependency-floor and linkification regressions passed; broader preview profiling remains P2. [Historical detail](docs/roadmap-archive.md#earlier-security-dependency-history).
- [x] **S2 — Electron runtime and remembered dialog folders** — released in v1.21.2. Local and CI checks have recorded limits; native-picker and installed replacement were not manually exercised. [Release evidence](docs/release-1.21.2-evidence.md); [historical detail](docs/roadmap-archive.md#earlier-security-dependency-history).
- [ ] **S3 — Upstream dependency follow-ups.** HTTP-cache 4.3.0 failed qualification; retain 4.2.0 and sprintf-js 1.1.3 until fixes are qualified. The rejected global-agent override stays excluded. [Evidence and prior audit](docs/packaging-dependency-follow-up-2026-10-13.md); [historical detail](docs/roadmap-archive.md#earlier-security-dependency-history).
- [x] **S4 — Compatible dependency fixes** — released in v1.21.2. The 2026-10-08 production audit had zero warnings; S3 remains open. [Evidence](docs/packaging-dependency-evidence-2026-10-08.md#s4-and-proxy-replacement-qualification).

Next runtime upgrade: move to a supported major before [Electron 43 support ends on 2027-01-05](https://releases.electronjs.org/schedule), accounting for Electron 44's clipboard migration.

---

## 1. Reliability — completed

R1–R4 shipped in v1.21.1: shared split-pane models, ordered saves that preserve newer edits, rename-safe open paths, and buffer-bound history actions. See [CHANGELOG.md](CHANGELOG.md#1211--2026-10-02) and [retained validation evidence](docs/roadmap-evidence-2026-10-08.md). Stored history/highlight migration across rename remains parked below.

---

## 2. UI and performance — planned

### UI / keyboard access

- [x] ✅ **Libron font choice — released in v1.22.0 (2026-11-05).** Bundled regular, italic, bold and bold italic for offline editor/interface use. Defaults remain; Windows menus/dialogs use the system font.
  Packaged [font-loading/restart checks](tests/smoke/libron.spec.ts) passed; general installed acceptance is owner-confirmed, without a separate font-specific owner test. [Release evidence](docs/release-1.22.0-evidence.md).

### U1: Keep context menus inside the window

- [x] ✅ **U1 — Keep context menus inside the window — released in v1.21.3.** Shared menus flip/clamp with an 8px edge gap, wrap long labels, scroll focused items and close on resize. Opening animation preserves the bounds. [Source](src/renderer/contextMenu.ts).
  **2026-10-09:** local and packaged checks passed within their recorded scope. [Implementation evidence](docs/ui-menu-tab-evidence-2026-10-09.md); [release limits](docs/release-1.21.3-evidence.md).

### U2: Keyboard-accessible folder tree

- [ ] **U2 — Keyboard-accessible folder tree.** Add focusable tree items, arrow navigation, expansion state, and keyboard context-menu access. Verify that browsing and New/Rename/Delete work without a pointer. [Source](src/renderer/sidebar.ts).
### U3: Distinguish same-named tabs

- [x] ✅ **U3 — Distinguish same-named tabs — released in v1.21.3.** Saved-file duplicates show minimal folder suffixes with distinguishing characters retained under truncation. Full-path tooltips and accessible labels expose file identity and unsaved status. [Source](src/renderer/tabBar.ts).
  **2026-10-09:** focused layout, file-action, typing and packaged identity checks passed. [Implementation evidence](docs/ui-menu-tab-evidence-2026-10-09.md); [release limits](docs/release-1.21.3-evidence.md).

---

### P2: Bound large Markdown preview work

- [ ] **Partial — direct-node insertion released in v1.22.0 (2026-11-05).** The 2026-10-19 optimization (`825c28f`) removes repeated HTML parsing. Large-fixture insertion fell from 92–130 ms to 29–76 ms; total time including layout remains variable. [Source](src/renderer/markdownPreview.ts).
  - **Validation:** build/typecheck, 54 focused units and passing results for all 11 affected Electron smoke tests; sanitizer bypass made its guard fail, then exact restoration passed. Export strings, sanitization, task rendering, focus and scroll are preserved. [Measurements, retained failures and review](docs/markdown-preview-performance-2026-10-19.md).
  - **Remaining:** sanitization/layout still block large previews after the existing debounce fires. No consistent overall latency gain or complete P2 solution is claimed. A size-based preview policy requires owner UX approval; broader large-file mode remains a separate someday idea.

---

## 3. Delivery and existing features

The reliability fixes are released; the remaining delivery sequence follows. The CI experiment is not a release blocker.

### CI renderer smoke support

- [x] **CI renderer smoke support — qualified and merged (2026-10-11).** [PR #42](https://github.com/NetworkMD87/Notes-and-codes/pull/42), merge `ada02e6`; two consecutive native full runs passed all **192 tests**, zero retries.
  Push/PR CI checks build and units; smoke remains manual-only, with automatic gating requiring an owner decision. [Qualification, retained failures and limits](docs/roadmap-archive.md#ci-renderer-smoke-qualification-chronology).

---

### Local test type checking

- [x] **Test-maintenance batch — verified 2026-10-19, committed as `14b14b2`.** Added local `npm run typecheck:tests` and repaired fixture/helper types without changing assertions or app behavior.
  Build, strict types, focused units/Electron checks and deliberate type-error guards passed. Build/CI policy is unchanged. [Scope and evidence](docs/test-type-maintenance-2026-10-19.md).

---

### Microsoft Store release via MSIX

- [ ] **Microsoft Store release via MSIX** (**M**, after the reliability work and CI trial) — a design-and-trial pass, not a repackage-and-submit exercise.
  - MSIX virtualises registry writes. Explorer context-menu registration and launch-on-login must therefore use Store manifest declarations or be hidden in Store builds; a packaged-only gate would silently no-op.
  - Use `process.windowsStore` as the Store-specific branch. Decide the Explorer integration and startup-task behaviour, then configure the `appx` target, account/identity, IARC rating, privacy-policy URL, Store listing/screenshots, and certification submission.
  - The Store channel is Microsoft-signed; direct downloads remain a separate signing decision.

- [ ] **Safe Replace in Files** (**L**, after MSIX) — preview the change set; let users opt files in/out; snapshot history before writes; use atomic writes and stale-mtime conflict checks; make destructive scope unmistakable. Keep it separate from Find in Files.

- [ ] **Snippet placeholders / tabstops** (**M–L**, after Safe Replace) — VS Code-style `$1` and abbreviation expansion. Prefer Monaco’s snippet support; design placeholder syntax, malformed-snippet behaviour, and keyboard navigation before implementation.

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

- [ ] **Installed taskbar identity icon** (**M**) — parked by the owner on 2026-08-17 as a low-priority cosmetic defect. An installed packaged build can still show `{N&C}` on the Windows taskbar at 125% / dark theme where the small `{&}` identity is required. Both the in-place and clean-install experiments failed; do not repeat artifact-only, `WM_GETICON`, Alt+Tab, or `win-unpacked` checks as though they close this.
  - When revisited, trace the taskbar’s live identity source and selected ICO frame while retaining the small-size `{&}` / large-size `{N&C}` contract.
  - Acceptance: observe the exact installed packaged build at 100%, 125%, and above-125% DPI in light and dark taskbar themes. Automated/artifact evidence is supporting evidence only.
  - This no longer blocks MSIX, but must be resolved before another taskbar-icon claim is marked fixed.
- [ ] **Purchased code-signing certificate** (**M**) — only revisit for the unsigned direct-download channel after the Store path is live or if direct downloads remain primary.
- [ ] **Native Windows 11 top-level “Open with”** (**L**) — `IExplorerCommand` integration so it is not under “Show more options”.
- [ ] **Re-harmonize theme chrome hues** — avoid altering canonical upstream theme colours without a compelling design reason.
- [ ] **One gradient moment** — low-value visual experiment.

---

### Deferred extensions to shipped features

- [ ] **File History:** add restore confirmation; consider a total storage budget beyond the existing 50 versions per file. Orphan cleanup is already shipped; the proposed status-bar entry was superseded by the toolbar command.
- [ ] **Preserve history/highlights across rename:** migrate stored records to the new path, including folder descendants. Separate from R3's open-tab/save-path fix; startup cleanup currently removes confirmed-missing source records instead of migrating them.
- [ ] **Save before closing a tab:** decide whether to offer Save / Don't Save / Cancel instead of the current discard confirmation. This historical UX suggestion is not approved for implementation.
- [ ] **Markdown export:** relative-image embedding; custom page size/margins; batch export; code syntax highlighting.
- [ ] **Autosave:** untitled-buffer support; per-file opt-out; configurable delay.
- [ ] **Format Document:** configurable options UI; more languages; `.prettierrc` discovery.
- [ ] **Folder mode:** drag-to-move; cut/copy/paste; multi-root; `.gitignore` awareness.
- [ ] **Text highlighter:** re-anchor after external edits; highlights panel; export highlights to HTML/PDF; custom colour picker; Edit-menu command; keyboard-only painting.
- [ ] **Tab animation:** live-shift / FLIP animation for neighbouring tabs while reordering.
- [ ] **Find in Files:** regex search only after its safety/performance model is designed; streaming results if measurements still justify it.
- [ ] **In-app Help:** dedicated hotkey (without conflicting with Monaco); clickable commands; generated content; shared shortcut constants.

---

### Long-horizon ideas

- [ ] **Large-file mode** — lazy load / feature degradation above a size threshold (**M**).
- [ ] **Cloud sync** for session, snippets, and settings (**L**).
- [ ] **Plugin / extension hooks** (**L**).
- [ ] **Linux distribution and installer support** (**L**) — choose supported architectures, distributions, and package formats; audit case-sensitive path handling and gate or replace Windows-only integrations; add Linux build, unit, smoke, and installed-package validation before calling Linux supported.
- [ ] **macOS build and distribution** (**M–L**).

---

### Small maintenance follow-up

- [ ] **Unused full-settings-save IPC:** consider removing `saveSettings` from the renderer API, preload, and handler; renderer callers already use `updateSettings`. Preserve the store's internal save behavior and tests. This is cleanup, not an open settings-write defect.

**Audit-record reconciliation (2026-09-08):** the historical checklist has no unchecked findings. The valid deferred items above were checked against current source; stale orphan-pruning work was removed. Rejected `fsync` and speculative Windows rename retries are not queued. See [the audit review note](AUDIT-CHECKLIST.md#2026-09-08-backlog-review) for scope and evidence.

---

## 6. Shipped and settled

[Detailed historical evidence and CI chronology](docs/roadmap-archive.md).

| Release | Outcome |
| --- | --- |
| **v1.22.0** · 2026-11-05 | Markdown/runtime security patches, offline Libron fonts, partial preview optimization and stronger test tooling. Owner confirms installation works and notes/settings are preserved. [Release evidence](docs/release-1.22.0-evidence.md). |
| **v1.21.3** · 2026-10-09 | Context menus stay within the window; same-named tabs show distinguishing folder labels and accessible file identities. [Release evidence](docs/release-1.21.3-evidence.md). |
| **v1.21.2** · 2026-10-08 | Electron and Markdown security updates, compatible packaging/tooling dependency fixes, and remembered dialog folders. [Release evidence](docs/release-1.21.2-evidence.md). |
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

_Track implementation, verification and release separately; keep outstanding qualification and owner decisions open._
