# Notes & Codes v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the v1 scratchpad with clipboard/file diff, side-by-side markdown preview, in-app paste history, encoding (UTF-8/UTF-16 BOM) + EOL control, palette shortcut hints, and a `commands.ts` extraction.

**Architecture:** Builds on v1 (Electron + TS + Monaco, two-process, typed IPC bridge). New pure logic (encoding, paste-history list, clipboard-history store) is unit-tested; new DOM surfaces (markdown panel, paste-history picker, status-bar menus) are smoke-tested. Palette command registration moves from `main.ts` into `commands.ts`.

**Tech Stack:** Adds `markdown-it` (render) + `dompurify` (sanitize). Encoding uses Node `Buffer` (no iconv-lite).

## Global Constraints

- App/product name unchanged: `Notes-and-codes` / "Notes & Codes".
- Electron security unchanged: `contextIsolation:true`, `nodeIntegration:false`, `sandbox:true`; renderer reaches OS only via `window.api`. **The sandboxed renderer cannot use `node:buffer`/`node:fs`** — all `Buffer`/fs code stays in the main process.
- Storage root: `app.getPath('userData')` → `%APPDATA%/Notes-and-codes/`. New file: `clipboard-history.json`.
- Paste history: **in-app capture only** (Monaco paste + editor copy/cut DOM events). Never poll the OS clipboard. Cap **50** entries, dedupe by exact text, per-entry text cap **1 MB** (truncate larger with a ` …[truncated]` marker).
- Encoding set is exactly: `'utf8' | 'utf8bom' | 'utf16le' | 'utf16be'`. No other charsets. Encoding choice applies **on next save** (no live reconvert).
- Markdown render pipeline: `markdown-it` with `html: false`, then `DOMPurify.sanitize`. No external/network resources.
- TypeScript `strict: true`, 2-space indent. Commit after each task with the message in its final step.
- Each "run the app" verification is headless-limited: gate on `npm run build` clean + `npm test` green; the Playwright smoke test (Task 10) and a human spot-check cover GUI behavior. Do not block on being unable to see the window.

## File Structure

```
src/
  shared/
    types.ts                  # MODIFY: + Encoding type; BufferState.encoding; OpenedFile.encoding; Api changes
  main/
    encoding.ts               # NEW: Buffer-based detectEncoding/decode/encode (node env, unit-tested)
    fileService.ts            # MODIFY: encoding-aware read (bytes) / write
    clipboardHistoryStore.ts  # NEW: persist/restore clipboard history (corrupt-safe)
    ipc.ts                    # MODIFY: + clipboard:read, clipboard-history:load/save; file:write gains encoding
  preload/
    index.ts                  # MODIFY: + clipboardRead, loadClipboardHistory, saveClipboardHistory; writeFile gains encoding
  renderer/
    commands.ts               # NEW: registerCommands(deps) — all palette commands
    markdownPreview.ts        # NEW: side-by-side preview panel
    markdownRender.ts         # NEW: pure render(md)->sanitized html (unit-tested)
    pasteHistory.ts           # NEW: PasteHistoryList logic (unit-tested) + capture wiring helper
    pasteHistoryPicker.ts     # NEW: overlay picker to re-insert
    statusBar.ts              # MODIFY: show encoding; clickable EOL/encoding menus
    editorPane.ts             # MODIFY: + onPaste/onCopyCut/insertAtCursor (+ store container)
    bufferManager.ts          # MODIFY: encoding field on create/open
    commandPalette.ts         # MODIFY: Command.hint? + render hint
    main.ts                   # MODIFY: thinner; calls registerCommands; preview/paste wiring
    index.html                # MODIFY: preview panel + picker + hint + status-menu CSS
tests/
  unit/encoding.test.ts            # NEW
  unit/clipboardHistoryStore.test.ts  # NEW
  unit/pasteHistory.test.ts        # NEW
  unit/markdownRender.test.ts      # NEW
  unit/fileService.test.ts         # MODIFY: encoding cases
  smoke/app.spec.ts                # MODIFY: preview/paste/clipboard-diff
```

---

### Task 1: Extract `commands.ts` + palette shortcut hints

**Files:**
- Create: `src/renderer/commands.ts`
- Modify: `src/renderer/commandPalette.ts`, `src/renderer/main.ts`, `src/renderer/index.html`

**Interfaces:**
- Consumes: existing `CommandPalette`, and all the closures currently in `main.ts` (manager, view, theme, tabBar, diff, diffPicker, paneFor, showActive, scheduleSessionSave, saveActive, openFromDisk, startDiff).
- Produces:
  - `interface Command { id: string; label: string; run: () => void | Promise<void>; hint?: string }`
  - `interface CommandDeps { palette: CommandPalette; register: (c: Command) => void; ... }` — see Step 3.
  - `registerCommands(deps: CommandDeps): void` — registers all current v1 commands (later tasks add v2 commands here).

- [ ] **Step 1: Add `hint?` to `Command` and render it (`commandPalette.ts`)**

Change the interface line and the row builder:
```ts
export interface Command { id: string; label: string; run: () => void | Promise<void>; hint?: string }
```
In `refresh()`, replace the row construction so the label and an optional hint render:
```ts
    this.listEl.replaceChildren(...this.filtered.map((c, i) => {
      const row = document.createElement('div')
      row.className = 'palette-row' + (i === this.cursor ? ' active' : '')
      const label = document.createElement('span'); label.textContent = c.label
      row.appendChild(label)
      if (c.hint) { const h = document.createElement('span'); h.className = 'palette-hint'; h.textContent = c.hint; row.appendChild(h) }
      row.onclick = () => { this.exec(c) }
      return row
    }))
```

- [ ] **Step 2: Add palette-hint CSS to `index.html`**

