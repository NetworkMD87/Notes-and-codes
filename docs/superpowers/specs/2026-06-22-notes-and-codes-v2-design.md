# Notes & Codes — v2 Design Spec

**Date:** 2026-06-22
**Status:** Approved (design phase)
**Builds on:** v1 (`2026-06-22-notes-and-codes-design.md`), branch merged/PR #1.

## 1. Summary

v2 extends the v1 scratchpad with six items from the v1 roadmap: clipboard-diff
and file-diff, side-by-side markdown preview, in-app paste history, encoding +
line-ending control, command-palette polish, and one targeted refactor
(extracting command registration out of `main.ts`). All six ship in one plan.

## 2. Goals & non-goals

**Goals:**
- Diff the current buffer against the clipboard, and diff two files on disk.
- Live side-by-side markdown preview, CSP-safe.
- Paste history of text copied from / pasted into the app, persisted, re-insertable.
- Encoding (UTF-8, UTF-8-BOM, UTF-16 LE/BE) detection on open + selection on save; EOL (LF/CRLF) switching.
- Palette polish: shortcut hints on rows.
- Keep `main.ts` focused by extracting `commands.ts`.

**Non-goals:**
- System-wide clipboard monitoring (privacy: in-app capture only).
- Full charset support beyond UTF-8/UTF-16 (no iconv-lite, no Windows-1252/Shift-JIS).
- Auto-reconversion of an already-open buffer when encoding is changed (applies on next save).
- Markdown features needing network/external resources.

## 3. Stack additions

- `markdown-it` — markdown → HTML rendering (configured `html: false`).
- `dompurify` — sanitize rendered HTML before insertion (defense in depth).
- (+ `@types/markdown-it`, `@types/dompurify` as needed.)
- No other runtime deps. Encoding uses Node's native `Buffer` (no iconv-lite).

## 4. Features

### 4.1 Diff modes (clipboard + file)
The existing `DiffView`/`DiffPicker` already render any two sources; v1 wired
only tab-vs-tab. Add two palette commands:
- **Diff: current vs clipboard** — focused pane's buffer content is the left side;
  the clipboard text (via a new `clipboard:read` IPC handler calling Electron
  `clipboard.readText()`) is the right side.
- **Diff: two files on disk** — invoke `openDialog` twice, `readFile` both, diff
  them. Language for each side derived from its path (reuse `languageFromPath`).

"Diff: tab vs tab" remains. No change to `DiffView` rendering.

### 4.2 Markdown preview (side-by-side panel)
- New `markdownPreview.ts` (`MarkdownPreview` class): a right-hand panel that is
  its own flex child in `#panes` (separate from the split-pane feature). Renders
  the focused buffer's content as sanitized HTML, live-updating (debounced) on edit.
- Pipeline: `markdown-it` with `html: false` → `DOMPurify.sanitize` → `innerHTML`.
  CSP `default-src 'self'` blocks external loads; inline styling for the rendered
  content uses the existing `style-src 'unsafe-inline'`.
- Toggle via palette ("Toggle Markdown Preview"). Panel hidden by default. Works
  with single or split editor; preview tracks the focused pane's buffer.

### 4.3 Paste history (in-app, persisted)
- `pasteHistory.ts` captures text **only** from in-app activity: Monaco
  `onDidPaste` (pasted text) and the editor container's DOM `copy`/`cut` events
  (selected text). No OS clipboard polling — sensitive data copied elsewhere is
  never seen.
- In-memory list: most-recent-first, de-duplicated by exact text, capped at
  **50** entries. Per-entry full text retained up to a size cap (e.g. 1 MB);
  larger pastes are stored truncated with a marker.
- Persistence: `clipboardHistoryStore.ts` (main) writes
  `%APPDATA%/Notes-and-codes/clipboard-history.json` via new IPC
  (`clipboard-history:load` / `clipboard-history:save`), corrupt-file-safe like
  the session store. Debounced save.
- UI: `pasteHistoryPicker.ts` (a `DiffPicker`-style overlay) lists entries with a
  single-line truncated preview; selecting inserts the full text at the cursor in
  the focused pane. Palette commands: "Paste from History", "Clear Paste History".

### 4.4 Encoding + EOL control
- `shared/encoding.ts` (pure): `detectEncoding(buf: Buffer)` sniffs the BOM →
  `'utf8' | 'utf8bom' | 'utf16le' | 'utf16be'` (default `utf8`); `decode(buf, enc)`
  and `encode(text, enc)` using `Buffer` (UTF-16BE handled by byte-swapping).
