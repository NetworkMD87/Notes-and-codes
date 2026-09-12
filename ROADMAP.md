# Notes & Codes — Roadmap

Open work first; shipped history and settled decisions last. Updated after the **2026-09-08 audit of v1.21.0**.

**Legend:** 🐛 open defect · 🛠️ fixed, awaiting release · ⬜ planned · ❓ decision required · 🧊 parked / deferred · 💡 someday · ✅ shipped · **S / M / L** effort where already estimated.

| At a glance | Status / order |
| --- | --- |
| [Reliability](#1-reliability--fix-first) | One open defect; protect edits first. |
| [UI and performance](#2-ui-and-performance--planned) | Five improvements; agree material UX choices before implementation. |
| [Delivery and existing features](#3-delivery-and-existing-features) | CI smoke trial → MSIX → Safe Replace → snippet placeholders. |
| [Feature decisions](#4-feature-ideas--decision-required) | Four suggestions; **none approved or scheduled**. |
| [Parked work](#5-parked-and-deferred) | Retained for later; no implied commitment. |
| Awaiting release | R3 rename/save paths and R4 stale history actions are fixed, awaiting release. |

---

## 1. Reliability — fix first

One open finding remains. Reproduce each affected flow before changing it; retain the smallest fix that protects the user's edits.

- 🐛 **R1 — Split panes can save stale content.** The same file has independent pane models, while Save prefers pane A. Editing B can therefore save A's older text. Keep one authoritative buffer state across panes, saves, and external reloads.
  - **Accept when:** edits from either pane are reflected in both; Save from either pane writes the latest content; reloading cannot leave a stale peer model. [Source](src/renderer/editorPane.ts), [save/reload wiring](src/renderer/main.ts).

- ✅ **R2 — Saves during edits preserve newer changes.** Same-buffer saves are serialized; an older completion leaves newer content, EOL, and encoding changes dirty, autosave-eligible, and eligible for the close warning. Local evidence: 27 focused and 1,001 full unit tests passed, the build passed, and the delayed-write Electron smoke confirms newer UTF-16 LE/CRLF content is written last. [Source](src/renderer/main.ts), [buffer state](src/renderer/bufferManager.ts), [save coordinator](src/renderer/bufferSaveCoordinator.ts).

- 🛠️ **R3 — Fixed, awaiting release:** Renaming an open file can cause its old filename to reappear on Save; folder renames strand descendant paths. Update affected open-buffer identities and watchers after a successful rename.
  - **Accept when:** file and parent-folder renames preserve edits, update tab paths, and save only to the new location. Stored history/highlight migration remains separately tracked below. [Source](src/renderer/folderMode.ts), [file writes](src/main/fileService.ts).

- 🛠️ **R4 — Fixed, awaiting release:** Restore currently resolves its destination after the history read finishes. Bind it to the originating buffer and invalidate stale actions after dismissal or context changes.
  - **Accept when:** Restore A → dismiss → switch to B during a delayed read never changes B or applies a cancelled restore. Check the delayed Diff action too. [Source](src/renderer/fileHistoryPanel.ts), [restore wiring](src/renderer/main.ts).

**Audit baseline:** typecheck and 994 unit tests across 92 files passed. R2 was reproduced with the pre-fix save function and delayed mocked I/O; the other findings were traced through source. Current R2 implementation evidence is recorded above.

---

## 2. UI and performance — planned

### UI / keyboard access

- ⬜ **U1 — Keep context menus inside the window.** Clamp or flip placement at window edges and bound oversized menus with scrolling. Verify editor, spelling, and folder menus near every edge, including keyboard opening. [Source](src/renderer/contextMenu.ts).
- ⬜ **U2 — Keyboard-accessible folder tree.** Add focusable tree items, arrow navigation, expansion state, and keyboard context-menu access. Verify that browsing and New/Rename/Delete work without a pointer. [Source](src/renderer/sidebar.ts).
- ⬜ **U3 — Distinguish same-named tabs.** Agree full-path tooltips/accessibility labels and minimal parent-folder disambiguation for duplicate filenames; expose unsaved status to assistive technology. Verify bounded tabs remain readable. [Source](src/renderer/tabBar.ts).

---

### Performance

- ⬜ **P1 — Avoid rebuilding every tab on each keystroke.** Update the changed tab's state in place; reserve structural rendering for tab-list changes. Measure typing with many tabs and preserve focus, scrolling, and drag/reorder behavior. [Edit wiring](src/renderer/main.ts), [tab rendering](src/renderer/tabBar.ts).
- ⬜ **P2 — Bound large Markdown preview work.** Profile parsing, sanitization, and full DOM replacement in Electron before choosing an optimization. Consider a size-based preview policy only after UX approval; preserve sanitization, task rendering, focus, and scroll behavior. [Source](src/renderer/markdownPreview.ts).
  - **Evidence limit:** a synthetic 500 KiB document took about 2.4 seconds through rendering and DOM replacement in Node/jsdom. This is not an Electron responsiveness measurement. The existing debounce is already shipped; this item addresses work remaining after it fires. Broader large-file mode remains a separate someday idea.

---

## 3. Delivery and existing features

Existing sequence retained below the reliability work. The CI experiment is not a release blocker.

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
| **v1.21.0** · 2026-09-04 | Markdown authoring tools and smart lists; preview before Save As; safe task checkboxes; clearer responsive Editor settings. |
| **v1.20.0** · 2026-09-03 | Markdown Preview Off, Side by side, and Focus layouts; accessible resizing and focus; optional restoration of mode and divider position across restarts. |
| **v1.19.5** · 2026-08-18 | Optional persistent minimap; wrapped text stays clear of it at startup and after editor-font changes. |
| **v1.19.4** · 2026-08-18 | Tighter and fully themed tab sizing; Find in Files path and selection correctness; distinct Slate TXT and Lime Markdown badges. |
| **v1.19.3** · 2026-08-17 | Responsive bounded tabs keep long filenames, badges, and close controls usable; natural-width tabs remain available in Appearance settings. |
| **v1.19.2** · 2026-08-15 | Electron and build-toolchain security update; offline PDF exports; guarded app navigation; reliable external-change warnings after **Keep mine**. |
| **v1.19.1** · 2026-08-13 | Explorer opens replace only a disposable blank placeholder; the highlighter persists its active colour. |
| **v1.19.0** · 2026-08-09 | Quality, scale, and keyboard-access pass: semantic controls and dialogs, 20k-file responsiveness, workspace exclusions, scoped/cancellable Find in Files, session/preview efficiency, and installed-build accessibility validation. |
| **v1.18.1** · 2026-08-08 | Markdown dependency hardening and deterministic Windows Electron smoke teardown. Production dependency audit clean. |
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
