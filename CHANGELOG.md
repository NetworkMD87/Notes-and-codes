# Changelog

All notable changes to **Notes & Codes** are documented here. This project adheres to
[Semantic Versioning](https://semver.org/). Releases before v1.12.1 are recorded in the
[GitHub Releases](https://github.com/) history and git tags.

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

[1.12.1]: https://github.com/
