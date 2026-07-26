# Changelog

All notable changes to **Notes & Codes** are documented here. This project adheres to
[Semantic Versioning](https://semver.org/). Releases before v1.12.1 are recorded in the
[GitHub Releases](https://github.com/) history and git tags.

## [1.16.0] — 2026-07-26

_The sidebar tab is always there now and it remembers your folders — plus a calmer Appearance panel._

### Added
- The sidebar edge tab is always visible. With no folder open it opens a folder panel with an
  **Open Folder…** button and your **recent folders** — no trip to the File menu.
- The sidebar header is now a folder switcher: click the folder name to jump to a recent folder,
  open another one, or close the current one.

### Changed
- **Toggle Sidebar** no longer warns that you need a folder open — it shows the folder panel instead.
- Themes no longer change as your pointer passes over the list in Settings ▸ Appearance. Hovering
  used to repaint the whole window and then repaint it back, which looked like the app glitching.
  Click a theme to apply it; the four colour dots on each row show you what you're picking.
- The header's half-circle theme button is gone. It opened Settings on the Appearance page, which
  is exactly where the gear button next to it already went. Appearance is still reachable from the
  gear, `Ctrl+,`, the command palette, and View ▸ Appearance….
- The accent colours in Settings ▸ Appearance sit in two even rows of nine instead of re-wrapping
  raggedly, and the **Accent** heading no longer sits squashed against the theme list above it.

### Fixed
- A recent folder that has been deleted or moved is removed from the list the moment you click it,
  with a clear message, instead of failing silently.

## [1.15.0] — 2026-07-26

_Find in Files: search what's **inside** your files, not just their names._

### Added

- **Find in Files** (`Ctrl+Shift+F`, Edit menu, or the command palette) — search the text inside
  every file in the open folder **and** every open tab. Results group by file with line numbers and
  a preview of each match; pressing Enter opens the file, puts the cursor on the match and selects
  it, and seeds the editor's own find widget so `F3` walks the rest of that file. Toggles for
  match-case and whole-word. Until now the app could only match file *names*.
  - **Unsaved edits are searched, not the stale copy on disk.** If a file is open with changes you
    haven't saved, Find in Files searches what's actually on your screen — so it won't offer you
    text you already deleted, or miss text you just typed.
  - Works with no folder open, searching just your tabs.
  - Skips `node_modules` and `.git` (unless Show-all-files is on), binary files, and files over 1 MB.
    UTF-16 files are searched correctly, not read as mojibake.
  - Results are capped (20 per file, 1000 total) with a footer saying so, and a slow search over a
    large folder can be superseded by typing rather than running to completion.
  - _Deferred: regular expressions, replace-across-files, include/exclude globs._

## [1.14.1] — 2026-07-25

_Patch release: the Format Document keyboard shortcut finally works._

### Fixed

- **`Shift+Alt+F` now formats the document.** The shortcut had done nothing since v1.6 — the command
  itself always worked from the command palette and the Edit menu, so only the keystroke was dead.
  Two editor panes were each claiming the same editor-wide shortcut and the hidden one won, so every
  press was swallowed by an empty pane and never reached the file you were looking at. It is now
  claimed once and always acts on whichever pane has focus, including in split view.

### Changed

- **The in-app help lists `Shift+Alt+F` under Edit again**, now that it does something — it had been
  left out on purpose rather than advertise a shortcut that did nothing.
- **`AUDIT-CHECKLIST.md` is now published in the repository.** The README has linked to it as the
  record of both closed codebase audits, but the file had never actually been committed, so the link
  led nowhere. Its last two outstanding manual checks were also carried out and recorded.

## [1.14.0] — 2026-07-21

_First Phase 4 slice: a proper Settings home, launch on login, and a configurable global hotkey._

### Added

- **Settings panel.** A new overlay with a left category nav — Appearance / Font / Editor / Folder
  / Startup / Integration — replaces the old, Appearance-only panel; its contents (including the
  theme hover live-preview) moved in unchanged. Open it from the new gear button on the toolbar,
  `Ctrl+,`, the command palette (`Settings…`), or `File ▸ Preferences…`. The old `View ▸
  Appearance…` menu item, the theme button, and the palette `Appearance…` command all still work,
  and now deep-link straight to the Appearance category.
- **Launch when Windows starts** (Settings ▸ Startup) — opt-in. Starts hidden in the system tray,
  so the app is ready to summon instantly instead of throwing a window at you on boot. If the entry
  gets disabled behind the app's back (Task Manager ▸ Startup), the checkbox reconciles to the
  truth the next time the app launches instead of lying.
- **Configurable summon hotkey** (Settings ▸ Startup) — Record captures a keystroke, Clear removes
  the hotkey entirely (previously mandatory). Rebinding is test-then-commit: if the new combo is
  already taken by another app, the previous one is restored and a toast says so, so settings can
  never end up storing a combo that isn't actually bound.

### Changed

- **The "Open with Notes & Codes" right-click-menu toggle moved out of the Tools menu** into
  Settings ▸ Integration — it was a setting filed under Tools. Its previously-duplicated toggle
  logic (the palette command and the menu item each ran their own copy) is now single-sourced.

### Fixed

- **A deliberately-cleared summon hotkey no longer comes back after a restart.** Settings used to
  fall back to the default hotkey whenever the stored value was falsy, which silently undid a
  Clear (an empty string) the next time the app launched.
- **A malformed hotkey value in `settings.json` no longer risks the launch.** Registering it with
  Windows can throw; the throw is now caught and degrades to a toast instead of crashing startup.

## [1.13.0] — 2026-07-20

_Phase 3.7 polish & discoverability — the whole pass, shipped as one release._

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
- **Highlighter pen cursor** — in highlight mode the editor cursor is a marker pen whose tip shows the
  active highlight colour, replacing the generic crosshair. The toolbar's highlighter button was
  redrawn to match the same marker shape.

### Changed

- **Small icons now show the `{&}` glyph.** The taskbar button, Alt+Tab, Explorer and the desktop
  shortcut previously showed the full `{N&C}` mark at 16–32px, where it mushed into an unreadable
  blob. Those sizes now carry `{&}` on the same dark tile (16px drops the braces, which cannot
  resolve at that size). The 48px and 256px icons are unchanged.

### Fixed

- **Opening a diff no longer flips the editors to a light theme.** The diff view reset Monaco's
  global theme when it opened; on any dark theme whose id isn't literally `dark` (Monokai, Dracula,
  Nord, One Dark, Tokyo Night, Gruvbox Dark, Dark Dimmed, Solarized Dark, High Contrast) that turned
  every editor pane white until you switched themes. The diff now inherits the current theme.
- **Pinned taskbar entries no longer keep a stale icon.** The app now declares a stable
  AppUserModelID matching its installed shortcut, so Windows stops treating the pinned entry and
  the running window as two separate applications.
- **Explorer's right-click "Open with Notes & Codes" now shows the app icon.** The registered shell
  verb had no `Icon` registry value, so Windows drew a blank space in the context menu instead of the
  icon. The registration now writes one, and an already-enabled install picks it up automatically the
  next time the app starts.

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