In the `<style>` block, change `.palette-row` to a flex row and add the hint style:
```css
      .palette-row{padding:6px 8px;color:var(--bartext);cursor:pointer;display:flex;justify-content:space-between;gap:16px}
      .palette-hint{opacity:.55;font-size:12px}
```

- [ ] **Step 3: Create `src/renderer/commands.ts`**

Move every `palette.register({...})` call from `main.ts` into this function. Add `hint` to the ones with a known shortcut.
```ts
import type { CommandPalette } from './commandPalette'
import type { BufferManager } from './bufferManager'
import type { SplitView } from './splitView'
import type { ThemeController } from './theme'
import type { DiffView } from './diffView'
import { toast } from './notify'

export interface CommandDeps {
  palette: CommandPalette
  manager: BufferManager
  view: SplitView
  theme: ThemeController
  diff: DiffView
  paneFor: (which: 'A' | 'B') => import('./editorPane').EditorPane
  showActive: () => void
  scheduleSessionSave: () => void
  saveActive: () => Promise<void>
  openFromDisk: () => Promise<void>
  startDiff: () => void
  getAutoSave: () => boolean
  setAutoSave: (v: boolean) => void
}

export function registerCommands(d: CommandDeps): void {
  const p = d.palette
  p.register({ id: 'new', label: 'New Tab', run: () => { d.manager.create(); d.showActive(); d.scheduleSessionSave() } })
  p.register({ id: 'close', label: 'Close Tab', run: () => { d.manager.close(d.manager.activeId!); if (!d.manager.list().length) d.manager.create(); d.showActive(); d.scheduleSessionSave() } })
  p.register({ id: 'split', label: 'Toggle Split', hint: 'Ctrl+\\', run: () => { d.view.setSplit(!d.view.isSplit()); d.showActive() } })
  p.register({ id: 'lines', label: 'Toggle Line Numbers', run: () => { d.paneFor(d.view.focusedPane()).toggleLineNumbers() } })
  p.register({ id: 'theme', label: 'Cycle Theme', run: () => d.theme.cycle() })
  p.register({ id: 'save', label: 'Save', hint: 'Ctrl+S', run: () => d.saveActive() })
  p.register({ id: 'open', label: 'Open File', hint: 'Ctrl+O', run: () => d.openFromDisk() })
  p.register({ id: 'diff', label: 'Start Diff (tab vs tab)', run: () => d.startDiff() })
  p.register({ id: 'diff-close', label: 'Close Diff', run: () => d.diff.hide() })
  p.register({ id: 'autosave', label: 'Toggle Auto-Save Session', run: async () => {
    const next = !d.getAutoSave(); d.setAutoSave(next)
    const s = await window.api.loadSettings(); await window.api.saveSettings({ ...s, autoSaveSession: next })
  } })
  p.register({ id: 'ctxmenu', label: 'Toggle "Open with Notes & Codes" right-click menu', run: async () => {
    const s = await window.api.loadSettings(); const next = !s.contextMenuEnabled
    await window.api.setContextMenu(next); await window.api.saveSettings({ ...s, contextMenuEnabled: next })
    toast(`Right-click menu ${next ? 'enabled' : 'disabled'}.`)
  } })
}
```

- [ ] **Step 4: Replace the registration block in `main.ts`**

Delete the `const palette = new CommandPalette()` ... through the last `palette.register({ id: 'ctxmenu', ... })` block (lines registering commands) and replace with:
```ts
import { registerCommands } from './commands'
// ...after palette + all the functions are defined:
const palette = new CommandPalette()
registerCommands({
  palette, manager, view, theme, diff, paneFor, showActive, scheduleSessionSave,
  saveActive, openFromDisk, startDiff,
  getAutoSave: () => autoSave, setAutoSave: (v) => { autoSave = v }
})
```
Keep the keydown handler, the `overlayOpen` helper, and everything else in `main.ts` unchanged. `autoSave` stays a `let` in `main.ts` (the deps expose get/set so commands mutate the same variable).

- [ ] **Step 5: Verify build + existing tests + smoke unchanged**

Run: `npm run build` → clean.
Run: `npm test` → 25/25 pass (no behavior change).
Run: `npm run test:smoke` → passes (palette commands still work).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: extract palette command registration into commands.ts; add shortcut hints"
```

---

### Task 2: Encoding core (pure, main-side)

**Files:**
- Modify: `src/shared/types.ts` (add `Encoding` type only)
- Create: `src/main/encoding.ts`
- Test: `tests/unit/encoding.test.ts`

**Interfaces:**
- Produces:
  - `export type Encoding = 'utf8' | 'utf8bom' | 'utf16le' | 'utf16be'` (in `types.ts`)
  - `detectEncoding(buf: Buffer): Encoding`
  - `decode(buf: Buffer, enc: Encoding): string`
  - `encode(text: string, enc: Encoding): Buffer`

- [ ] **Step 1: Add the `Encoding` type to `src/shared/types.ts`**

After `export type EolMode = 'LF' | 'CRLF'` add:
```ts
export type Encoding = 'utf8' | 'utf8bom' | 'utf16le' | 'utf16be'
```

- [ ] **Step 2: Write the failing test `tests/unit/encoding.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { Buffer } from 'node:buffer'
import { detectEncoding, decode, encode } from '../../src/main/encoding'

