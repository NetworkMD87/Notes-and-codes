# Notes & Codes — Roadmap

Living roadmap. Status is deliberately separate from shipping history so the next work is visible at a glance.

**Legend:** ✅ shipped · 🟢 merged / awaiting release · 🔜 next · ⬜ planned · 🐛 open defect · 🧊 parked / deferred · 💡 someday · **S** small · **M** medium · **L** large

---

## 🟢 Merged — awaiting release

- 🟢 **Find in Files correctness cleanup** (**S**) — merged through PR #22 on 2026-08-17; queued for the next release.
  - **Path normalisation:** `pickFileArg` now returns a normalised absolute path, so a file opened through a relative shell argument cannot also appear as a separate disk-search result.
  - **Selection reset:** query, match-case, whole-word, and scope changes now select the first current result.
  - Verification: the build, all 918 unit tests, and focused Electron smoke guards for both regressions pass.

- 🟢 **TXT and Markdown badge colours** (**S**) — merged on 2026-08-18; plaintext/TXT and new untitled buffers use Slate, while Markdown uses the previously unused Lime badge colour. The shared mapping covers tabs, the sidebar, and Find in Files without colouring the full tab.
  - Verification: the build, all 918 unit tests, and all 152 Electron smoke tests pass under the suite's configured retries; the focused Dark, Light, and High Contrast guard passed first-run.

---

## 🔜 Next — CI renderer smoke support

- 🔜 **CI renderer smoke support** (**S**, before MSIX; trial, not a release blocker) — automatic push/PR CI currently runs build + unit tests, while the hosted Electron smoke job is manual-only because Monaco did not reliably paint on GitHub’s Windows runners.
  - Retry the manual hosted suite with software rendering (`--use-gl=swiftshader` and/or `--disable-gpu`) supplied through the Electron launch arguments.
  - Promote smoke to the automatic push/PR gate only if repeated hosted runs are reliable; otherwise record the new evidence and retain the manual hosted job plus the local pre-release gate.

---

## ⬜ Planned

- ⬜ **Microsoft Store release via MSIX** (**M**, after the small cleanup gate) — a design-and-trial pass, not a repackage-and-submit exercise.
  - MSIX virtualises registry writes. Explorer context-menu registration and launch-on-login must therefore use Store manifest declarations or be hidden in Store builds; a packaged-only gate would silently no-op.
  - Use `process.windowsStore` as the Store-specific branch. Decide the Explorer integration and startup-task behaviour, then configure the `appx` target, account/identity, IARC rating, privacy-policy URL, Store listing/screenshots, and certification submission.
  - The Store channel is Microsoft-signed; direct downloads remain a separate signing decision.

- ⬜ **Safe Replace in Files** (**L**, after MSIX) — preview the change set; let users opt files in/out; snapshot history before writes; use atomic writes and stale-mtime conflict checks; make destructive scope unmistakable. Keep it separate from Find in Files.

- ⬜ **Snippet placeholders / tabstops** (**M–L**, after Safe Replace) — VS Code-style `$1` and abbreviation expansion. Prefer Monaco’s snippet support; design placeholder syntax, malformed-snippet behaviour, and keyboard navigation before implementation.

- 💡 **Markdown Preview layout modes** (**M**) — add an outer editor-group/Preview split while keeping the A/B editor split inside the editor group. Provide a draggable gutter, minimum sizes, and explicit `off | side-by-side | focus` modes; preserve focused-pane content selection, live refresh, and focus return. Smoke-test dragging, limits, and mode transitions.

---

## 🧊 Parked and deferred — retained, not removed

### Platform and design

- 🧊 **Installed taskbar identity icon** (**M**) — parked by the owner on 2026-08-17 as a low-priority cosmetic defect. An installed packaged build can still show `{N&C}` on the Windows taskbar at 125% / dark theme where the small `{&}` identity is required. Both the in-place and clean-install experiments failed; do not repeat artifact-only, `WM_GETICON`, Alt+Tab, or `win-unpacked` checks as though they close this.
  - When revisited, trace the taskbar’s live identity source and selected ICO frame while retaining the small-size `{&}` / large-size `{N&C}` contract.
  - Acceptance: observe the exact installed packaged build at 100%, 125%, and above-125% DPI in light and dark taskbar themes. Automated/artifact evidence is supporting evidence only.
  - This no longer blocks MSIX, but must be resolved before another taskbar-icon claim is marked fixed.
