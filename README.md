<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/branding/notes-and-codes-logo/svg/nc-wordmark-dark.svg">
    <img alt="Notes & Codes" src="assets/branding/notes-and-codes-logo/svg/nc-wordmark-light.svg" width="420">
  </picture>
</p>

# Notes & Codes

A fast, Windows-first dev scratchpad: Notepad-simple, code-editor-powerful. Tabs,
split panes, live diffs, markdown preview, paste history, snippets, and a global
summon hotkey — all in a lightweight tray app.

## Install
1. Download **Notes & Codes Setup x.y.z.exe** from the releases.
2. Run it. The build is unsigned, so Windows SmartScreen shows
   "Windows protected your PC" → click **More info → Run anyway**.
3. It installs per-user (no admin) and adds an "Open with Notes & Codes" entry to
   the right-click menu (under **Show more options** on Windows 11).

## Highlights
- Tabs; full or split panes with a draggable divider; per-pane line numbers.
- 8 cohesive themes (light / dark / follow-OS + Solarized, One Dark, Monokai, High-Contrast…) with a per-theme accent; bundled JetBrains Mono + Fira Code; word wrap.
- Session auto-save + crash recovery (never lose a scratch buffer); all saves are crash-safe (atomic temp-write + rename).
- Optional **auto-save to disk** for named files (off by default; toggle in Appearance or the palette).
- **Folder mode** — Open Folder → toggleable sidebar file-tree + `Ctrl+P` quick-open, with basic file ops.
- **File history / timeline** — automatic per-file snapshots you can browse, diff, and restore.
- **Text highlighter** — a 7-colour pen that persists per file.
- Diffs: tab-vs-tab, current-vs-clipboard, file-vs-file.
- Live markdown preview + **export to HTML / PDF** (clean light document style).
- **Format Document** — prettify the active file (JS/TS, JSON, CSS/SCSS/LESS, HTML, Markdown, YAML) via the palette, Edit menu, or `Shift+Alt+F`; optional format-on-save (Appearance ▸ Editor).
- UTF-8 / UTF-16 encoding + LF/CRLF control.
- Paste history and reusable snippets.
- System tray: closing hides to the tray; summon from anywhere. The app icon and tray glyph adapt to your Windows light/dark taskbar.

## Shortcuts
| Action | Key |
|---|---|
| Command palette | Ctrl+Shift+P |
| Quick-open (folder mode) | Ctrl+P |
| Save / Open | Ctrl+S / Ctrl+O |
| Toggle split | Ctrl+\\ |
| Summon / hide (global) | Ctrl+Shift+Space |
| Quit (from tray app) | Ctrl+Q |

Closing the window hides it to the tray. Quit via the tray icon's menu or Ctrl+Q.

## Build from source
```
npm install
npm run dev        # run in development
npm run package    # build the installer + portable exe (needs Windows Developer
                   # Mode or an elevated shell for electron-builder's symlink step)
```