- `fileService.readFileForEditor` reads raw bytes, detects encoding, decodes, and
  returns `{ filePath, content, eol, encoding }`. `writeFile` takes an `encoding`
  and encodes accordingly (writing the BOM for `utf8bom`/`utf16*`).
- `BufferState` and `OpenedFile` gain an `encoding: Encoding` field
  (`DEFAULT` = `utf8`). `BufferManager.create`/`open` set it.
- UI: status bar shows encoding + EOL; both are clickable. Clicking opens a small
  menu (reusing the overlay/picker pattern) — EOL: LF/CRLF; encoding: the four
  options. Choice updates the buffer's `eol`/`encoding`, applied on next save.

### 4.5 Command palette polish
- `Command` gains an optional `hint?: string` (e.g. `"Ctrl+S"`). Palette rows
  render the hint right-aligned and dimmed when present. No recently-used state,
  no fuzzy-rank changes. YAGNI.

### 4.6 Targeted refactor: `commands.ts`
- Move palette-command registration from `main.ts` into
  `src/renderer/commands.ts` exporting `registerCommands(deps)`, where `deps`
  carries the managers/views/palette/handlers the commands close over. `main.ts`
  constructs the pieces and calls `registerCommands` — returning it to a thin
  bootstrap. This is done as part of v2 because v2 roughly doubles the command
  count; it is not a standalone refactor.

## 5. Architecture / file structure

```
src/
  shared/
    encoding.ts            # NEW: pure BOM detect/decode/encode + Encoding type
    types.ts               # MODIFY: + encoding field; + Api: clipboardRead, clipboardHistory load/save
  main/
    clipboardHistoryStore.ts  # NEW: persist/restore clipboard history (corrupt-safe)
    fileService.ts         # MODIFY: encoding-aware read/write
    ipc.ts                 # MODIFY: + clipboard:read, clipboard-history:load/save
  preload/
    index.ts               # MODIFY: + bridge methods for the new channels
  renderer/
    markdownPreview.ts     # NEW: side-by-side preview panel
    pasteHistory.ts        # NEW: capture + in-memory list logic (testable)
    pasteHistoryPicker.ts  # NEW: overlay picker to re-insert
    commands.ts            # NEW: registerCommands(deps) — all palette commands
    statusBar.ts           # MODIFY: clickable encoding/EOL menus
    diffView.ts            # (unchanged rendering; new diff sources wired in commands.ts)
    bufferManager.ts       # MODIFY: encoding field on create/open
    main.ts                # MODIFY: thinner bootstrap; calls registerCommands
    index.html             # MODIFY: preview panel container + CSS; palette hint CSS
```

**Boundaries:** `encoding.ts`, `pasteHistory` list logic, and `clipboardHistoryStore`
are pure/IO-isolated → unit-tested. `markdownPreview`, `pasteHistoryPicker`,
status-bar menus are DOM → smoke-tested. `commands.ts` centralizes command wiring.

## 6. Data flow

- **Markdown preview:** focused pane `onChange` → debounced → `MarkdownPreview.render(content)` → markdown-it → DOMPurify → innerHTML.
- **Paste history:** editor paste/copy/cut → `pasteHistory.add(text)` → dedupe/cap → debounced persist → picker reads the list → insert at cursor.
- **Encoding:** open → read bytes → `detectEncoding` → `decode` → `BufferState.encoding`; save → `encode(content, buffer.encoding)` → write (with BOM as needed).
- **Diff modes:** command gathers left/right (buffer/clipboard/file) → `DiffView.show`.

## 7. Error handling

- `clipboardHistoryStore.load` returns an empty history on missing/corrupt file (never throws), matching the session store.
- `clipboard:read` returns `''` if the clipboard has no text.
- Markdown render wraps in try/catch; on failure the panel shows a small error notice rather than crashing.
- Encoding decode failures fall back to UTF-8 with a toast; never throw into the UI.
- Diff: current-vs-clipboard with empty clipboard → toast, no diff.

## 8. Testing

- **Vitest (unit):** `encoding` (BOM detection for all four; decode/encode round-trips incl. UTF-16BE byte-swap; BOM written/stripped correctly); `clipboardHistoryStore` (save/reload, cap, dedupe, corrupt-safe); `pasteHistory` (dedupe, most-recent-first, cap at 50, size-cap truncation); markdown render helper (a `<script>` in input is stripped from output).
- **Playwright (smoke):** extend the existing isolated-userData spec — toggle markdown preview reveals the panel and renders; "Paste from History" picker inserts; "Diff: current vs clipboard" opens the diff view.

## 9. Open items

None blocking. Defaults resolved: paste cap 50, persisted; sanitizer = markdown-it
`html:false` + DOMPurify; encoding applies on next save; palette polish = hints only.
