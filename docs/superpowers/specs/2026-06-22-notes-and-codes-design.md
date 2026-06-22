# Notes & Codes — Design Spec

**Date:** 2026-06-22
**Status:** Approved (design phase)
**App name:** `Notes-and-codes` (display name: "Notes & Codes")

## 1. Summary

A fast, dev-focused scratchpad: Windows Notepad's simplicity plus a code editor's
power. For quickly pasting, editing, and comparing notes and code snippets across
many throwaway buffers without losing anything. Fills the gap between Notepad (too
dumb) and VS Code (too heavy for a quick paste).

## 2. Goals & non-goals

**Goals (v1):**
- Open many scratch buffers as tabs; never lose unsaved content.
- Full pane or split pane; per-pane line-number toggle.
- Show diffs (side-by-side).
- Light/dark theme.
- Open files into the app from the Windows right-click context menu.

**Non-goals (deferred or out of scope):**
- Cloud sync, accounts, collaboration.
- Plugin/extension system.
- Code formatting/beautify, linting, language servers.
- Mobile / cross-platform parity (Windows-first; Electron keeps the door open).

## 3. Stack & architecture

- **Electron + TypeScript + Monaco editor**, bundled with **Vite**.
- Chosen for: single language (TS), largest ecosystem/docs (gentlest for a
  learning developer), and Monaco delivers syntax highlighting (100+ languages),
  the diff view, multi-cursor, minimap, and find/replace out of the box.
- Trade-off accepted: larger binary (~80–90 MB). Size optimization is a later,
  optional concern; "features over size" was the explicit priority.

**Process model (Electron):**
- **Main process** — owns all OS-facing work: window lifecycle, file read/write,
  native menus, context-menu (registry) management, session and settings storage.
- **Renderer process** — the UI: Monaco editor instances, tab bar, split panes,
  theme, command palette. Plain TypeScript plus small focused libraries
  (`Split.js` for resizable panes). No large UI framework — fewer moving parts to
  learn and maintain, easier to keep polished.
- **IPC** — a narrow, typed channel between them. The renderer never touches disk
  directly; it requests operations from main. This keeps the security boundary
  clean (contextIsolation on, nodeIntegration off).

**Packaging:** `electron-builder` → NSIS installer (`.exe`) plus an optional
portable build (later wave).

## 4. UI layout

```
┌───────────────────────────────────────────┐
│ [Tab1] [Tab2] [Tab3 +]            ◐ theme   │  tab bar + theme toggle
├──────────────────────┬──────────────────────┤
│  Monaco editor A      │  Monaco editor B      │  split pane (drag divider)
│  (line numbers on)    │  (plain, no numbers)  │  each pane: own line-num toggle
├──────────────────────┴──────────────────────┤
│ lang: TS │ UTF-8 │ LF │ Ln 4 Col 12 │ ●saved │  status bar
└───────────────────────────────────────────┘
```

- **Split pane** is optional: toggle between single (full) pane and two panes side
  by side. Each pane independently shows its own document and has its own
  line-numbers on/off toggle. Panes can show the same buffer or different buffers.
- **Command palette** (`Ctrl+Shift+P`): keyboard-driven access to all commands.
  Cheap to build, large polish/usability payoff.
- **Status bar:** language, encoding, line-ending, cursor position, save state.

## 5. Data model & persistence

**Buffer** — one open document:
```
{ id, title, filePath | null, content, language, dirty }
```

**Session auto-save:**
- Every buffer (including unsaved/untitled) is written to an app-data session
  folder on change (debounced). This is the "never lose a note" guarantee:
  crash or accidental close → reopen restores all tabs and content.
- **On by default.** A toggle in Settings turns it off for users who don't want
  background writes.
- Storage: a JSON index plus per-buffer files under
  `%APPDATA%/Notes-and-codes/session/`.

**Named files:**
- `Ctrl+S` writes a buffer to its real disk path (prompts for path if untitled).
- Untitled buffers live only in the session store until explicitly saved.

**Settings store** (`%APPDATA%/Notes-and-codes/settings.json`):
- `theme` (light | dark | follow-os)
- `autoSaveSession` (bool, default true)
- `contextMenuEnabled` (bool)
- window bounds, last-open layout.

## 6. Feature behavior

- **Tabs:** new / close / reorder; dirty-dot indicator; middle-click to close;
  restored from session on launch.
- **Diff (all three modes, phased):**
  - v1: **tab-vs-tab** — pick tab A and tab B, Monaco renders side-by-side diff in
    a pane.
  - v2: **current-vs-clipboard** (one-click "did this change?") and
    **file-vs-file** (browse two files on disk).
  - A diff opens as a dedicated read-only view, closeable back to normal editing.
- **Theme:** light/dark toggle switches both Monaco and the app chrome; remembered
  across restarts. "Follow OS theme" is an option.
- **Monaco built-ins, wired up:** syntax highlighting (100+ languages, with
  auto-detection by extension/content), find & replace (incl. regex),
  multi-cursor, minimap.

## 7. Windows context-menu integration

- Registry entries under `HKCU\Software\Classes\*\shell\OpenWithNotesAndCodes`
  add "Open with Notes & Codes" to the right-click menu for all files; the verb
  launches the app with the file path as an argument.
- Using **HKCU** (current user) means **no admin/UAC prompt**.
- Registered at install time by electron-builder, and toggleable at runtime via a
  Settings switch (`contextMenuEnabled`) that adds/removes the keys.
- Launch handling: if an instance is already running, route the file to it (single
  instance) and open a new tab; otherwise start and open the file.

## 8. Roadmap (waves)

- **v1:** tabs; full/split pane with per-pane line-number toggle; light/dark
  theme; session auto-save + crash recovery (with off toggle); Windows
  context-menu open; tab-vs-tab diff; Monaco freebies (syntax, find/replace,
  multi-cursor, minimap).
- **v2:** clipboard-diff and file-diff; command palette polish; markdown live
  preview; paste/clipboard history; encoding & line-ending control.
- **v3:** global summon hotkey; always-on-top pin; portable build; snippets.

## 9. Testing

- **Vitest** for logic: buffer model, session store (save/restore/debounce),
  settings store, diff source selection, IPC contract shapes.
- **Playwright** (Electron support) for UI smoke tests: open file → tab appears;
  edit → dirty dot shows; restart → session restored; toggle theme → applied.
- Test-driven where it pays most (persistence, IPC, context-menu key management);
  lighter coverage on purely visual chrome.

## 10. Open items

- None blocking. App name and auto-save-toggle decisions are resolved above.
