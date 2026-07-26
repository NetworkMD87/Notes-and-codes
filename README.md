<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/branding/notes-and-codes-logo/svg/nc-wordmark-dark.svg">
    <img alt="Notes & Codes" src="assets/branding/notes-and-codes-logo/svg/nc-wordmark-light.svg" width="420">
  </picture>
</p>

# Notes & Codes

[![CI](https://github.com/NetworkMD87/Notes-and-codes/actions/workflows/ci.yml/badge.svg)](https://github.com/NetworkMD87/Notes-and-codes/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A fast, Windows-first dev scratchpad: **Notepad-simple, code-editor-powerful.**

Open it with the global hotkey, paste the thing, close it — it remembers. Or open a folder
and it turns into a real editor: tabs, split panes, quick-open, diffs, file history. It lives
in the tray, starts empty, and never asks you to make a project first.

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/screenshots/hero-dark.png">
    <img alt="Notes & Codes: folder sidebar with file-type badges, split panes showing TypeScript and Markdown" src="assets/screenshots/hero-light.png">
  </picture>
</p>

## Install

1. Download **Notes.Codes.Setup.x.y.z.exe** from the [latest release](../../releases/latest)
   (GitHub strips the spaces and `&` from the filename). The **Notes.Codes.x.y.z.exe** asset is
   the no-install portable build.
2. Run it. The build is unsigned, so Windows SmartScreen shows
   "Windows protected your PC" → click **More info → Run anyway**.
3. It installs per-user (no admin) and adds an "Open with Notes & Codes" entry to
   the right-click menu (under **Show more options** on Windows 11).

## Features

### Editing

- Tabs you can **drag to reorder**; full or split panes with a draggable divider; per-pane line numbers.
- Each tab carries a tinted **file-type badge** from its language, matching the sidebar's badges.
- Word wrap, UTF-8 / UTF-16 encoding, and LF / CRLF control.
- **Format Document** — prettify the active file (JS/TS, JSON, CSS/SCSS/LESS, HTML, Markdown, YAML)
  with `Shift+Alt+F`, the command palette or the Edit menu, plus optional format-on-save
  (Settings ▸ Editor).
- Paste history and reusable snippets.

### Look & feel

- **13 cohesive themes** — Light, Dark, Dark Dimmed, Solarized Dark/Light, One Dark, Monokai,
  High-Contrast, Nord, Dracula, Gruvbox Dark/Light, Tokyo Night, plus follow-OS. The theme list
  shows each theme's own palette as swatches and **live-previews it on hover**.
- A per-theme accent you can override from **18 curated colours**, with automatic text-contrast
  correction so light accents stay legible.
- Bundled JetBrains Mono, Fira Code and IBM Plex Mono (plus system fonts), and a **separate
  interface font** for app chrome.
- All motion respects `prefers-reduced-motion`.

|  |  |
|:--:|:--:|
| ![Dracula](assets/screenshots/theme-dracula.png)<br>**Dracula** | ![Nord](assets/screenshots/theme-nord.png)<br>**Nord** |
| ![Monokai](assets/screenshots/theme-monokai.png)<br>**Monokai** | ![Gruvbox Light](assets/screenshots/theme-gruvbox-light.png)<br>**Gruvbox Light** |

### Files & folders

- **Folder mode** — Open Folder → a toggleable sidebar file-tree with tinted file-type badges,
  folder glyphs and indent guides, plus `Ctrl+P` quick-open and basic file ops
  (New File/Folder, Rename, Delete → Recycle Bin).
- **Folder panel & recent folders** — the sidebar edge tab is always there; with no folder open it
  offers **Open Folder…** and your recent folders, and the sidebar header switches between them.
- **Open Recent**, drag & drop to open, and Windows "Open with" / single-instance file routing.
- Live **markdown preview** and **export to HTML / PDF** (clean light document style, self-contained).

### Not losing your work

- **Session auto-save + crash recovery** — unsaved scratch buffers survive a restart.
- Every write is **crash-safe** (atomic temp-write + rename), and save failures surface as a toast
  rather than failing silently.
- **On-save overwrite warning** — if the file changed on disk since you opened it, you're asked
  before you clobber it.
- **External change detection** — clean files reload silently; a dirty file raises a floating
  notice with Reload / Keep, and multiple conflicts queue rather than replacing each other.
- **File history / timeline** — automatic per-file snapshots you can browse, diff and restore.
- **Revert File** — discard unsaved edits and reload from disk (confirms first when there's
  something to lose).
- Closing a dirty tab confirms first — including untitled scratch buffers.
- Optional **auto-save to disk** for named files (off by default; Settings ▸ Editor).

### Tools

- **Diffs** — tab-vs-tab, current-vs-clipboard, file-vs-file.
- **Text highlighter** — an 18-colour pen that persists per file, with a marker-pen cursor tipped
  in the active colour.
- **Command palette** (`Ctrl+Shift+P`) for everything, with keycap shortcut hints.
- **In-app Help** — a searchable keyboard-shortcut & command reference with plain-English
  descriptions, plus an About dialog.

![The command palette, filtered, with keycap shortcut hints](assets/screenshots/palette.png)

![A side-by-side diff of two open tabs](assets/screenshots/diff.png)

### Tray & startup

- Closing the window **hides to the tray**; summon it from anywhere with the global hotkey.
  Quit from the tray menu or `Ctrl+Q`.
- The global summon hotkey is **configurable** (Settings ▸ Startup) — record a new combo or clear
  it entirely. If another app already owns the combo, it reverts and tells you instead of
  silently failing.
- **Launch on login** (opt-in, Settings ▸ Startup) — starts hidden in the tray, ready to summon
  the moment Windows boots, instead of throwing a window at you.
- **Settings** in one place (gear button, `Ctrl+,`, or `File ▸ Preferences…`): Appearance, Font,
  Editor, Folder, Startup, Integration.
- The tray glyph flips bright/dark to contrast with your Windows taskbar theme; the app icon is a
  contrast-safe tile that stays legible either way, showing a compact `{&}` mark at the small
  sizes Windows uses for the taskbar, Alt+Tab and Explorer.

## Shortcuts

| Action | Key |
|---|---|
| Command palette | Ctrl+Shift+P |
| Quick-open (folder mode) | Ctrl+P |
| Open file / Open folder | Ctrl+O / Ctrl+K |
| Save / Save As / Save All | Ctrl+S / Ctrl+Shift+A / Ctrl+Shift+S |
| New tab / Close tab | Ctrl+T / Ctrl+W |
| Find / Replace | Ctrl+F / Ctrl+H |
| Find in Files | Ctrl+Shift+F |
| Toggle split | Ctrl+\\ |
| Zoom in / out / reset | Ctrl+= / Ctrl+- / Ctrl+0 |
| Settings | Ctrl+, |
| Summon / hide (global, configurable) | Ctrl+Shift+Space |
| Quit (from tray app) | Ctrl+Q |

The full, searchable list lives in the app under **Help ▸ Shortcuts & Commands**.

## How this is built and verified

Every claim below is checkable from the repo — that's the point of listing them.

**Tests.** 42 unit test files (345 tests, Vitest) covering the pure logic — buffer management,
encoding, the store layer, theme derivation, path/argv handling, the IPC sender guard. These plus
a strict `tsc` type-check run on **every push and pull request** on Windows runners
([CI workflow](.github/workflows/ci.yml)) — that's what the badge above reports.

On top of those, 17 Playwright specs (85 tests) drive the **real built Electron app** in a window,
each with an isolated `--user-data-dir` so they never touch a real session. These run locally
before a release rather than in CI: GitHub-hosted runners don't reliably paint Monaco's viewport,
so every test asserting on rendered editor content fails there regardless of timeout. The suite is
sound, the hosted environment isn't, and gating on it would mean a red badge that says nothing
about the code. It's dispatchable manually from the Actions tab.

**A test is not trusted until it has been seen failing.** Guards here are verified by
falsification — write the break, watch it go red, revert. The pen-cursor CSP guard was proven by
tightening `img-src`; the second-instance test by stubbing the handler's `send('open-file')`; the
overlay-registration guard by removing the fix and confirming Monaco's find widget stopped closing
on Escape. A test that has only ever been green is evidence of nothing.

**The codebase has been audited twice, and the audits are closed.**
[AUDIT-CHECKLIST.md](AUDIT-CHECKLIST.md) is the record: 40 findings across two full passes
(5 High, 7 Medium, 9 Low in the second), each one **verified against the code before being
fixed** — several were downgraded or rejected on inspection rather than cargo-culted into a patch.

**Rejected changes are recorded with their reasoning**, not quietly dropped. `atomicWrite`
deliberately has no `fsync`: it was implemented, A/B tested, found to stall writes on Windows
(`FlushFileBuffers` latency) for a negligible durability gain on NTFS, and backed out — the
rationale sits in the source. Softening the accent border on floating chrome was mocked up and
rejected. Native `IExplorerCommand` is parked as not worth its cost.

**Known issues are documented, not hidden.** The `Shift+Alt+F` Format accelerator shipped broken and
said so — in the feature list, in [ROADMAP.md](ROADMAP.md), and by omitting the key from the in-app
help rather than advertising one that did nothing. It was fixed in 2026-07-25 once the real cause was
found (two panes racing to claim one global Monaco keybinding), and now carries an end-to-end smoke
guard that was verified by watching it fail.

**The security boundary is enforced, not assumed.** `contextIsolation: true`, `sandbox: true`,
`nodeIntegration: false`; the renderer reaches the OS only through a narrow typed `contextBridge`
API; every IPC handler rejects senders that aren't the app window's own main frame; CSP has no
`unsafe-eval`, and Markdown goes through `markdown-it` with `html: false` plus DOMPurify.

**The committed artifacts regenerate deterministically.** `npm run make-icon` and
`npm run screenshots` must both leave `git status` clean when re-run against unchanged input, so
the icon and the images in this README cannot silently drift from the app they depict.

## Build from source

```
npm install
npm run dev        # run in development (electron-vite, HMR)
npm run build      # type-check (tsc --noEmit) then compile to out/
npm test           # unit tests (Vitest)
npm run test:smoke # Playwright Electron smoke tests (needs a build first)
npm run screenshots # regenerate the README screenshots from the built app
npm run package    # installer + portable exe (needs Windows Developer Mode
                   # or an elevated shell for electron-builder's symlink step)
```

## License

MIT — see [LICENSE](LICENSE). Bundled fonts (JetBrains Mono, Fira Code, IBM Plex
Mono) are licensed under the SIL Open Font License 1.1; see
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