describe('encoding', () => {
  it('detects BOMs and defaults to utf8', () => {
    expect(detectEncoding(Buffer.from('hello'))).toBe('utf8')
    expect(detectEncoding(Buffer.from([0xef, 0xbb, 0xbf, 0x61]))).toBe('utf8bom')
    expect(detectEncoding(Buffer.from([0xff, 0xfe, 0x61, 0x00]))).toBe('utf16le')
    expect(detectEncoding(Buffer.from([0xfe, 0xff, 0x00, 0x61]))).toBe('utf16be')
  })
  it('round-trips each encoding', () => {
    for (const enc of ['utf8', 'utf8bom', 'utf16le', 'utf16be'] as const) {
      const text = 'héllo • world\n2nd line'
      expect(decode(encode(text, enc), enc)).toBe(text)
    }
  })
  it('writes and strips the UTF-8 BOM', () => {
    const buf = encode('x', 'utf8bom')
    expect([buf[0], buf[1], buf[2]]).toEqual([0xef, 0xbb, 0xbf])
    expect(decode(buf, 'utf8bom')).toBe('x')
  })
  it('utf16be round-trips via byte-swap', () => {
    const buf = encode('AB', 'utf16be')
    expect([buf[0], buf[1]]).toEqual([0xfe, 0xff]) // BOM
    expect(decode(buf, 'utf16be')).toBe('AB')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- encoding`
Expected: FAIL — module `../../src/main/encoding` not found.

- [ ] **Step 4: Implement `src/main/encoding.ts`**

```ts
import { Buffer } from 'node:buffer'
import type { Encoding } from '../shared/types'

export function detectEncoding(buf: Buffer): Encoding {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return 'utf8bom'
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return 'utf16le'
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) return 'utf16be'
  return 'utf8'
}

function swap16(buf: Buffer): Buffer {
  const out = Buffer.from(buf) // copy
  for (let i = 0; i + 1 < out.length; i += 2) { const t = out[i]; out[i] = out[i + 1]; out[i + 1] = t }
  return out
}

export function decode(buf: Buffer, enc: Encoding): string {
  switch (enc) {
    case 'utf8': return buf.toString('utf8')
    case 'utf8bom': return buf.subarray(3).toString('utf8')
    case 'utf16le': return buf.subarray(2).toString('utf16le') // strip LE BOM
    case 'utf16be': return swap16(buf.subarray(2)).toString('utf16le') // strip BE BOM, swap to LE
  }
}

export function encode(text: string, enc: Encoding): Buffer {
  switch (enc) {
    case 'utf8': return Buffer.from(text, 'utf8')
    case 'utf8bom': return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, 'utf8')])
    case 'utf16le': return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')])
    case 'utf16be': return Buffer.concat([Buffer.from([0xfe, 0xff]), swap16(Buffer.from(text, 'utf16le'))])
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- encoding`
Expected: PASS (4 cases).

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/main/encoding.ts tests/unit/encoding.test.ts
git commit -m "feat: add BOM-aware UTF-8/UTF-16 encoding core"
```

---

### Task 3: Encoding wiring (fileService, types, ipc, preload, bufferManager)

**Files:**
- Modify: `src/main/fileService.ts`, `src/shared/types.ts`, `src/main/ipc.ts`, `src/preload/index.ts`, `src/renderer/bufferManager.ts`, `src/renderer/main.ts`
- Test: `tests/unit/fileService.test.ts` (update)

**Interfaces:**
- Consumes: `detectEncoding/decode/encode` (Task 2).
- Produces:
  - `OpenedFile` gains `encoding: Encoding`; `BufferState` gains `encoding: Encoding`.
  - `readFileForEditor(path): Promise<OpenedFile>` now detects encoding.
  - `writeFile(path, content, eol, encoding): Promise<void>`.
  - `Api.readFile` unchanged shape (returns the richer `OpenedFile`); `Api.writeFile(path, content, eol, encoding)`.
  - `BufferManager.create`/`open` set `encoding` (default `utf8`).

- [ ] **Step 1: Update types (`src/shared/types.ts`)**

Add `encoding` to `BufferState` (after `eol`) and `OpenedFile` (after `eol`), and change `Api.writeFile`:
```ts
export interface BufferState {
  id: string
  title: string
  filePath: string | null
  content: string
  language: string
  eol: EolMode
  encoding: Encoding
  dirty: boolean
}
// OpenedFile:
export interface OpenedFile {
  filePath: string
  content: string
  eol: EolMode
  encoding: Encoding
}
// Api:
  writeFile(path: string, content: string, eol: EolMode, encoding: Encoding): Promise<void>
```

- [ ] **Step 2: Update the fileService test (`tests/unit/fileService.test.ts`)**

Replace the read/write cases so they assert encoding round-trips. Replace the file's body with:
```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFileForEditor, writeFile, detectEol } from '../../src/main/fileService'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'nc-file-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

describe('fileService', () => {
  it('detects CRLF vs LF', () => {
    expect(detectEol('a\r\nb')).toBe('CRLF')
    expect(detectEol('a\nb')).toBe('LF')
  })
  it('reads a utf8 file and reports encoding+eol', async () => {
    const p = join(dir, 'f.txt'); writeFileSync(p, 'x\r\ny')
    const r = await readFileForEditor(p)
    expect(r.content).toBe('x\r\ny'); expect(r.eol).toBe('CRLF'); expect(r.encoding).toBe('utf8')
  })
  it('reads a utf16le BOM file', async () => {
    const p = join(dir, 'u.txt')
    writeFileSync(p, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('hi', 'utf16le')]))
    const r = await readFileForEditor(p)
    expect(r.content).toBe('hi'); expect(r.encoding).toBe('utf16le')
  })
  it('writes with the requested eol and encoding', async () => {
    const p = join(dir, 'out.txt')
    await writeFile(p, 'a\nb', 'CRLF', 'utf8bom')
    const raw = readFileSync(p)
    expect([raw[0], raw[1], raw[2]]).toEqual([0xef, 0xbb, 0xbf]) // BOM
    expect(raw.subarray(3).toString('utf8')).toBe('a\r\nb')
  })
})
```

- [ ] **Step 3: Run the updated test to verify it fails**

Run: `npm test -- fileService`
Expected: FAIL — `readFileForEditor` lacks `encoding`; `writeFile` arity mismatch.

- [ ] **Step 4: Update `src/main/fileService.ts`**

```ts
import { promises as fs } from 'node:fs'
import type { EolMode, OpenedFile, Encoding } from '../shared/types'
import { detectEncoding, decode, encode } from './encoding'

export function detectEol(content: string): EolMode {
  return content.includes('\r\n') ? 'CRLF' : 'LF'
}

export async function readFileForEditor(path: string): Promise<OpenedFile> {
  const buf = await fs.readFile(path)
  const encoding = detectEncoding(buf)
  const content = decode(buf, encoding)
  return { filePath: path, content, eol: detectEol(content), encoding }
}

export async function writeFile(path: string, content: string, eol: EolMode, encoding: Encoding): Promise<void> {
  const normalized = content.replace(/\r\n/g, '\n')
  const withEol = eol === 'CRLF' ? normalized.replace(/\n/g, '\r\n') : normalized
  await fs.writeFile(path, encode(withEol, encoding))
}
```

- [ ] **Step 5: Update `ipc.ts` and `preload/index.ts`**

`ipc.ts` — change the `file:write` handler signature:
```ts
import type { SessionData, Settings, EolMode, Encoding } from '../shared/types'
// ...
  ipcMain.handle('file:write', (_e, path: string, content: string, eol: EolMode, encoding: Encoding) =>
    writeFile(path, content, eol, encoding))
```
`preload/index.ts` — change `writeFile`:
```ts
  writeFile: (path, content, eol, encoding) => ipcRenderer.invoke('file:write', path, content, eol, encoding),
```

- [ ] **Step 6: Update `bufferManager.ts` (encoding field)**

In `create`, add `encoding: opts.encoding ?? 'utf8'` to the buffer literal. In `open`, pass `encoding: file.encoding` and widen the param type:
```ts
  open(file: { filePath: string; content: string; eol: EolMode; encoding: Encoding }): BufferState {
    const existing = this.buffers.find(b => b.filePath === file.filePath)
    if (existing) { this._activeId = existing.id; return existing }
    const title = file.filePath.split(/[\\/]/).pop() ?? file.filePath
    return this.create({ filePath: file.filePath, content: file.content, eol: file.eol, encoding: file.encoding, title, language: languageFromPath(file.filePath) })
  }
```
Add `Encoding` to the type import, and in `restore()` normalize legacy buffers: after assigning `this.buffers = data.buffers`, add `for (const b of this.buffers) if (!b.encoding) b.encoding = 'utf8'`.

- [ ] **Step 7: Update `main.ts` `saveActive` to pass encoding**

Change the write call:
```ts
  await window.api.writeFile(path, pane.getContent(), b.eol, b.encoding)
```

- [ ] **Step 8: Run tests + build**

Run: `npm test` → all pass (encoding + updated fileService + the rest).
Run: `npm run build` → clean.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: encoding-aware file read/write wired through ipc and buffers"
```

---

### Task 4: Status bar encoding + EOL menus

**Files:**
- Modify: `src/renderer/statusBar.ts`, `src/renderer/main.ts`, `src/renderer/index.html`

**Interfaces:**
- Consumes: `EolMode`, `Encoding`.
- Produces: `StatusBar` constructor takes handlers; `update(info)` includes `encoding`; clicking EOL/encoding invokes the handler with the new value.

- [ ] **Step 1: Rework `src/renderer/statusBar.ts`**

```ts
import type { EolMode, Encoding } from '../shared/types'

export interface StatusHandlers {
  onEol: (eol: EolMode) => void
  onEncoding: (enc: Encoding) => void
}
const ENCODINGS: Encoding[] = ['utf8', 'utf8bom', 'utf16le', 'utf16be']
const ENC_LABEL: Record<Encoding, string> = { utf8: 'UTF-8', utf8bom: 'UTF-8-BOM', utf16le: 'UTF-16 LE', utf16be: 'UTF-16 BE' }

export class StatusBar {
  constructor(private el: HTMLElement, private handlers: StatusHandlers) {}

  update(info: { language: string; eol: EolMode; encoding: Encoding; cursor: { line: number; col: number }; dirty: boolean }): void {
    this.el.replaceChildren()
    const span = (text: string) => { const s = document.createElement('span'); s.textContent = text; return s }

    this.el.appendChild(span(info.language))

    const enc = span(ENC_LABEL[info.encoding]); enc.className = 'sb-click'
    enc.onclick = () => this.cycleEncoding(info.encoding)
    this.el.appendChild(enc)

    const eol = span(info.eol); eol.className = 'sb-click'
    eol.onclick = () => this.handlers.onEol(info.eol === 'LF' ? 'CRLF' : 'LF')
    this.el.appendChild(eol)

    this.el.appendChild(span(`Ln ${info.cursor.line}, Col ${info.cursor.col}`))
    this.el.appendChild(span(info.dirty ? '● unsaved' : '● saved'))
  }

  private cycleEncoding(current: Encoding): void {
    const next = ENCODINGS[(ENCODINGS.indexOf(current) + 1) % ENCODINGS.length]
    this.handlers.onEncoding(next)
  }
}
```
(Clicking EOL toggles LF/CRLF; clicking encoding cycles through the four — simple, discoverable, no extra overlay.)

- [ ] **Step 2: Add `.sb-click` CSS to `index.html`**

```css
      .sb-click{cursor:pointer;text-decoration:underline dotted;text-underline-offset:2px}
      .sb-click:hover{opacity:.8}
```

- [ ] **Step 3: Wire handlers in `main.ts`**

Change the `StatusBar` construction and `refreshStatus`:
```ts
const statusBar = new StatusBar(document.getElementById('statusbar')!, {
  onEol: (eol) => { const id = paneFor(view.focusedPane()).currentBufferId(); const b = id && manager.get(id); if (b) { b.eol = eol; b.dirty = true; refreshStatus(); tabBar.render(manager.list(), manager.activeId); scheduleSessionSave() } },
  onEncoding: (enc) => { const id = paneFor(view.focusedPane()).currentBufferId(); const b = id && manager.get(id); if (b) { b.encoding = enc; b.dirty = true; refreshStatus(); tabBar.render(manager.list(), manager.activeId); scheduleSessionSave() } }
})
```
Update `refreshStatus` to read the focused pane's buffer (so the menus act on what you see) and pass `encoding`:
```ts
function refreshStatus(): void {
  const id = paneFor(view.focusedPane()).currentBufferId() ?? manager.activeId!
  const b = manager.get(id)!
  statusBar.update({ language: b.language, eol: b.eol, encoding: b.encoding, cursor: paneFor(view.focusedPane()).getCursor(), dirty: b.dirty })
}
```

- [ ] **Step 4: Build + tests + smoke**

Run: `npm run build` → clean. `npm test` → all pass. `npm run test:smoke` → passes.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: clickable encoding and EOL controls in the status bar"
```

---

### Task 5: Clipboard read IPC + diff modes (clipboard, files)

**Files:**
- Modify: `src/main/ipc.ts`, `src/preload/index.ts`, `src/shared/types.ts`, `src/renderer/commands.ts`, `src/renderer/main.ts`

**Interfaces:**
- Produces: `Api.clipboardRead(): Promise<string>`; two new palette commands "Diff: current vs clipboard" and "Diff: two files on disk".

- [ ] **Step 1: Add `clipboard:read` handler (`ipc.ts`)**

Add `clipboard` to the electron import and a handler:
```ts
import { clipboard, dialog, ipcMain, type BrowserWindow } from 'electron'
// ...inside registerIpc:
  ipcMain.handle('clipboard:read', () => clipboard.readText())
```

- [ ] **Step 2: Add to `Api` + preload**

`types.ts` Api: `clipboardRead(): Promise<string>`.
`preload/index.ts`: `clipboardRead: () => ipcRenderer.invoke('clipboard:read'),`

- [ ] **Step 3: Add diff-mode commands in `commands.ts`**

Extend `CommandDeps` with `diffClipboard: () => Promise<void>` and `diffFiles: () => Promise<void>`, and register:
```ts
  p.register({ id: 'diff-clip', label: 'Diff: current vs clipboard', run: () => d.diffClipboard() })
  p.register({ id: 'diff-files', label: 'Diff: two files on disk', run: () => d.diffFiles() })
```

- [ ] **Step 4: Implement the two helpers in `main.ts`**

```ts
async function diffClipboard(): Promise<void> {
  const pane = paneFor(view.focusedPane())
  const id = pane.currentBufferId(); if (!id) return
  const b = manager.get(id)!
  const clip = await window.api.clipboardRead()
  if (!clip) { toast('Clipboard is empty.'); return }
  diff.show(
    { title: b.title, content: pane.getContent(), language: b.language },
    { title: 'Clipboard', content: clip, language: b.language }
  )
}

async function diffFiles(): Promise<void> {
  const a = await window.api.openDialog(); if (!a) return
  const bPath = await window.api.openDialog(); if (!bPath) return
  const [fa, fb] = await Promise.all([window.api.readFile(a), window.api.readFile(bPath)])
  diff.show(
    { title: a.split(/[\\/]/).pop() ?? a, content: fa.content, language: '' },
    { title: bPath.split(/[\\/]/).pop() ?? bPath, content: fb.content, language: '' }
  )
}
```
Pass both into `registerCommands({ ..., diffClipboard, diffFiles })`. (Language `''` lets Monaco use plaintext for file diffs; acceptable v1.)

- [ ] **Step 5: Build + smoke**

Run: `npm run build` → clean. `npm test` → all pass. `npm run test:smoke` → passes.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: clipboard-vs-current and file-vs-file diff modes"
```

---

### Task 6: Markdown preview (render helper + side-by-side panel)

**Files:**
- Create: `src/renderer/markdownRender.ts`, `src/renderer/markdownPreview.ts`
- Modify: `package.json` (deps), `src/renderer/commands.ts`, `src/renderer/main.ts`, `src/renderer/index.html`
- Test: `tests/unit/markdownRender.test.ts`

**Interfaces:**
- Produces: `renderMarkdown(md: string): string` (sanitized HTML); `MarkdownPreview` class with `toggle()`, `isVisible()`, `update(md)`.

- [ ] **Step 1: Install deps**

Run: `npm install markdown-it dompurify && npm install -D @types/markdown-it`
Expected: added to package.json/package-lock, no error. (`dompurify` ships its own types.)

- [ ] **Step 2: Write the failing test `tests/unit/markdownRender.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { renderMarkdown } from '../../src/renderer/markdownRender'

describe('renderMarkdown', () => {
  it('renders basic markdown to html', () => {
    expect(renderMarkdown('# Hi')).toContain('<h1>Hi</h1>')
    expect(renderMarkdown('**b**')).toContain('<strong>b</strong>')
  })
  it('strips script tags (sanitized)', () => {
    const out = renderMarkdown('hi <script>alert(1)</script>')
    expect(out).not.toContain('<script>')
  })
})
```
(This needs a DOM for DOMPurify. Add a jsdom environment directive at the top of the test file: `// @vitest-environment jsdom`. Install jsdom in Step 3 if missing.)

- [ ] **Step 3: Run test (fails) and ensure jsdom is available**

Run: `npm test -- markdownRender`
Expected: FAIL — module not found (and/or jsdom missing). If vitest reports jsdom missing, run `npm install -D jsdom` and add `// @vitest-environment jsdom` as the FIRST line of the test file.

- [ ] **Step 4: Implement `src/renderer/markdownRender.ts`**

```ts
import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'

const md = new MarkdownIt({ html: false, linkify: true, breaks: true })

export function renderMarkdown(src: string): string {
  return DOMPurify.sanitize(md.render(src))
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- markdownRender`
Expected: PASS (2 cases).

- [ ] **Step 6: Implement `src/renderer/markdownPreview.ts`**

```ts
import { renderMarkdown } from './markdownRender'

export class MarkdownPreview {
  private visible = false
  constructor(private panel: HTMLElement, private onLayout: () => void) {}

  isVisible(): boolean { return this.visible }

  toggle(): boolean {
    this.visible = !this.visible
    this.panel.classList.toggle('hidden', !this.visible)
    this.onLayout()
    return this.visible
  }

  update(md: string): void {
    if (!this.visible) return
    try { this.panel.innerHTML = renderMarkdown(md) }
    catch { this.panel.textContent = 'Preview failed to render.' }
  }
}
```

- [ ] **Step 7: Add the panel container + CSS to `index.html`**

In `#panes`, after `#paneB`:
```html
      <div id="mdpreview" class="hidden"></div>
```
(i.e. `<div id="panes"><div id="paneA" class="pane"></div><div id="paneB" class="pane hidden"></div><div id="mdpreview" class="hidden"></div></div>`)
CSS:
```css
      #mdpreview{flex:1;min-width:0;overflow:auto;padding:0 16px;background:var(--editorbg);color:var(--bartext)}
      #mdpreview.hidden{display:none}
      #mdpreview pre{background:rgba(127,127,127,.15);padding:8px;border-radius:4px;overflow:auto}
      #mdpreview code{font-family:Consolas,monospace}
```

- [ ] **Step 8: Wire preview in `main.ts` + a command**

Construct it and refresh it on edits and buffer switches:
```ts
import { MarkdownPreview } from './markdownPreview'
const mdPreview = new MarkdownPreview(document.getElementById('mdpreview')!, () => { view.paneA.layout(); view.paneB.layout() })

function previewContent(): string { return paneFor(view.focusedPane()).getContent() }
function refreshPreview(): void { mdPreview.update(previewContent()) }
```
Call `refreshPreview()` inside `showActive()` (after setBuffer) and inside the per-pane `onChange` handler (after `manager.update`). Add to `CommandDeps` a `togglePreview: () => void` and register in `commands.ts`:
```ts
  p.register({ id: 'mdpreview', label: 'Toggle Markdown Preview', run: () => d.togglePreview() })
```
Implement in `main.ts`: `const togglePreview = () => { mdPreview.toggle(); refreshPreview() }` and pass it into `registerCommands`.

- [ ] **Step 9: Build + tests + smoke**

Run: `npm run build` → clean. `npm test` → all pass. `npm run test:smoke` → passes.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: side-by-side markdown preview (markdown-it + DOMPurify)"
```

---

### Task 7: Clipboard history store (main) + IPC

**Files:**
- Create: `src/main/clipboardHistoryStore.ts`
- Modify: `src/main/ipc.ts`, `src/preload/index.ts`, `src/shared/types.ts`
- Test: `tests/unit/clipboardHistoryStore.test.ts`

**Interfaces:**
- Produces:
  - `class ClipboardHistoryStore { constructor(baseDir: string); load(): Promise<string[]>; save(entries: string[]): Promise<void> }` → `<baseDir>/clipboard-history.json`; corrupt/missing → `[]`.
  - `Api.loadClipboardHistory(): Promise<string[]>`, `Api.saveClipboardHistory(entries: string[]): Promise<void>`.

- [ ] **Step 1: Write the failing test `tests/unit/clipboardHistoryStore.test.ts`**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ClipboardHistoryStore } from '../../src/main/clipboardHistoryStore'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'nc-clip-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

describe('ClipboardHistoryStore', () => {
  it('returns [] when missing', async () => {
    expect(await new ClipboardHistoryStore(dir).load()).toEqual([])
  })
  it('saves and reloads', async () => {
    const s = new ClipboardHistoryStore(dir)
    await s.save(['a', 'b'])
    expect(await new ClipboardHistoryStore(dir).load()).toEqual(['a', 'b'])
  })
  it('returns [] on corrupt file', async () => {
    writeFileSync(join(dir, 'clipboard-history.json'), '{bad')
    expect(await new ClipboardHistoryStore(dir).load()).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- clipboardHistoryStore`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/main/clipboardHistoryStore.ts`**

```ts
import { promises as fs } from 'node:fs'
import { join } from 'node:path'

export class ClipboardHistoryStore {
  private file: string
  constructor(baseDir: string) { this.file = join(baseDir, 'clipboard-history.json') }

  async load(): Promise<string[]> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.file, 'utf8'))
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
    } catch { return [] }
  }

  async save(entries: string[]): Promise<void> {
    await fs.writeFile(this.file, JSON.stringify(entries), 'utf8')
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- clipboardHistoryStore`
Expected: PASS (3 cases).

- [ ] **Step 5: Wire IPC + preload + Api**

`ipc.ts` — construct the store and add handlers:
```ts
import { ClipboardHistoryStore } from './clipboardHistoryStore'
// inside registerIpc:
  const clip = new ClipboardHistoryStore(deps.baseDir)
  ipcMain.handle('clipboard-history:load', () => clip.load())
  ipcMain.handle('clipboard-history:save', (_e, entries: string[]) => clip.save(entries))
```
`types.ts` Api: `loadClipboardHistory(): Promise<string[]>`, `saveClipboardHistory(entries: string[]): Promise<void>`.
`preload/index.ts`:
```ts
  loadClipboardHistory: () => ipcRenderer.invoke('clipboard-history:load'),
  saveClipboardHistory: (entries) => ipcRenderer.invoke('clipboard-history:save', entries),
```

- [ ] **Step 6: Build + tests**

Run: `npm run build` → clean. `npm test` → all pass.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: persistent clipboard-history store with IPC"
```

---

### Task 8: Paste-history list logic + capture wiring

**Files:**
- Create: `src/renderer/pasteHistory.ts`
- Modify: `src/renderer/editorPane.ts`, `src/renderer/main.ts`
- Test: `tests/unit/pasteHistory.test.ts`

**Interfaces:**
- Produces:
  - `class PasteHistoryList { constructor(cap?: number, maxLen?: number); add(text: string): void; entries(): string[]; clear(): void; load(entries: string[]): void }` — most-recent-first, dedupe by exact text, cap 50, truncate entries over `maxLen` (default 1_000_000) with ` …[truncated]`.
  - `EditorPane`: `onPaste(cb)`, `onCopyCut(cb)`, `insertAtCursor(text)`.

- [ ] **Step 1: Write the failing test `tests/unit/pasteHistory.test.ts`**

```ts
import { describe, it, expect } from 'vitest'
import { PasteHistoryList } from '../../src/renderer/pasteHistory'

describe('PasteHistoryList', () => {
  it('adds most-recent-first and dedupes', () => {
    const h = new PasteHistoryList()
    h.add('a'); h.add('b'); h.add('a')
    expect(h.entries()).toEqual(['a', 'b'])
  })
  it('caps entries', () => {
    const h = new PasteHistoryList(2)
    h.add('a'); h.add('b'); h.add('c')
    expect(h.entries()).toEqual(['c', 'b'])
  })
  it('ignores empty/whitespace', () => {
    const h = new PasteHistoryList()
    h.add(''); h.add('   ')
    expect(h.entries()).toEqual([])
  })
  it('truncates oversized entries', () => {
    const h = new PasteHistoryList(50, 5)
    h.add('abcdefgh')
    expect(h.entries()[0]).toBe('abcde …[truncated]')
  })
  it('load replaces entries', () => {
    const h = new PasteHistoryList()
    h.add('x'); h.load(['p', 'q'])
    expect(h.entries()).toEqual(['p', 'q'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- pasteHistory`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/renderer/pasteHistory.ts`**

```ts
export class PasteHistoryList {
  private items: string[] = []
  constructor(private cap = 50, private maxLen = 1_000_000) {}

  add(text: string): void {
    if (!text || !text.trim()) return
    const value = text.length > this.maxLen ? text.slice(0, this.maxLen) + ' …[truncated]' : text
    this.items = [value, ...this.items.filter(x => x !== value)].slice(0, this.cap)
  }

  entries(): string[] { return this.items }
  clear(): void { this.items = [] }
  load(entries: string[]): void { this.items = entries.slice(0, this.cap) }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- pasteHistory`
Expected: PASS (5 cases).

- [ ] **Step 5: Add capture/insert methods to `editorPane.ts`**

Store the container and add the three methods. In the constructor, save `this.container = container`. Add a field `private container: HTMLElement` and `private pasteListener: monaco.IDisposable | null = null`. Then:
```ts
  onPaste(cb: (text: string) => void): void {
    this.pasteListener?.dispose()
    this.pasteListener = this.editor.onDidPaste(e => {
      const text = this.editor.getModel()?.getValueInRange(e.range) ?? ''
      if (text) cb(text)
    })
  }
  onCopyCut(cb: (text: string) => void): void {
    const handler = () => {
      const sel = this.editor.getSelection()
      const text = sel ? this.editor.getModel()?.getValueInRange(sel) ?? '' : ''
      if (text) cb(text)
    }
    this.container.addEventListener('copy', handler)
    this.container.addEventListener('cut', handler)
  }
  insertAtCursor(text: string): void {
    const sel = this.editor.getSelection()
    if (!sel) return
    this.editor.executeEdits('paste-history', [{ range: sel, text, forceMoveMarkers: true }])
    this.editor.focus()
  }
```
Also dispose `this.pasteListener` in `dispose()`.

- [ ] **Step 6: Wire capture in `main.ts`**

```ts
import { PasteHistoryList } from './pasteHistory'
const pasteHistory = new PasteHistoryList()
let clipSaveTimer: number | undefined
function persistClipHistory(): void {
  clearTimeout(clipSaveTimer)
  clipSaveTimer = setTimeout(() => window.api.saveClipboardHistory(pasteHistory.entries()), 500) as unknown as number
}
function captureClip(text: string): void { pasteHistory.add(text); persistClipHistory() }
for (const which of ['A', 'B'] as const) {
  paneFor(which).onPaste(captureClip)
  paneFor(which).onCopyCut(captureClip)
}
```
In `boot()`, after settings load, restore history: `pasteHistory.load(await window.api.loadClipboardHistory())`.

- [ ] **Step 7: Build + tests + smoke**

Run: `npm run build` → clean. `npm test` → all pass. `npm run test:smoke` → passes.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: capture in-app paste/copy into a persistent paste history"
```

---

### Task 9: Paste-history picker + commands

**Files:**
- Create: `src/renderer/pasteHistoryPicker.ts`
- Modify: `src/renderer/commands.ts`, `src/renderer/main.ts`, `src/renderer/index.html`

**Interfaces:**
- Produces: `class PasteHistoryPicker { constructor(host: HTMLElement); open(entries: string[], onPick: (text: string) => void): void }`; palette commands "Paste from History", "Clear Paste History".

- [ ] **Step 1: Implement `src/renderer/pasteHistoryPicker.ts`**

```ts
export class PasteHistoryPicker {
  private overlay: HTMLDivElement
  private listEl: HTMLDivElement
  private onPick: ((text: string) => void) | null = null

  constructor(host: HTMLElement) {
    this.overlay = document.createElement('div')
    this.overlay.className = 'ph-picker hidden'
    this.listEl = document.createElement('div')
    this.listEl.className = 'ph-list'
    this.overlay.appendChild(this.listEl)
    host.appendChild(this.overlay)
    this.overlay.addEventListener('click', (e) => { if (e.target === this.overlay) this.close() })
    this.overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close() })
  }

  open(entries: string[], onPick: (text: string) => void): void {
    this.onPick = onPick
    this.listEl.replaceChildren(...entries.map(text => {
      const row = document.createElement('div')
      row.className = 'ph-row'
      row.textContent = text.replace(/\s+/g, ' ').slice(0, 120) || '(empty)'
      row.title = text.slice(0, 2000)
      row.onclick = () => { this.close(); this.onPick?.(text) }
      return row
    }))
    if (entries.length === 0) { const e = document.createElement('div'); e.className = 'ph-row'; e.textContent = '(no history yet)'; this.listEl.appendChild(e) }
    this.overlay.classList.remove('hidden')
    this.overlay.setAttribute('tabindex', '-1')
    this.overlay.focus()
  }

  private close(): void { this.overlay.classList.add('hidden') }
}
```

- [ ] **Step 2: Add picker CSS to `index.html`**

```css
      .ph-picker{position:fixed;inset:0;background:rgba(0,0,0,.3);display:flex;justify-content:center;align-items:flex-start;padding-top:80px}
      .ph-picker.hidden{display:none}
      .ph-list{width:560px;max-height:340px;overflow:auto;background:var(--bar);color:var(--bartext)}
      .ph-row{padding:6px 10px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-bottom:1px solid rgba(127,127,127,.15)}
      .ph-row:hover{background:#094771;color:#fff}
```

- [ ] **Step 3: Wire commands in `commands.ts` + `main.ts`**

`CommandDeps` += `pasteFromHistory: () => void`, `clearPasteHistory: () => void`. Register:
```ts
  p.register({ id: 'paste-history', label: 'Paste from History', run: () => d.pasteFromHistory() })
  p.register({ id: 'clear-paste-history', label: 'Clear Paste History', run: () => d.clearPasteHistory() })
```
`main.ts`:
```ts
import { PasteHistoryPicker } from './pasteHistoryPicker'
const phPicker = new PasteHistoryPicker(document.getElementById('app')!)
const pasteFromHistory = () => phPicker.open(pasteHistory.entries(), (text) => { paneFor(view.focusedPane()).insertAtCursor(text) })
const clearPasteHistory = () => { pasteHistory.clear(); persistClipHistory(); toast('Paste history cleared.') }
```
Pass both into `registerCommands`.

- [ ] **Step 4: Build + tests + smoke**

Run: `npm run build` → clean. `npm test` → all pass. `npm run test:smoke` → passes.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: paste-from-history picker and clear command"
```

---

### Task 10: Extend smoke tests

**Files:**
- Modify: `tests/smoke/app.spec.ts`

**Interfaces:**
- Consumes: the built app; commands "Toggle Markdown Preview", "Paste from History".

- [ ] **Step 1: Add a markdown-preview + paste-history smoke test**

Append a second test to `tests/smoke/app.spec.ts`:
```ts
test('markdown preview toggles and paste-history picker opens', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-smoke-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()

    // Toggle Markdown Preview -> panel visible
    await win.keyboard.press('Control+Shift+P')
    await win.locator('#palette input').fill('Toggle Markdown Preview')
    await win.keyboard.press('Enter')
    await expect(win.locator('#mdpreview')).toBeVisible()

    // Paste from History -> picker overlay appears
    await win.keyboard.press('Control+Shift+P')
    await win.locator('#palette input').fill('Paste from History')
    await win.keyboard.press('Enter')
    await expect(win.locator('.ph-picker')).toBeVisible()
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
```

- [ ] **Step 2: Build + run smoke**

Run: `npm run build` then `npm run test:smoke`
Expected: both smoke tests pass (the original + the new one).

- [ ] **Step 3: Full unit suite**

Run: `npm test`
Expected: all unit tests pass (encoding, clipboardHistoryStore, pasteHistory, markdownRender, fileService, + v1 suites).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test: smoke coverage for markdown preview and paste history"
```

---

## Self-Review

**Spec coverage (each §4 item → task):**
- §4.1 diff modes (clipboard + file) → Task 5 ✓
- §4.2 markdown preview → Task 6 ✓
- §4.3 paste history (capture + store + picker) → Tasks 7, 8, 9 ✓
- §4.4 encoding + EOL → Tasks 2, 3, 4 ✓
- §4.5 palette hints → Task 1 ✓
- §4.6 commands.ts extraction → Task 1 ✓
- §8 testing: encoding/clipboardHistoryStore/pasteHistory/markdownRender unit + smoke → Tasks 2,6,7,8,10 ✓

**Placeholder scan:** No TBD/TODO; every code step has concrete code. The `''` language for file-vs-file diff (Task 5) is an intentional v1 simplification (Monaco falls back to plaintext), noted inline.

**Type consistency:** `Encoding` defined in Task 2 (`types.ts`), used identically in fileService/ipc/preload/bufferManager/statusBar (Tasks 3,4) and `Api.writeFile`. `BufferState.encoding` added in Task 3 and read in Task 4's status bar + Task 3's `saveActive`. `PasteHistoryList` method names (`add/entries/clear/load`) consistent across Tasks 8,9. `MarkdownPreview` (`toggle/isVisible/update`) and `renderMarkdown` consistent across Task 6. `CommandDeps` grows monotonically across Tasks 1,5,6,9 — each task adds its fields and the corresponding `registerCommands` caller args.

**Decomposition note:** `main.ts` gains preview/paste/diff-mode wiring but sheds all command registration to `commands.ts` (Task 1), so it stays a focused bootstrap. New surfaces are isolated, single-responsibility files.

**Known carry-forward:** the `git add -A` commits in this plan can sweep `package-lock.json` updates (Task 6 adds deps) — that is correct (lockfile should be tracked).