- 🧊 **Purchased code-signing certificate** (**M**) — only revisit for the unsigned direct-download channel after the Store path is live or if direct downloads remain primary.
- 🧊 **Native Windows 11 top-level “Open with”** (**L**) — `IExplorerCommand` integration so it is not under “Show more options”.
- 🧊 **Re-harmonize theme chrome hues** — avoid altering canonical upstream theme colours without a compelling design reason.
- 🧊 **One gradient moment** — low-value visual experiment.

### Deferred extensions to shipped features

- 🧊 **File History:** prune orphaned deleted/renamed-file history; add restore confirmation. (The proposed status-bar entry was superseded by the shipped toolbar command.)
- 🧊 **Markdown export:** relative-image embedding; custom page size/margins; batch export; code syntax highlighting.
- 🧊 **Autosave:** untitled-buffer support; per-file opt-out; configurable delay.
- 🧊 **Format Document:** configurable options UI; more languages; `.prettierrc` discovery.
- 🧊 **Folder mode:** drag-to-move; cut/copy/paste; multi-root; `.gitignore` awareness.
- 🧊 **Text highlighter:** re-anchor after external edits; highlights panel; export highlights to HTML/PDF; custom colour picker; Edit-menu command; keyboard-only painting.
- 🧊 **Tab animation:** live-shift / FLIP animation for neighbouring tabs while reordering.
- 🧊 **Find in Files:** regex search only after its safety/performance model is designed; streaming results if measurements still justify it.
- 🧊 **In-app Help:** dedicated hotkey (without conflicting with Monaco); clickable commands; generated content; shared shortcut constants.

### Long-horizon ideas

- 💡 **Large-file mode** — lazy load / feature degradation above a size threshold (**M**).
- 💡 **Cloud sync** for session, snippets, and settings (**L**).
- 💡 **Plugin / extension hooks** (**L**).
- 💡 **Linux distribution and installer support** (**L**) — choose supported architectures, distributions, and package formats; audit case-sensitive path handling and gate or replace Windows-only integrations; add Linux build, unit, smoke, and installed-package validation before calling Linux supported.
- 💡 **macOS build and distribution** (**M–L**).

---

## ✅ Shipped

| Release | Outcome |
| --- | --- |
| **v1.19.3** · 2026-08-17 | Responsive bounded tabs keep long filenames, badges, and close controls usable; natural-width tabs remain available in Appearance settings. |
| **v1.19.2** · 2026-08-15 | Electron and build-toolchain security update; offline PDF exports; guarded app navigation; reliable external-change warnings after **Keep mine**. |
| **v1.19.1** · 2026-08-13 | Explorer opens replace only a disposable blank placeholder; the highlighter persists its active colour. |
| **v1.19.0** · 2026-08-09 | Quality, scale, and keyboard-access pass: semantic controls and dialogs, 20k-file responsiveness, workspace exclusions, scoped/cancellable Find in Files, session/preview efficiency, and installed-build accessibility validation. |
| **v1.18.1** · 2026-08-08 | Markdown dependency hardening and deterministic Windows Electron smoke teardown. Production dependency audit clean. |
| **v1.17.0–v1.18.0** · 2026-08-07 | Fully offline UK/US spell checking, settings and personal dictionary, then right-click corrections and startup file-open readiness fixes. |
| **v1.14.0–v1.16.0** · 2026-07 | Settings home, configurable hotkey, launch-on-login, design polish, Format Document hotkey repair, Find in Files, and sidebar recent folders. |
| **v1.9.0–v1.13.0** · 2026-07 | In-app Help, drag-reorder tabs, visual/token polish, file-type badges, highlighter cursor, taskbar/Explorer identity work, and the completed audit remediation. |
| **v1.0.0–v1.7.0** | Core editor: tabs and splits, themes, recovery and encoding, diffs, snippets and paste history, tray/hotkey, file routing, safety prompts, zoom, file watching, history, Markdown export, autosave, Format Document, folder mode, and highlighting. |

### Durable shipped decisions

- ✅ **Hybrid identity:** a fast scratchpad by default; optional folder sidebar and `Ctrl+P` quick-open for project work.
- ✅ **Phase 4.6 verification:** automated checks plus the reported installed-build Narrator, keyboard, pointer, large-workspace, tray/hotkey/login, and Markdown/session validation are complete.
- ✅ **Release record:** the public `AUDIT-CHECKLIST.md` is fully resolved; release history is recorded here and published releases are tagged on `master`.

### ❌ Closed decision

- ❌ **Remove accent borders from floating chrome** — rejected after design review; retain the established accent-border convention.

---

_Keep an item here until it is implemented, validated, released, and marked ✅._
