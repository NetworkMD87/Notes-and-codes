# Changelog

All notable changes to **Notes & Codes** are documented here. This project adheres to
[Semantic Versioning](https://semver.org/). Releases before v1.12.1 are recorded in the
[GitHub Releases](https://github.com/) history and git tags.

## [Unreleased]

_Phase 3.7 polish & discoverability — accumulating; ships as one release when the pass is done._

### Added

- **File History is now on the toolbar.** Previously reachable only via the command palette and
  Tools menu, File History now has a button on the top toolbar (grouped with Open/Save). The toolbar
  was also regrouped so the dividers read `file | view | tools`.
- **Tabs have rounded top corners** — a 6px top-corner radius for a modern browser-tab look; bottoms
  stay square so tabs sit flush with the strip.
- **Revert File command** — discard unsaved changes and reload the current file from disk (confirms
  first when there are unsaved edits). In the command palette and the File menu.
- **Theme swatches + hover preview.** Every row in the Appearance panel's theme list now shows four
  colour dots from that theme's own palette (editor background, chrome bar, chrome text, accent), and
  hovering a row previews the theme across the whole app — moving off the list, or closing the panel,
  reverts it. Nothing is saved until you click.
- Highlighter pen cursor — in highlight mode the editor cursor is a marker pen whose tip shows the
  active highlight colour, replacing the generic crosshair.

### Fixed

- **Opening a diff no longer flips the editors to a light theme.** The diff view reset Monaco's
  global theme when it opened; on any dark theme whose id isn't literally `dark` (Monokai, Dracula,
  Nord, One Dark, Tokyo Night, Gruvbox Dark, Dark Dimmed, Solarized Dark, High Contrast) that turned
  every editor pane white until you switched themes. The diff now inherits the current theme.

## [1.12.3] — 2026-07-18

### Fixed

- **Save now warns before overwriting a file that changed on disk** (Phase 1 fast-follow). The
  change bar already caught external changes while the app was running, but nothing covered a file
  that changed while it was *closed*: the session restores your buffer without re-reading disk, so
  the watcher never had an event to fire and Save silently destroyed the other change. Every save
  back to a file now checks its on-disk timestamp against what the buffer last saw, and asks before
  overwriting. The same check covers a watcher that failed (network drives) or a change that landed
  a moment before the save. Auto-save never prompts — it skips the write and raises the usual
  change bar, leaving your edits untouched until you decide.

## [1.12.2] — 2026-07-16

Robustness release: **audit Phases 2–5**, completing the v1.12.0 codebase audit (every
finding — 5 High + 7 Med + 9 Low + 1 residual — is now resolved). Reliability and integrity
hardening across startup, the on-disk stores, editor content fidelity, and the IPC boundary.
No feature or UI changes.

### Fixed — startup & window (Phase 2)

- **A malformed session no longer bricks startup** (audit H4). One bad entry in `session.json`
  used to leave a blank window until the file was deleted by hand; the session loader now filters
  malformed entries and startup falls back to a fresh tab instead of failing silently.
- **Opening a file from Explorer while hidden to the tray now shows the window** (audit H3).
  Double-clicking an associated file while the app rested in the tray opened it invisibly.

### Fixed — store integrity & write races (Phase 3)

- **Settings writes no longer race and clobber each other** (audit H5). Concurrent setting
  changes are merged through a single serialized `settings:update`, and the atomic-write temp
  file now uses a unique name so two writes can't collide.
- **Duplicate store instances removed** (audit M4). Recent-files and settings are each
  constructed once, so the menu and the renderer share one serialized write chain.
- **HTML/PDF exports write atomically** (audit M5). Overwriting an existing export can no longer
  truncate the previous good copy if the write is interrupted.
- **File-history & highlight stores self-prune** (audit M6). A best-effort startup sweep drops
  entries whose source file is confirmed gone, so these stores can't grow without bound.

### Fixed — editor correctness & content fidelity (Phase 4)

- **Exporting code/plain-text no longer mangles it as Markdown** (audit M2). Only Markdown
  buffers go through the Markdown pipeline; everything else exports verbatim in a code block.
- **Opening a huge or binary file is now guarded** (audit M3). Files above 50 MB and binary
  (NUL-bearing) files are refused with a toast instead of freezing or corrupting on save.
- **Multiple on-disk-change conflicts can all be resolved** (audit M7). Simultaneous conflicts
  now queue with an "(N more)" hint instead of the second notice clobbering the first.

### Fixed — hardening & cleanups (Phase 5)

- **An interrupted atomic write no longer strands a `.tmp` file** (audit L3); the temp is removed
  on any write/rename failure. (A durability `fsync` was evaluated and deliberately not adopted —
  on Windows it stalled writes by seconds for a marginal, rare-on-NTFS gain.)
- **Quick Open hints when its index is truncated** (audit L4). `walkFiles` reports whether it hit
  the 20 000-file cap, and Quick Open shows an "Index truncated" note so missing files aren't a
  silent surprise.
- **Smaller guards** (audit L5–L9): file-history chain map no longer leaks, the status bar can't
  throw on a close/focus race, the file-argument heuristic is exact (existence-checked), the
  clipboard-history store clamps its payload server-side, and export HTML escaping covers `'`.

### Security

- **Every IPC handler now validates its sender** (audit L2). The ~40 main-process handlers —
  several of which take arbitrary filesystem paths — reject any message whose frame isn't the app
  window's own, closing the door on a stray/embedded frame driving them.

### Changed

- **Theme metadata moved to shared code** (audit L1). The main-process menu no longer imports a
  renderer module, keeping the process boundary clean. No user-visible effect.

## [1.12.1] — 2026-07-11

Patch release: **Phase 1 of the codebase-audit checklist** (data-loss & close/quit safety).
Every fix here closes a path that could silently lose user content. No feature or UI changes.

### Fixed

- **"Save As…" cancel no longer detaches the tab from its file** (audit H1). Cancelling the
  Save-As dialog is now a no-op: the tab keeps its name, Ctrl+S saves silently without
  re-prompting, and the file watcher / autosave keep working for it.
- **Command-palette "Close Tab" now uses the full safe close path** (audit H2). It previously
  bypassed the unsaved-changes confirm, leaked the Monaco model/view-state of every
  palette-closed tab, skipped highlight cleanup, and didn't hide to tray on the last tab.
- **Closing a dirty *untitled* tab now warns before discarding** (audit M1). Scratch notes in an
  untitled buffer used to close with no confirmation and were unrecoverable.
- **A confirm dialog opened by an Enter-triggered command no longer auto-confirms itself.** The
  keystroke that ran the command could "bleed through" and instantly activate the dialog's
  default button before it was visible; the dialog now arms its keyboard/focus on the next frame.
- **A clean quit no longer drops the last ~500ms of state** (audit R1). Quitting with no unsaved
  tabs now flushes the debounced clipboard-history and session writes before exiting, matching
  the save-then-quit path.

[1.12.2]: https://github.com/NetworkMD87/Notes-and-codes/compare/v1.12.1...v1.12.2
[1.12.1]: https://github.com/
