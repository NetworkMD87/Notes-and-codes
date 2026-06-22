# Notes & Codes v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fast, dev-focused Windows scratchpad (Notepad-simple, code-editor-powerful) for pasting, editing, and diffing notes/code across many never-lose-it buffers.

**Architecture:** Electron app, two processes. Main process owns OS work (windows, disk I/O, session/settings storage, Windows context-menu registry, single-instance file routing). Renderer owns the UI (Monaco editors, tabs, split panes, theme, command palette) in plain TypeScript plus `Split.js`. They talk over a narrow, typed IPC channel exposed through a `contextBridge` preload; the renderer never touches disk directly (`contextIsolation` on, `nodeIntegration` off). Pure logic (buffer model, session store, settings store) lives in framework-free modules unit-tested with Vitest; UI is covered by Playwright smoke tests.

**Tech Stack:** Electron, TypeScript, `electron-vite` (Vite-based main/preload/renderer build + HMR), Monaco editor, Split.js, electron-builder (NSIS installer + portable), Vitest (unit), Playwright (Electron smoke tests).

## Global Constraints

- App name: `Notes-and-codes`; display/product name: `Notes & Codes` (use verbatim in installer, window title, registry labels).
- Platform: Windows-first. Context-menu uses **HKCU** registry only — never HKLM, never anything requiring admin/UAC.
- Electron security: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Renderer reaches the OS **only** through the preload `window.api` bridge.
- Storage root: `%APPDATA%/Notes-and-codes/` — `session/` for buffers, `settings.json` for settings. Use Electron `app.getPath('userData')` (resolves there) — never hardcode the path.
- Session auto-save: ON by default; a Settings toggle (`autoSaveSession`) disables it.
- Diff in v1 is **tab-vs-tab only**. Clipboard-diff and file-diff are v2 — do not build them.
- Markdown preview is v2 — do not build it.
- Language: TypeScript everywhere, `strict: true`. Indent 2 spaces.
- Commit after every task with the message shown in its final step.

## File Structure

```
Notes-and-codes/
  package.json                 # deps, scripts
  tsconfig.json                # strict TS, shared
  tsconfig.node.json           # main/preload build types
  electron.vite.config.ts      # electron-vite: main/preload/renderer
  electron-builder.yml         # packaging + NSIS context-menu hooks
  vitest.config.ts             # unit test config (node env)
  playwright.config.ts         # electron smoke tests
  build/
    installer.nsh              # NSIS custom: add/remove context-menu keys
  src/
    shared/
      types.ts                 # Buffer, Settings, IPC contract types (no runtime deps)
    main/
      index.ts                 # app lifecycle, BrowserWindow, single-instance, file-arg routing
      ipc.ts                   # registers ipcMain handlers, delegates to services
      fileService.ts           # read/write a file path (pure-ish, fs)
      sessionStore.ts          # persist/restore buffers under a base dir
      settingsStore.ts         # load/save settings.json under a base dir
      contextMenu.ts           # add/remove HKCU "Open with Notes & Codes" keys
    preload/
      index.ts                 # contextBridge -> window.api (typed)
    renderer/
      index.html
      main.ts                  # renderer bootstrap: build managers, wire events
      bufferManager.ts         # in-memory buffer list logic (pure, testable)
      editorPane.ts            # Monaco instance wrapper + line-number toggle
      splitView.ts             # Split.js: single/split toggle, assign buffer per pane
      tabBar.ts                # tab DOM: render/select/close/reorder
      theme.ts                 # light/dark/follow-os apply + persist
      diffView.ts              # tab-vs-tab diff open/close (Monaco diff editor)
      commandPalette.ts        # Ctrl+Shift+P command registry + UI
      statusBar.ts             # language/encoding/EOL/cursor/save indicator
  tests/
    unit/                      # vitest specs mirror src module names
    smoke/                     # playwright electron specs
```

**Responsibility boundaries:** `bufferManager`, `sessionStore`, `settingsStore`, `bufferManager` are pure logic (no Electron/DOM) → unit-tested. `editorPane`/`splitView`/`tabBar`/`diffView`/`commandPalette`/`statusBar` are DOM/Monaco → smoke-tested. `ipc.ts` is the only main-side wiring; `preload/index.ts` is the only renderer-side OS surface.

---

### Task 1: Project scaffold — app launches an empty window

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `electron.vite.config.ts`, `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/index.html`, `src/renderer/main.ts`, `.gitignore`

**Interfaces:**
- Consumes: nothing.
- Produces: `npm run dev` launches a window; `npm run build` compiles. Establishes the electron-vite three-entry layout every later task plugs into.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "notes-and-codes",
  "version": "0.1.0",
  "description": "Notes & Codes — a fast dev scratchpad",
  "main": "out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "preview": "electron-vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:smoke": "playwright test",
    "package": "electron-vite build && electron-builder"
  },
  "devDependencies": {
    "electron": "^31.0.0",
    "electron-builder": "^24.13.3",
    "electron-vite": "^2.3.0",
    "vite": "^5.3.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "@playwright/test": "^1.45.0"
  },
  "dependencies": {
    "monaco-editor": "^0.50.0",
    "split.js": "^1.6.5"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, no error exit. (Network access required.)

- [ ] **Step 3: Create `tsconfig.json` and `tsconfig.node.json`**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "noUnusedLocals": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "include": ["src"]
}
```

`tsconfig.node.json`:
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": { "composite": true, "lib": ["ES2022"] },
  "include": ["src/main", "src/preload", "electron.vite.config.ts"]
}
```

- [ ] **Step 4: Create `electron.vite.config.ts`**

```ts
import { defineConfig } from 'electron-vite'
import { resolve } from 'node:path'

export default defineConfig({
  main: { build: { rollupOptions: { input: resolve(__dirname, 'src/main/index.ts') } } },
  preload: { build: { rollupOptions: { input: resolve(__dirname, 'src/preload/index.ts') } } },
  renderer: {
    root: 'src/renderer',
    build: { rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') } }
  }
})
```

- [ ] **Step 5: Create the minimal main process `src/main/index.ts`**

```ts
import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    title: 'Notes & Codes',
    backgroundColor: '#1e1e1e',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  return win
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 6: Create minimal `src/preload/index.ts`**

```ts
// Bridge is populated in Task 5. Empty for now keeps the preload entry valid.
export {}
```

- [ ] **Step 7: Create `src/renderer/index.html` and `src/renderer/main.ts`**

`index.html`:
```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:;" />
    <title>Notes & Codes</title>
  </head>
  <body>
    <div id="app">Notes &amp; Codes — booting…</div>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

`main.ts`:
```ts
const root = document.getElementById('app')
if (root) root.textContent = 'Notes & Codes ready.'
```

- [ ] **Step 8: Create `.gitignore`**

```
node_modules/
out/
dist/
test-results/
playwright-report/
```

- [ ] **Step 9: Run the app to verify it launches**

Run: `npm run dev`
Expected: an Electron window titled "Notes & Codes" opens showing "Notes & Codes ready." No console errors. Close it to continue.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: scaffold electron-vite app that launches an empty window"
```

---

### Task 2: Shared types

**Files:**
- Create: `src/shared/types.ts`
- Test: `tests/unit/types.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type EolMode = 'LF' | 'CRLF'`
  - `interface BufferState { id: string; title: string; filePath: string | null; content: string; language: string; eol: EolMode; dirty: boolean }`
  - `type ThemeMode = 'light' | 'dark' | 'follow-os'`
  - `interface Settings { theme: ThemeMode; autoSaveSession: boolean; contextMenuEnabled: boolean; windowBounds: { width: number; height: number } | null }`
  - `const DEFAULT_SETTINGS: Settings`
  - `interface SessionData { buffers: BufferState[]; activeId: string | null }`
  - `interface Api { … }` (the preload bridge contract; fleshed out in Task 5 — declared minimally here)

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/types.test.ts
import { describe, it, expect } from 'vitest'
import { DEFAULT_SETTINGS } from '../../src/shared/types'

describe('DEFAULT_SETTINGS', () => {
  it('defaults theme to follow-os and auto-save on', () => {
    expect(DEFAULT_SETTINGS.theme).toBe('follow-os')
    expect(DEFAULT_SETTINGS.autoSaveSession).toBe(true)
    expect(DEFAULT_SETTINGS.contextMenuEnabled).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- types`
Expected: FAIL — cannot find module `../../src/shared/types`.

- [ ] **Step 3: Create `src/shared/types.ts`**

```ts
export type EolMode = 'LF' | 'CRLF'

export interface BufferState {
  id: string
  title: string
  filePath: string | null
  content: string
  language: string
  eol: EolMode
  dirty: boolean
}

export type ThemeMode = 'light' | 'dark' | 'follow-os'

export interface Settings {
  theme: ThemeMode
  autoSaveSession: boolean
  contextMenuEnabled: boolean
  windowBounds: { width: number; height: number } | null
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'follow-os',
  autoSaveSession: true,
  contextMenuEnabled: false,
  windowBounds: null
}

export interface SessionData {
  buffers: BufferState[]
  activeId: string | null
}

/** Result of opening a file from disk (Task 5). */
export interface OpenedFile {
  filePath: string
  content: string
  eol: EolMode
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- types`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts tests/unit/types.test.ts vitest.config.ts
git commit -m "feat: add shared type contracts and default settings"
```

Note: if `npm test` errors that no config exists, create `vitest.config.ts` first:
```ts
import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { environment: 'node', include: ['tests/unit/**/*.test.ts'] } })
```

---

### Task 3: Buffer manager (pure logic)

**Files:**
- Create: `src/renderer/bufferManager.ts`
- Test: `tests/unit/bufferManager.test.ts`

**Interfaces:**
- Consumes: `BufferState`, `SessionData` from `shared/types`.
- Produces a class `BufferManager`:
  - `constructor(idFactory: () => string)` — inject id generation (deterministic tests).
  - `list(): BufferState[]`
  - `activeId: string | null` (getter)
  - `create(opts?: Partial<BufferState>): BufferState` — appends a new buffer, makes it active, returns it.
  - `open(file: { filePath: string; content: string; eol: EolMode }): BufferState` — if a buffer with that filePath exists, activate it; else create one (not dirty).
  - `setActive(id: string): void`
  - `update(id: string, content: string): void` — sets content, marks `dirty: true`.
  - `markSaved(id: string, filePath: string): void` — sets filePath/title, `dirty: false`.
  - `close(id: string): void` — removes; if it was active, activates the neighbor (next, else prev, else null).
  - `setLanguage(id, language)`, `get(id): BufferState | undefined`
  - `toSession(): SessionData`, `restore(data: SessionData): void`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/bufferManager.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { BufferManager } from '../../src/renderer/bufferManager'

let n: number
const ids = () => `id-${++n}`

describe('BufferManager', () => {
  let m: BufferManager
  beforeEach(() => { n = 0; m = new BufferManager(ids) })

  it('creates an untitled active buffer', () => {
    const b = m.create()
    expect(b.id).toBe('id-1')
    expect(b.title).toBe('Untitled-1')
    expect(b.dirty).toBe(false)
    expect(m.activeId).toBe('id-1')
  })

  it('marks dirty on update and clean on save', () => {
    const b = m.create()
    m.update(b.id, 'hello')
    expect(m.get(b.id)!.dirty).toBe(true)
    expect(m.get(b.id)!.content).toBe('hello')
    m.markSaved(b.id, 'C:/x/note.txt')
    expect(m.get(b.id)!.dirty).toBe(false)
    expect(m.get(b.id)!.title).toBe('note.txt')
  })

  it('open activates an existing buffer with the same path instead of duplicating', () => {
    const first = m.open({ filePath: 'C:/a.ts', content: 'a', eol: 'LF' })
    const again = m.open({ filePath: 'C:/a.ts', content: 'a', eol: 'LF' })
    expect(m.list()).toHaveLength(1)
    expect(again.id).toBe(first.id)
  })

  it('closing the active buffer activates a neighbor', () => {
    const a = m.create(); const b = m.create(); m.setActive(a.id)
    m.close(a.id)
    expect(m.activeId).toBe(b.id)
    expect(m.list()).toHaveLength(1)
  })

  it('round-trips through session', () => {
    m.create(); m.update('id-1', 'x')
    const data = m.toSession()
    const m2 = new BufferManager(ids)
    m2.restore(data)
    expect(m2.list()).toHaveLength(1)
    expect(m2.get('id-1')!.content).toBe('x')
    expect(m2.activeId).toBe('id-1')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- bufferManager`
Expected: FAIL — cannot find module `bufferManager`.

- [ ] **Step 3: Implement `src/renderer/bufferManager.ts`**

```ts
import type { BufferState, SessionData, EolMode } from '../shared/types'

export class BufferManager {
  private buffers: BufferState[] = []
  private _activeId: string | null = null
  private untitledCount = 0

  constructor(private idFactory: () => string) {}

  list(): BufferState[] { return this.buffers }
  get activeId(): string | null { return this._activeId }
  get(id: string): BufferState | undefined { return this.buffers.find(b => b.id === id) }

  create(opts: Partial<BufferState> = {}): BufferState {
    this.untitledCount += 1
    const b: BufferState = {
      id: opts.id ?? this.idFactory(),
      title: opts.title ?? `Untitled-${this.untitledCount}`,
      filePath: opts.filePath ?? null,
      content: opts.content ?? '',
      language: opts.language ?? 'plaintext',
      eol: opts.eol ?? 'LF',
      dirty: opts.dirty ?? false
    }
    this.buffers.push(b)
    this._activeId = b.id
    return b
  }

  open(file: { filePath: string; content: string; eol: EolMode }): BufferState {
    const existing = this.buffers.find(b => b.filePath === file.filePath)
    if (existing) { this._activeId = existing.id; return existing }
    const title = file.filePath.split(/[\\/]/).pop() ?? file.filePath
    return this.create({ filePath: file.filePath, content: file.content, eol: file.eol, title })
  }

  setActive(id: string): void { if (this.get(id)) this._activeId = id }

  update(id: string, content: string): void {
    const b = this.get(id)
    if (!b) return
    b.content = content
    b.dirty = true
  }

  markSaved(id: string, filePath: string): void {
    const b = this.get(id)
    if (!b) return
    b.filePath = filePath
    b.title = filePath.split(/[\\/]/).pop() ?? filePath
    b.dirty = false
  }

  setLanguage(id: string, language: string): void {
    const b = this.get(id); if (b) b.language = language
  }

  close(id: string): void {
    const idx = this.buffers.findIndex(b => b.id === id)
    if (idx === -1) return
    const wasActive = this._activeId === id
    this.buffers.splice(idx, 1)
    if (wasActive) {
      const neighbor = this.buffers[idx] ?? this.buffers[idx - 1] ?? null
      this._activeId = neighbor ? neighbor.id : null
    }
  }

  toSession(): SessionData { return { buffers: this.buffers, activeId: this._activeId } }

  restore(data: SessionData): void {
    this.buffers = data.buffers
    this._activeId = data.activeId
    this.untitledCount = this.buffers.length
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- bufferManager`
Expected: PASS (all 5 cases).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/bufferManager.ts tests/unit/bufferManager.test.ts
git commit -m "feat: add buffer manager with session round-trip"
```

---

### Task 4: Session store (main process persistence)

**Files:**
- Create: `src/main/sessionStore.ts`
- Test: `tests/unit/sessionStore.test.ts`

**Interfaces:**
- Consumes: `SessionData` from `shared/types`.
- Produces:
  - `class SessionStore { constructor(baseDir: string); save(data: SessionData): Promise<void>; load(): Promise<SessionData> }`
  - Writes to `<baseDir>/session/session.json`. `load()` returns `{ buffers: [], activeId: null }` if the file is missing or corrupt (never throws).

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/sessionStore.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SessionStore } from '../../src/main/sessionStore'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'nc-sess-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

describe('SessionStore', () => {
  it('returns an empty session when nothing saved', async () => {
    const s = new SessionStore(dir)
    expect(await s.load()).toEqual({ buffers: [], activeId: null })
  })

  it('saves and reloads a session', async () => {
    const s = new SessionStore(dir)
    const data = { buffers: [{ id: 'a', title: 'A', filePath: null, content: 'x', language: 'plaintext', eol: 'LF' as const, dirty: true }], activeId: 'a' }
    await s.save(data)
    expect(await new SessionStore(dir).load()).toEqual(data)
  })

  it('returns empty session on corrupt file', async () => {
    const s = new SessionStore(dir)
    const { writeFileSync, mkdirSync } = await import('node:fs')
    mkdirSync(join(dir, 'session'), { recursive: true })
    writeFileSync(join(dir, 'session', 'session.json'), '{ not json')
    expect(await s.load()).toEqual({ buffers: [], activeId: null })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- sessionStore`
Expected: FAIL — cannot find module `sessionStore`.

- [ ] **Step 3: Implement `src/main/sessionStore.ts`**

```ts
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { SessionData } from '../shared/types'

const EMPTY: SessionData = { buffers: [], activeId: null }

export class SessionStore {
  private file: string
  private dir: string
  constructor(baseDir: string) {
    this.dir = join(baseDir, 'session')
    this.file = join(this.dir, 'session.json')
  }

  async save(data: SessionData): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true })
    await fs.writeFile(this.file, JSON.stringify(data, null, 2), 'utf8')
  }

  async load(): Promise<SessionData> {
    try {
      const raw = await fs.readFile(this.file, 'utf8')
      const parsed = JSON.parse(raw)
      if (!parsed || !Array.isArray(parsed.buffers)) return { ...EMPTY }
      return parsed as SessionData
    } catch {
      return { ...EMPTY }
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- sessionStore`
Expected: PASS (all 3 cases).

- [ ] **Step 5: Commit**

```bash
git add src/main/sessionStore.ts tests/unit/sessionStore.test.ts
git commit -m "feat: add session store with corrupt-file safety"
```

---

### Task 5: Settings store, file service, IPC contract & preload bridge

**Files:**
- Create: `src/main/settingsStore.ts`, `src/main/fileService.ts`, `src/main/ipc.ts`, `src/preload/index.ts` (replace stub)
- Modify: `src/shared/types.ts` (add `Api` interface), `src/main/index.ts` (call `registerIpc`)
- Test: `tests/unit/settingsStore.test.ts`, `tests/unit/fileService.test.ts`

**Interfaces:**
- Consumes: `Settings`, `DEFAULT_SETTINGS`, `SessionData`, `OpenedFile`, `EolMode`.
- Produces:
  - `class SettingsStore { constructor(baseDir: string); load(): Promise<Settings>; save(s: Settings): Promise<void> }` — `<baseDir>/settings.json`; `load()` merges onto `DEFAULT_SETTINGS`, never throws.
  - `fileService.readFileForEditor(path): Promise<OpenedFile>` and `writeFile(path, content, eol): Promise<void>`; `detectEol(content): EolMode`.
  - `registerIpc(deps)` in `ipc.ts` registering channels: `file:read`, `file:write`, `session:load`, `session:save`, `settings:load`, `settings:save`.
  - Preload exposes `window.api: Api` mirroring those channels plus `onOpenFile(cb)` (main→renderer push when launched with a file arg, used in Task 13).

- [ ] **Step 1: Write failing tests**

```ts
// tests/unit/settingsStore.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SettingsStore } from '../../src/main/settingsStore'
import { DEFAULT_SETTINGS } from '../../src/shared/types'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'nc-set-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

describe('SettingsStore', () => {
  it('returns defaults when missing', async () => {
    expect(await new SettingsStore(dir).load()).toEqual(DEFAULT_SETTINGS)
  })
  it('merges partial saved settings onto defaults', async () => {
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ theme: 'dark' }))
    const s = await new SettingsStore(dir).load()
    expect(s.theme).toBe('dark')
    expect(s.autoSaveSession).toBe(true) // default preserved
  })
  it('saves and reloads', async () => {
    const store = new SettingsStore(dir)
    await store.save({ ...DEFAULT_SETTINGS, theme: 'light', autoSaveSession: false })
    const s = await new SettingsStore(dir).load()
    expect(s.theme).toBe('light')
    expect(s.autoSaveSession).toBe(false)
  })
})
```

```ts
// tests/unit/fileService.test.ts
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
    expect(detectEol('nolinebreak')).toBe('LF')
  })
  it('reads a file and reports eol', async () => {
    const p = join(dir, 'f.txt'); writeFileSync(p, 'x\r\ny')
    const r = await readFileForEditor(p)
    expect(r.content).toBe('x\r\ny')
    expect(r.eol).toBe('CRLF')
    expect(r.filePath).toBe(p)
  })
  it('writes with the requested eol', async () => {
    const p = join(dir, 'out.txt')
    await writeFile(p, 'a\nb', 'CRLF')
    expect(readFileSync(p, 'utf8')).toBe('a\r\nb')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- settingsStore fileService`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `src/main/settingsStore.ts`**

```ts
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_SETTINGS, type Settings } from '../shared/types'

export class SettingsStore {
  private file: string
  constructor(baseDir: string) { this.file = join(baseDir, 'settings.json') }

  async load(): Promise<Settings> {
    try {
      const raw = await fs.readFile(this.file, 'utf8')
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
    } catch {
      return { ...DEFAULT_SETTINGS }
    }
  }

  async save(s: Settings): Promise<void> {
    await fs.writeFile(this.file, JSON.stringify(s, null, 2), 'utf8')
  }
}
```

- [ ] **Step 4: Implement `src/main/fileService.ts`**

```ts
import { promises as fs } from 'node:fs'
import type { EolMode, OpenedFile } from '../shared/types'

export function detectEol(content: string): EolMode {
  return content.includes('\r\n') ? 'CRLF' : 'LF'
}

export async function readFileForEditor(path: string): Promise<OpenedFile> {
  const content = await fs.readFile(path, 'utf8')
  return { filePath: path, content, eol: detectEol(content) }
}

export async function writeFile(path: string, content: string, eol: EolMode): Promise<void> {
  const normalized = content.replace(/\r\n/g, '\n')
  const out = eol === 'CRLF' ? normalized.replace(/\n/g, '\r\n') : normalized
  await fs.writeFile(path, out, 'utf8')
}
```

- [ ] **Step 5: Run unit tests to verify pass**

Run: `npm test -- settingsStore fileService`
Expected: PASS.

- [ ] **Step 6: Add the `Api` interface to `src/shared/types.ts`**

Append:
```ts
export interface Api {
  readFile(path: string): Promise<OpenedFile>
  writeFile(path: string, content: string, eol: EolMode): Promise<void>
  loadSession(): Promise<SessionData>
  saveSession(data: SessionData): Promise<void>
  loadSettings(): Promise<Settings>
  saveSettings(s: Settings): Promise<void>
  setContextMenu(enabled: boolean): Promise<void> // implemented in Task 14
  onOpenFile(cb: (path: string) => void): void     // implemented in Task 13
}
```

- [ ] **Step 7: Implement `src/main/ipc.ts`**

```ts
import { ipcMain, type BrowserWindow } from 'electron'
import { readFileForEditor, writeFile } from './fileService'
import { SessionStore } from './sessionStore'
import { SettingsStore } from './settingsStore'
import type { SessionData, Settings, EolMode } from '../shared/types'

export interface IpcDeps {
  baseDir: string
  getWindow: () => BrowserWindow | null
  setContextMenu: (enabled: boolean) => Promise<void>
}

export function registerIpc(deps: IpcDeps): void {
  const session = new SessionStore(deps.baseDir)
  const settings = new SettingsStore(deps.baseDir)

  ipcMain.handle('file:read', (_e, path: string) => readFileForEditor(path))
  ipcMain.handle('file:write', (_e, path: string, content: string, eol: EolMode) => writeFile(path, content, eol))
  ipcMain.handle('session:load', () => session.load())
  ipcMain.handle('session:save', (_e, data: SessionData) => session.save(data))
  ipcMain.handle('settings:load', () => settings.load())
  ipcMain.handle('settings:save', (_e, s: Settings) => settings.save(s))
  ipcMain.handle('contextmenu:set', (_e, enabled: boolean) => deps.setContextMenu(enabled))
}
```

- [ ] **Step 8: Replace `src/preload/index.ts` with the bridge**

```ts
import { contextBridge, ipcRenderer } from 'electron'
import type { Api } from '../shared/types'

const api: Api = {
  readFile: (path) => ipcRenderer.invoke('file:read', path),
  writeFile: (path, content, eol) => ipcRenderer.invoke('file:write', path, content, eol),
  loadSession: () => ipcRenderer.invoke('session:load'),
  saveSession: (data) => ipcRenderer.invoke('session:save', data),
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (s) => ipcRenderer.invoke('settings:save', s),
  setContextMenu: (enabled) => ipcRenderer.invoke('contextmenu:set', enabled),
  onOpenFile: (cb) => ipcRenderer.on('open-file', (_e, path: string) => cb(path))
}

contextBridge.exposeInMainWorld('api', api)
```

Add a renderer global declaration at the top of `src/renderer/main.ts`:
```ts
import type { Api } from '../shared/types'
declare global { interface Window { api: Api } }
```

- [ ] **Step 9: Wire `registerIpc` into `src/main/index.ts`**

Add imports and call inside `app.whenReady().then(...)` BEFORE `createWindow()`:
```ts
import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { registerIpc } from './ipc'

let mainWindow: BrowserWindow | null = null
// ...inside whenReady, before createWindow():
registerIpc({
  baseDir: app.getPath('userData'),
  getWindow: () => mainWindow,
  setContextMenu: async () => {} // replaced in Task 14
})
```
Also assign `mainWindow = createWindow()` (store the reference).

- [ ] **Step 10: Verify build compiles and app still launches**

Run: `npm run build`
Expected: build succeeds, no TS errors.
Run: `npm run dev`
Expected: window opens, no console errors (`window.api` now defined; verify in devtools console `window.api` is an object). Close to continue.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: add settings/file services, IPC handlers, and typed preload bridge"
```

---

### Task 6: Editor pane — Monaco wrapper with line-number toggle

**Files:**
- Create: `src/renderer/editorPane.ts`
- Modify: `src/renderer/index.html` (add CSS skeleton + app layout containers), `electron.vite.config.ts` (Monaco worker handling)
- Test: covered by smoke test in Task 16 (DOM/Monaco); add a thin logic assertion here.

**Interfaces:**
- Consumes: Monaco, `BufferState`.
- Produces `class EditorPane`:
  - `constructor(container: HTMLElement)`
  - `setBuffer(b: BufferState): void` — loads content + language + readOnly=false.
  - `getContent(): string`
  - `onChange(cb: (content: string) => void): void`
  - `setLineNumbers(on: boolean): void` / `toggleLineNumbers(): boolean` / `lineNumbersVisible(): boolean` — pane owns its own line-number state (no external flags).
  - `setTheme(monacoTheme: 'vs' | 'vs-dark'): void`
  - `getCursor(): { line: number; col: number }`
  - `onCursor(cb: (pos: {line:number; col:number}) => void): void`
  - `layout(): void` (called on resize/split changes)
  - `dispose(): void`

- [ ] **Step 1: Configure Monaco workers in `electron.vite.config.ts`**

Monaco needs its language workers bundled. Replace the `renderer` block:
```ts
  renderer: {
    root: 'src/renderer',
    build: { rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') } },
    worker: { format: 'es' },
    optimizeDeps: { include: ['monaco-editor'] }
  }
```
Add a worker env shim file `src/renderer/monacoEnv.ts`:
```ts
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'

self.MonacoEnvironment = {
  getWorker(_id: string, label: string) {
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    if (label === 'json') return new jsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
    if (label === 'html') return new htmlWorker()
    return new editorWorker()
  }
}
```

- [ ] **Step 2: Implement `src/renderer/editorPane.ts`**

```ts
import * as monaco from 'monaco-editor'
import type { BufferState } from '../shared/types'

export class EditorPane {
  private editor: monaco.editor.IStandaloneCodeEditor
  private changeCb: ((content: string) => void) | null = null
  private lineNumbersOn = true

  constructor(container: HTMLElement) {
    this.editor = monaco.editor.create(container, {
      value: '',
      language: 'plaintext',
      theme: 'vs-dark',
      automaticLayout: true,
      lineNumbers: 'on',
      minimap: { enabled: true }
    })
    this.editor.onDidChangeModelContent(() => {
      this.changeCb?.(this.editor.getValue())
    })
  }

  setBuffer(b: BufferState): void {
    const model = monaco.editor.createModel(b.content, b.language)
    this.editor.setModel(model)
  }

  getContent(): string { return this.editor.getValue() }
  onChange(cb: (content: string) => void): void { this.changeCb = cb }
  setLineNumbers(on: boolean): void {
    this.lineNumbersOn = on
    this.editor.updateOptions({ lineNumbers: on ? 'on' : 'off' })
  }
  toggleLineNumbers(): boolean { this.setLineNumbers(!this.lineNumbersOn); return this.lineNumbersOn }
  lineNumbersVisible(): boolean { return this.lineNumbersOn }
  setTheme(theme: 'vs' | 'vs-dark'): void { monaco.editor.setTheme(theme) }

  getCursor(): { line: number; col: number } {
    const p = this.editor.getPosition()
    return { line: p?.lineNumber ?? 1, col: p?.column ?? 1 }
  }
  onCursor(cb: (pos: { line: number; col: number }) => void): void {
    this.editor.onDidChangeCursorPosition(e => cb({ line: e.position.lineNumber, col: e.position.column }))
  }
  layout(): void { this.editor.layout() }
  dispose(): void { this.editor.getModel()?.dispose(); this.editor.dispose() }
}
```

- [ ] **Step 3: Replace `src/renderer/index.html` body with the app skeleton + CSS**

```html
  <body>
    <div id="app">
      <div id="tabbar"></div>
      <div id="panes"><div id="paneA" class="pane"></div><div id="paneB" class="pane hidden"></div></div>
      <div id="statusbar"></div>
    </div>
    <script type="module" src="./main.ts"></script>
  </body>
```
Add to `<head>` a `<style>` block:
```html
    <style>
      html,body,#app{height:100%;margin:0;font-family:Segoe UI,system-ui,sans-serif}
      #app{display:flex;flex-direction:column}
      #tabbar{height:34px;display:flex;align-items:center;overflow-x:auto;background:#252526}
      #panes{flex:1;display:flex;min-height:0}
      .pane{flex:1;min-width:0}
      .pane.hidden{display:none}
      #statusbar{height:22px;background:#007acc;color:#fff;font-size:12px;display:flex;align-items:center;gap:12px;padding:0 8px}
    </style>
```

- [ ] **Step 4: Bootstrap one pane in `src/renderer/main.ts` to smoke it manually**

```ts
import './monacoEnv'
import type { Api } from '../shared/types'
import { EditorPane } from './editorPane'
import { BufferManager } from './bufferManager'
declare global { interface Window { api: Api } }

const manager = new BufferManager(() => crypto.randomUUID())
const paneA = new EditorPane(document.getElementById('paneA')!)
const first = manager.create()
paneA.setBuffer(first)
paneA.onChange(c => manager.update(manager.activeId!, c))
```

- [ ] **Step 5: Run the app to verify a typeable Monaco editor appears**

Run: `npm run dev`
Expected: a dark Monaco editor fills the window; typing works; line numbers show. Close to continue.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add Monaco editor pane with line-number and theme controls"
```

---

### Task 7: Tab bar wired to the buffer manager

**Files:**
- Create: `src/renderer/tabBar.ts`
- Modify: `src/renderer/main.ts`

**Interfaces:**
- Consumes: `BufferManager`, `BufferState`.
- Produces `class TabBar`:
  - `constructor(container: HTMLElement, handlers: { onSelect(id): void; onClose(id): void; onNew(): void })`
  - `render(buffers: BufferState[], activeId: string | null): void` — paints tabs; active tab highlighted; dirty buffers show a `●`; each tab has an `×` close button; a trailing `+` button calls `onNew`.

- [ ] **Step 1: Implement `src/renderer/tabBar.ts`**

```ts
import type { BufferState } from '../shared/types'

export interface TabHandlers {
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onNew: () => void
}

export class TabBar {
  constructor(private container: HTMLElement, private handlers: TabHandlers) {}

  render(buffers: BufferState[], activeId: string | null): void {
    this.container.replaceChildren()
    for (const b of buffers) {
      const tab = document.createElement('div')
      tab.className = 'tab' + (b.id === activeId ? ' active' : '')
      tab.dataset.id = b.id
      tab.textContent = (b.dirty ? '● ' : '') + b.title
      tab.onclick = (e) => { if ((e.target as HTMLElement).dataset.close !== '1') this.handlers.onSelect(b.id) }
      tab.onauxclick = (e) => { if (e.button === 1) this.handlers.onClose(b.id) } // middle-click
      const x = document.createElement('span')
      x.textContent = '×'; x.dataset.close = '1'; x.className = 'tab-close'
      x.onclick = () => this.handlers.onClose(b.id)
      tab.appendChild(x)
      this.container.appendChild(tab)
    }
    const add = document.createElement('button')
    add.textContent = '+'; add.className = 'tab-add'
    add.onclick = () => this.handlers.onNew()
    this.container.appendChild(add)
  }
}
```

- [ ] **Step 2: Add tab CSS to the `<style>` block in `index.html`**

```css
      .tab{display:flex;align-items:center;gap:6px;padding:0 10px;height:100%;color:#ccc;border-right:1px solid #1e1e1e;cursor:pointer;white-space:nowrap}
      .tab.active{background:#1e1e1e;color:#fff}
      .tab-close{opacity:.6}.tab-close:hover{opacity:1}
      .tab-add{background:none;border:none;color:#ccc;font-size:16px;cursor:pointer;padding:0 10px}
```

- [ ] **Step 3: Wire the tab bar in `main.ts` (replace bootstrap from Task 6)**

```ts
import './monacoEnv'
import type { Api } from '../shared/types'
import { EditorPane } from './editorPane'
import { BufferManager } from './bufferManager'
import { TabBar } from './tabBar'
declare global { interface Window { api: Api } }

const manager = new BufferManager(() => crypto.randomUUID())
const paneA = new EditorPane(document.getElementById('paneA')!)

const tabBar = new TabBar(document.getElementById('tabbar')!, {
  onSelect: (id) => { manager.setActive(id); showActive() },
  onClose: (id) => { manager.close(id); if (manager.list().length === 0) manager.create(); showActive() },
  onNew: () => { manager.create(); showActive() }
})

function showActive(): void {
  const active = manager.get(manager.activeId!)!
  paneA.setBuffer(active)
  tabBar.render(manager.list(), manager.activeId)
}

paneA.onChange(c => { manager.update(manager.activeId!, c); tabBar.render(manager.list(), manager.activeId) })
manager.create()
showActive()
```

- [ ] **Step 4: Run the app to verify tabs work**

Run: `npm run dev`
Expected: `+` adds tabs; clicking switches; typing flips the tab to dirty (`●`); `×` and middle-click close; closing the last tab leaves one fresh untitled. Close to continue.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add tab bar wired to buffer manager (new/select/close/dirty)"
```

---

### Task 8: Split view — single/split toggle, per-pane buffer & line numbers

**Files:**
- Create: `src/renderer/splitView.ts`
- Modify: `src/renderer/main.ts`, `index.html` (Split.js gutter CSS)

**Interfaces:**
- Consumes: `EditorPane`, `Split.js`.
- Produces `class SplitView`:
  - `constructor(paneAEl, paneBEl, gutterParent)` — owns two `EditorPane`s.
  - `paneA: EditorPane`, `paneB: EditorPane`
  - `setSplit(on: boolean): void` — shows/hides pane B; applies/destroys Split.js; calls `layout()` on both.
  - `isSplit(): boolean`
  - `focusedPane(): 'A' | 'B'` (tracks last-focused pane for routing the active buffer)

- [ ] **Step 1: Implement `src/renderer/splitView.ts`**

```ts
import Split from 'split.js'
import { EditorPane } from './editorPane'

export class SplitView {
  readonly paneA: EditorPane
  readonly paneB: EditorPane
  private split: ReturnType<typeof Split> | null = null
  private focused: 'A' | 'B' = 'A'

  constructor(private aEl: HTMLElement, private bEl: HTMLElement) {
    this.paneA = new EditorPane(aEl)
    this.paneB = new EditorPane(bEl)
    aEl.addEventListener('focusin', () => { this.focused = 'A' })
    bEl.addEventListener('focusin', () => { this.focused = 'B' })
  }

  isSplit(): boolean { return this.split !== null }
  focusedPane(): 'A' | 'B' { return this.focused }

  setSplit(on: boolean): void {
    if (on && !this.split) {
      this.bEl.classList.remove('hidden')
      this.split = Split([this.aEl, this.bEl], { sizes: [50, 50], minSize: 120, gutterSize: 6 })
    } else if (!on && this.split) {
      this.split.destroy()
      this.split = null
      this.bEl.classList.add('hidden')
      this.focused = 'A'
    }
    this.paneA.layout(); this.paneB.layout()
  }
}
```

- [ ] **Step 2: Add Split.js gutter CSS to `index.html`**

```css
      .gutter{background:#333;cursor:col-resize}
      .gutter.gutter-horizontal{width:6px}
```

- [ ] **Step 3: Rework `main.ts` to use `SplitView` and route the active buffer to the focused pane**

```ts
import './monacoEnv'
import type { Api } from '../shared/types'
import { BufferManager } from './bufferManager'
import { TabBar } from './tabBar'
import { SplitView } from './splitView'
declare global { interface Window { api: Api } }

const manager = new BufferManager(() => crypto.randomUUID())
const view = new SplitView(document.getElementById('paneA')!, document.getElementById('paneB')!)

function paneFor(which: 'A' | 'B') { return which === 'A' ? view.paneA : view.paneB }

const tabBar = new TabBar(document.getElementById('tabbar')!, {
  onSelect: (id) => { manager.setActive(id); showActive() },
  onClose: (id) => { manager.close(id); if (manager.list().length === 0) manager.create(); showActive() },
  onNew: () => { manager.create(); showActive() }
})

function showActive(): void {
  const active = manager.get(manager.activeId!)!
  paneFor(view.focusedPane()).setBuffer(active)
  tabBar.render(manager.list(), manager.activeId)
}

for (const which of ['A', 'B'] as const) {
  paneFor(which).onChange(c => { manager.update(manager.activeId!, c); tabBar.render(manager.list(), manager.activeId) })
}

// temporary keyboard toggle to verify split; replaced by command palette in Task 11
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === '\\') { view.setSplit(!view.isSplit()); showActive() }
})

manager.create()
showActive()
```

- [ ] **Step 4: Run the app to verify split toggling**

Run: `npm run dev`
Expected: `Ctrl+\` splits into two editors with a draggable gutter; toggling again collapses to one. Close to continue.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add split view with single/split toggle and draggable gutter"
```

---

### Task 9: Theme (light/dark/follow-os) + persist via settings — **MILESTONE: usable editor**

**Files:**
- Create: `src/renderer/theme.ts`
- Modify: `src/renderer/main.ts`, `index.html` (theme CSS vars + toggle button)

**Interfaces:**
- Consumes: `window.api` (loadSettings/saveSettings), `EditorPane.setTheme`, `ThemeMode`.
- Produces `class ThemeController`:
  - `constructor(panes: EditorPane[], onPersist: (mode: ThemeMode) => void)`
  - `apply(mode: ThemeMode): void` — sets `document.body.dataset.theme` to resolved `light|dark` (resolving `follow-os` via `matchMedia('(prefers-color-scheme: dark)')`) and calls `setTheme('vs'|'vs-dark')` on each pane.
  - `current(): ThemeMode`
  - `cycle(): ThemeMode` — light→dark→follow-os→light; applies + persists.

- [ ] **Step 1: Implement `src/renderer/theme.ts`**

```ts
import type { EditorPane } from './editorPane'
import type { ThemeMode } from '../shared/types'

export class ThemeController {
  private mode: ThemeMode = 'follow-os'
  constructor(private panes: EditorPane[], private onPersist: (m: ThemeMode) => void) {}

  private resolve(m: ThemeMode): 'light' | 'dark' {
    if (m === 'follow-os') return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    return m
  }

  apply(mode: ThemeMode): void {
    this.mode = mode
    const resolved = this.resolve(mode)
    document.body.dataset.theme = resolved
    for (const p of this.panes) p.setTheme(resolved === 'dark' ? 'vs-dark' : 'vs')
  }

  current(): ThemeMode { return this.mode }

  cycle(): ThemeMode {
    const next: ThemeMode = this.mode === 'light' ? 'dark' : this.mode === 'dark' ? 'follow-os' : 'light'
    this.apply(next); this.onPersist(next); return next
  }
}
```

- [ ] **Step 2: Add theme CSS vars + a toggle button to `index.html`**

In `<style>`:
```css
      body[data-theme="light"]{--bar:#f3f3f3;--bartext:#333;--tabbg:#ececec;--editorbg:#fff}
      body[data-theme="dark"]{--bar:#252526;--bartext:#ccc;--tabbg:#2d2d2d;--editorbg:#1e1e1e}
      #tabbar{background:var(--bar)}
      #theme-toggle{margin-left:auto;background:none;border:none;color:var(--bartext);cursor:pointer;font-size:14px;padding:0 10px}
```
In the tab bar markup add (the TabBar appends tabs; place the toggle as a sibling so it stays right-aligned): after `<div id="tabbar"></div>` is fine since `margin-left:auto` is on the button — instead append the button in `main.ts` (Step 3).

- [ ] **Step 3: Wire theme in `main.ts`**

Add after `view` is created:
```ts
import { ThemeController } from './theme'
// ...
const theme = new ThemeController([view.paneA, view.paneB], (m) => {
  window.api.loadSettings().then(s => window.api.saveSettings({ ...s, theme: m }))
})
const themeBtn = document.createElement('button')
themeBtn.id = 'theme-toggle'; themeBtn.textContent = '◐ theme'
themeBtn.onclick = () => theme.cycle()
document.getElementById('tabbar')!.after(themeBtn) // sits between tabbar and panes; or append into a header row
```
On startup, load persisted settings and apply:
```ts
window.api.loadSettings().then(s => theme.apply(s.theme))
```
(Note: TabBar.render replaces tabbar children, so keep `themeBtn` OUTSIDE `#tabbar`. Add a `<div id="header">` wrapping `#tabbar` + button if you prefer them on one row — optional polish.)

- [ ] **Step 4: Run the app to verify theme switching + persistence**

Run: `npm run dev`
Expected: clicking the toggle cycles light/dark/follow-os; editor + chrome both change; relaunching restores the last theme. Close to continue.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add light/dark/follow-os theme with persistence"
```

> **MILESTONE:** A usable multi-tab, splittable, themeable editor. Tasks 10–15 add file I/O persistence, diff, palette, status bar, OS integration, and packaging.

---

### Task 10: Session persistence wiring + file open/save in renderer

**Files:**
- Modify: `src/renderer/main.ts`

**Interfaces:**
- Consumes: `window.api` (loadSession/saveSession/loadSettings/readFile/writeFile), `BufferManager`.
- Produces: on launch, restore session (if any) else one untitled buffer; debounced auto-save (500 ms) of `manager.toSession()` whenever `autoSaveSession` is true; `Ctrl+S` saves the active buffer to disk (via a save path obtained from a main-process dialog channel — add `dialog:saveAs` and `dialog:open` IPC).

- [ ] **Step 1: Add dialog channels to `src/main/ipc.ts`**

Add inside `registerIpc`:
```ts
import { dialog, ipcMain } from 'electron'
// ...
ipcMain.handle('dialog:saveAs', async () => {
  const r = await dialog.showSaveDialog({ title: 'Save As' })
  return r.canceled ? null : r.filePath ?? null
})
ipcMain.handle('dialog:open', async () => {
  const r = await dialog.showOpenDialog({ properties: ['openFile'] })
  return r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0]
})
```
Add to `Api` in `types.ts` and the preload bridge:
```ts
// types.ts Api:
saveAsDialog(): Promise<string | null>
openDialog(): Promise<string | null>
// preload:
saveAsDialog: () => ipcRenderer.invoke('dialog:saveAs'),
openDialog: () => ipcRenderer.invoke('dialog:open'),
```

- [ ] **Step 2: Add session restore + auto-save + save/open in `main.ts`**

Replace the startup `manager.create(); showActive()` tail with:
```ts
let autoSave = true
let saveTimer: number | undefined

function scheduleSessionSave(): void {
  if (!autoSave) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => window.api.saveSession(manager.toSession()), 500) as unknown as number
}

async function boot(): Promise<void> {
  const settings = await window.api.loadSettings()
  autoSave = settings.autoSaveSession
  theme.apply(settings.theme)
  const session = await window.api.loadSession()
  if (session.buffers.length > 0) manager.restore(session)
  else manager.create()
  if (!manager.activeId) manager.setActive(manager.list()[0].id)
  showActive()
}

async function saveActive(): Promise<void> {
  const b = manager.get(manager.activeId!)!
  let path = b.filePath
  if (!path) { path = await window.api.saveAsDialog(); if (!path) return }
  await window.api.writeFile(path, paneFor(view.focusedPane()).getContent(), b.eol)
  manager.markSaved(b.id, path)
  tabBar.render(manager.list(), manager.activeId)
}

async function openFromDisk(): Promise<void> {
  const path = await window.api.openDialog(); if (!path) return
  const file = await window.api.readFile(path)
  manager.open(file); showActive()
}

window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key.toLowerCase() === 's') { e.preventDefault(); saveActive() }
  if (e.ctrlKey && e.key.toLowerCase() === 'o') { e.preventDefault(); openFromDisk() }
})
```
Hook `scheduleSessionSave()` into the `onChange` and tab handlers (call it wherever `manager` mutates). Then call `boot()` once at the end.

- [ ] **Step 3: Run the app to verify persistence + file I/O**

Run: `npm run dev`
Steps: type into a tab; `Ctrl+S` → choose a path → tab loses dirty dot; add a second tab with text; close the app; relaunch.
Expected: both tabs and content return on relaunch; `Ctrl+O` opens a file into a new tab. Close to continue.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: restore session on launch, debounced auto-save, save/open dialogs"
```

---

### Task 11: Command palette + status-bar-driven settings toggle for auto-save

**Files:**
- Create: `src/renderer/commandPalette.ts`
- Modify: `src/renderer/main.ts`, `index.html` (palette CSS)

**Interfaces:**
- Produces `class CommandPalette`:
  - `register(cmd: { id: string; label: string; run: () => void }): void`
  - `open(): void` / `close(): void` — `Ctrl+Shift+P` opens an overlay input that fuzzy-filters registered command labels; Enter runs the highlighted command; Esc/blur closes.
- Commands registered: New Tab, Close Tab, Toggle Split, Toggle Line Numbers (focused pane), Cycle Theme, Save, Open, Start Diff (Task 12 fills run), Toggle Auto-Save Session.

- [ ] **Step 1: Implement `src/renderer/commandPalette.ts`**

```ts
export interface Command { id: string; label: string; run: () => void }

export class CommandPalette {
  private commands: Command[] = []
  private overlay: HTMLDivElement
  private input: HTMLInputElement
  private listEl: HTMLDivElement
  private filtered: Command[] = []
  private cursor = 0

  constructor() {
    this.overlay = document.createElement('div'); this.overlay.id = 'palette'; this.overlay.className = 'hidden'
    this.input = document.createElement('input'); this.input.placeholder = 'Type a command…'
    this.listEl = document.createElement('div'); this.listEl.className = 'palette-list'
    this.overlay.append(this.input, this.listEl)
    document.body.appendChild(this.overlay)
    this.input.addEventListener('input', () => this.refresh())
    this.input.addEventListener('keydown', (e) => this.onKey(e))
    this.overlay.addEventListener('click', (e) => { if (e.target === this.overlay) this.close() })
  }

  register(cmd: Command): void { this.commands.push(cmd) }

  open(): void {
    this.overlay.classList.remove('hidden'); this.input.value = ''; this.refresh(); this.input.focus()
  }
  close(): void { this.overlay.classList.add('hidden') }

  private refresh(): void {
    const q = this.input.value.toLowerCase()
    this.filtered = this.commands.filter(c => c.label.toLowerCase().includes(q))
    this.cursor = 0
    this.listEl.replaceChildren(...this.filtered.map((c, i) => {
      const row = document.createElement('div')
      row.className = 'palette-row' + (i === this.cursor ? ' active' : '')
      row.textContent = c.label
      row.onclick = () => { c.run(); this.close() }
      return row
    }))
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') return this.close()
    if (e.key === 'ArrowDown') { this.cursor = Math.min(this.cursor + 1, this.filtered.length - 1); this.paint() }
    if (e.key === 'ArrowUp') { this.cursor = Math.max(this.cursor - 1, 0); this.paint() }
    if (e.key === 'Enter') { const c = this.filtered[this.cursor]; if (c) { c.run(); this.close() } }
  }
  private paint(): void {
    [...this.listEl.children].forEach((el, i) => el.classList.toggle('active', i === this.cursor))
  }
}
```

- [ ] **Step 2: Add palette CSS to `index.html`**

```css
      #palette{position:fixed;inset:0;background:rgba(0,0,0,.3);display:flex;justify-content:center;align-items:flex-start;padding-top:80px}
      #palette.hidden{display:none}
      #palette input{width:520px;padding:8px;font-size:14px}
      .palette-list{width:520px;background:var(--bar);max-height:300px;overflow:auto}
      .palette-row{padding:6px 8px;color:var(--bartext);cursor:pointer}
      .palette-row.active{background:#094771;color:#fff}
```

- [ ] **Step 3: Register commands in `main.ts`**

```ts
import { CommandPalette } from './commandPalette'
const palette = new CommandPalette()
palette.register({ id: 'new', label: 'New Tab', run: () => { manager.create(); showActive(); scheduleSessionSave() } })
palette.register({ id: 'close', label: 'Close Tab', run: () => { manager.close(manager.activeId!); if (!manager.list().length) manager.create(); showActive(); scheduleSessionSave() } })
palette.register({ id: 'split', label: 'Toggle Split', run: () => { view.setSplit(!view.isSplit()); showActive() } })
palette.register({ id: 'lines', label: 'Toggle Line Numbers', run: () => { paneFor(view.focusedPane()).toggleLineNumbers() } })
palette.register({ id: 'theme', label: 'Cycle Theme', run: () => theme.cycle() })
palette.register({ id: 'save', label: 'Save', run: () => saveActive() })
palette.register({ id: 'open', label: 'Open File', run: () => openFromDisk() })
palette.register({ id: 'autosave', label: 'Toggle Auto-Save Session', run: async () => {
  autoSave = !autoSave
  const s = await window.api.loadSettings(); await window.api.saveSettings({ ...s, autoSaveSession: autoSave })
} })
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'p') { e.preventDefault(); palette.open() }
})
```
(Replace the temporary `Ctrl+\` split toggle from Task 8 — the palette now owns it; keep `Ctrl+\` as an alias if desired.)

- [ ] **Step 4: Run the app to verify the palette**

Run: `npm run dev`
Expected: `Ctrl+Shift+P` opens the palette; typing filters; Enter runs (New Tab, Toggle Split, Cycle Theme, Toggle Line Numbers, Toggle Auto-Save all work). Close to continue.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add command palette and auto-save toggle command"
```

---

### Task 12: Status bar

**Files:**
- Create: `src/renderer/statusBar.ts`
- Modify: `src/renderer/main.ts`

**Interfaces:**
- Produces `class StatusBar`:
  - `constructor(el: HTMLElement)`
  - `update(info: { language: string; eol: EolMode; cursor: { line: number; col: number }; dirty: boolean }): void` — renders `lang · EOL · Ln/Col · ●saved|●unsaved`.

- [ ] **Step 1: Implement `src/renderer/statusBar.ts`**

```ts
import type { EolMode } from '../shared/types'

export class StatusBar {
  constructor(private el: HTMLElement) {}
  update(info: { language: string; eol: EolMode; cursor: { line: number; col: number }; dirty: boolean }): void {
    this.el.replaceChildren()
    const parts = [
      info.language,
      info.eol,
      `Ln ${info.cursor.line}, Col ${info.cursor.col}`,
      info.dirty ? '● unsaved' : '● saved'
    ]
    for (const p of parts) { const s = document.createElement('span'); s.textContent = p; this.el.appendChild(s) }
  }
}
```

- [ ] **Step 2: Wire it in `main.ts`**

```ts
import { StatusBar } from './statusBar'
const statusBar = new StatusBar(document.getElementById('statusbar')!)
function refreshStatus(): void {
  const b = manager.get(manager.activeId!)!
  statusBar.update({ language: b.language, eol: b.eol, cursor: paneFor(view.focusedPane()).getCursor(), dirty: b.dirty })
}
for (const which of ['A', 'B'] as const) paneFor(which).onCursor(() => refreshStatus())
```
Call `refreshStatus()` inside `showActive()` and after edits.

- [ ] **Step 3: Run the app to verify the status bar updates**

Run: `npm run dev`
Expected: status bar shows language, EOL, live cursor Ln/Col, and saved/unsaved state. Close to continue.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add status bar with language, EOL, cursor, and save state"
```

---

### Task 13: Diff view (tab-vs-tab)

**Files:**
- Create: `src/renderer/diffView.ts`, `src/renderer/diffPicker.ts`, `src/renderer/notify.ts`
- Modify: `src/renderer/main.ts`, `index.html` (diff container + picker/toast CSS)

**Interfaces:**
- Consumes: Monaco diff editor, `BufferManager`, `BufferState`.
- Produces `class DiffView`:
  - `constructor(container: HTMLElement)`
  - `show(left: { title: string; content: string; language: string }, right: {...}): void` — creates a `monaco.editor.createDiffEditor` (read-only) in the container, shown over the panes.
  - `hide(): void`
  - `isOpen(): boolean`
- Produces `class DiffPicker`:
  - `constructor(host: HTMLElement)`
  - `open(buffers: BufferState[], onConfirm: (leftId: string, rightId: string) => void): void` — styled overlay with two `<select>`s (default left=first, right=second), Compare/Cancel buttons; Esc cancels. No native `prompt()`.
- Produces `notify.ts`: `toast(message: string, ms?: number): void` — transient styled toast (no native `alert()`).
- A palette command "Start Diff" opens the `DiffPicker`; confirming calls `DiffView.show`.

- [ ] **Step 1: Implement `src/renderer/diffView.ts`**

```ts
import * as monaco from 'monaco-editor'

export interface DiffSide { title: string; content: string; language: string }

export class DiffView {
  private editor: monaco.editor.IStandaloneDiffEditor | null = null
  constructor(private container: HTMLElement) {}

  isOpen(): boolean { return this.editor !== null }

  show(left: DiffSide, right: DiffSide): void {
    this.hide()
    this.container.classList.remove('hidden')
    this.editor = monaco.editor.createDiffEditor(this.container, {
      readOnly: true, automaticLayout: true, theme: document.body.dataset.theme === 'dark' ? 'vs-dark' : 'vs'
    })
    this.editor.setModel({
      original: monaco.editor.createModel(left.content, left.language),
      modified: monaco.editor.createModel(right.content, right.language)
    })
  }

  hide(): void {
    if (this.editor) {
      const m = this.editor.getModel()
      m?.original.dispose(); m?.modified.dispose()
      this.editor.dispose(); this.editor = null
    }
    this.container.classList.add('hidden')
  }
}
```

- [ ] **Step 2: Implement `src/renderer/notify.ts`**

```ts
export function toast(message: string, ms = 2200): void {
  let host = document.getElementById('toast-host')
  if (!host) {
    host = document.createElement('div')
    host.id = 'toast-host'
    document.body.appendChild(host)
  }
  const el = document.createElement('div')
  el.className = 'toast'
  el.textContent = message
  host.appendChild(el)
  setTimeout(() => el.remove(), ms)
}
```

- [ ] **Step 3: Implement `src/renderer/diffPicker.ts`**

```ts
import type { BufferState } from '../shared/types'

export class DiffPicker {
  private overlay: HTMLDivElement
  private leftSel: HTMLSelectElement
  private rightSel: HTMLSelectElement
  private onConfirm: ((leftId: string, rightId: string) => void) | null = null

  constructor(host: HTMLElement) {
    this.overlay = document.createElement('div')
    this.overlay.className = 'diff-picker hidden'
    this.leftSel = document.createElement('select')
    this.rightSel = document.createElement('select')
    const compare = document.createElement('button')
    compare.textContent = 'Compare'
    compare.onclick = () => this.confirm()
    const cancel = document.createElement('button')
    cancel.textContent = 'Cancel'
    cancel.onclick = () => this.close()
    const box = document.createElement('div')
    box.className = 'diff-picker-box'
    const lLbl = document.createElement('label'); lLbl.textContent = 'Left'
    const rLbl = document.createElement('label'); rLbl.textContent = 'Right'
    box.append(lLbl, this.leftSel, rLbl, this.rightSel, compare, cancel)
    this.overlay.appendChild(box)
    host.appendChild(this.overlay)
    this.overlay.addEventListener('click', (e) => { if (e.target === this.overlay) this.close() })
    this.overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close() })
  }

  open(buffers: BufferState[], onConfirm: (leftId: string, rightId: string) => void): void {
    this.onConfirm = onConfirm
    const opts = (sel: HTMLSelectElement, defaultIdx: number) => {
      sel.replaceChildren(...buffers.map((b, i) => {
        const o = document.createElement('option'); o.value = b.id; o.textContent = b.title
        if (i === defaultIdx) o.selected = true
        return o
      }))
    }
    opts(this.leftSel, 0)
    opts(this.rightSel, 1)
    this.overlay.classList.remove('hidden')
    this.leftSel.focus()
  }

  private confirm(): void {
    const l = this.leftSel.value, r = this.rightSel.value
    this.close()
    this.onConfirm?.(l, r)
  }
  private close(): void { this.overlay.classList.add('hidden') }
}
```

- [ ] **Step 4: Add the diff container, picker, and toast CSS to `index.html`**

In `#app`, after `#panes`:
```html
      <div id="diff" class="hidden"></div>
```
CSS (`#app` must be `position:relative` for the absolute diff overlay):
```css
      #app{position:relative}
      #diff{position:absolute;inset:34px 0 22px 0;background:var(--editorbg)}
      #diff.hidden{display:none}
      .diff-picker{position:fixed;inset:0;background:rgba(0,0,0,.3);display:flex;justify-content:center;align-items:flex-start;padding-top:90px}
      .diff-picker.hidden{display:none}
      .diff-picker-box{display:grid;grid-template-columns:auto 1fr;gap:8px 10px;background:var(--bar);color:var(--bartext);padding:16px;border-radius:6px}
      .diff-picker-box button{grid-column:1 / -1}
      #toast-host{position:fixed;bottom:32px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;gap:6px;z-index:50}
      .toast{background:#333;color:#fff;padding:8px 14px;border-radius:4px;font-size:13px;opacity:.95}
```

- [ ] **Step 5: Register the diff command in `main.ts` (styled picker + toast — no native dialogs)**

```ts
import { DiffView } from './diffView'
import { DiffPicker } from './diffPicker'
import { toast } from './notify'
const diff = new DiffView(document.getElementById('diff')!)
const diffPicker = new DiffPicker(document.getElementById('app')!)

function startDiff(): void {
  const buffers = manager.list()
  if (buffers.length < 2) { toast('Open at least two tabs to diff.'); return }
  diffPicker.open(buffers, (leftId, rightId) => {
    const L = manager.get(leftId), R = manager.get(rightId)
    if (!L || !R) return
    diff.show(
      { title: L.title, content: L.content, language: L.language },
      { title: R.title, content: R.content, language: R.language }
    )
  })
}
palette.register({ id: 'diff', label: 'Start Diff (tab vs tab)', run: () => startDiff() })
palette.register({ id: 'diff-close', label: 'Close Diff', run: () => diff.hide() })
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && diff.isOpen()) diff.hide() })
```

- [ ] **Step 6: Run the app to verify diffing**

Run: `npm run dev`
Steps: open two tabs with different text → palette → "Start Diff" → pick Left/Right in the styled picker → Compare.
Expected: side-by-side diff with highlighted changes appears; "Close Diff" or Esc returns to editing; with fewer than two tabs a toast appears instead of a crash. Close to continue.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add tab-vs-tab diff with styled picker and toast notifications"
```

---

### Task 14: Windows context-menu integration (HKCU) + settings toggle

**Files:**
- Create: `src/main/contextMenu.ts`
- Modify: `src/main/index.ts` (wire `setContextMenu` into `registerIpc`), `src/renderer/main.ts` (palette command to toggle)
- Test: `tests/unit/contextMenu.test.ts` (logic-only: builds correct key paths/commands; no real registry write)

**Interfaces:**
- Produces:
  - `buildContextMenuPlan(exePath: string): { keyPath: string; commandKeyPath: string; label: string; command: string }` — pure function returning the HKCU key paths and command string. **Unit-tested.**
  - `setContextMenu(enabled: boolean, exePath: string): Promise<void>` — uses Electron-bundled `reg.exe` via `child_process` to add or delete keys under `HKCU\Software\Classes\*\shell\NotesAndCodes`. Wrapped in try/catch; logs and resolves on failure (never crashes the app).

- [ ] **Step 1: Write the failing test (logic only)**

```ts
// tests/unit/contextMenu.test.ts
import { describe, it, expect } from 'vitest'
import { buildContextMenuPlan } from '../../src/main/contextMenu'

describe('buildContextMenuPlan', () => {
  it('produces HKCU paths and a command that passes the file as %1', () => {
    const plan = buildContextMenuPlan('C:\\Apps\\Notes & Codes\\Notes-and-codes.exe')
    expect(plan.keyPath).toBe('HKCU\\Software\\Classes\\*\\shell\\NotesAndCodes')
    expect(plan.commandKeyPath).toBe('HKCU\\Software\\Classes\\*\\shell\\NotesAndCodes\\command')
    expect(plan.label).toBe('Open with Notes & Codes')
    expect(plan.command).toBe('"C:\\Apps\\Notes & Codes\\Notes-and-codes.exe" "%1"')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- contextMenu`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/main/contextMenu.ts`**

```ts
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const run = promisify(execFile)

export interface ContextMenuPlan {
  keyPath: string
  commandKeyPath: string
  label: string
  command: string
}

export function buildContextMenuPlan(exePath: string): ContextMenuPlan {
  const keyPath = 'HKCU\\Software\\Classes\\*\\shell\\NotesAndCodes'
  return {
    keyPath,
    commandKeyPath: `${keyPath}\\command`,
    label: 'Open with Notes & Codes',
    command: `"${exePath}" "%1"`
  }
}

export async function setContextMenu(enabled: boolean, exePath: string): Promise<void> {
  const plan = buildContextMenuPlan(exePath)
  try {
    if (enabled) {
      await run('reg', ['add', plan.keyPath, '/ve', '/d', plan.label, '/f'])
      await run('reg', ['add', plan.commandKeyPath, '/ve', '/d', plan.command, '/f'])
    } else {
      await run('reg', ['delete', plan.keyPath, '/f']).catch(() => {})
    }
  } catch (err) {
    console.error('context menu update failed', err)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- contextMenu`
Expected: PASS.

- [ ] **Step 5: Wire into `src/main/index.ts`**

```ts
import { setContextMenu } from './contextMenu'
// in registerIpc deps:
registerIpc({
  baseDir: app.getPath('userData'),
  getWindow: () => mainWindow,
  setContextMenu: (enabled) => setContextMenu(enabled, app.getPath('exe'))
})
```

- [ ] **Step 6: Add a palette command in `main.ts` to toggle it**

```ts
palette.register({ id: 'ctxmenu', label: 'Toggle "Open with Notes & Codes" right-click menu', run: async () => {
  const s = await window.api.loadSettings()
  const next = !s.contextMenuEnabled
  await window.api.setContextMenu(next)
  await window.api.saveSettings({ ...s, contextMenuEnabled: next })
  toast(`Right-click menu ${next ? 'enabled' : 'disabled'}.`)
} })
```

- [ ] **Step 7: Run a dev verification (manual)**

Run: `npm run dev`, open palette → toggle the right-click menu on. Then in a real Explorer window, right-click any file.
Expected: "Open with Notes & Codes" appears. (In dev the exe path points at the Electron binary; full end-to-end verified after packaging in Task 15.) Toggle off → entry disappears. Close to continue.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add HKCU context-menu registration with settings toggle"
```

---

### Task 15: Single-instance file routing + packaging (installer + portable)

**Files:**
- Create: `electron-builder.yml`, `build/installer.nsh`
- Modify: `src/main/index.ts` (single-instance lock, file-arg parsing, push to renderer), `src/renderer/main.ts` (`onOpenFile` handler)

**Interfaces:**
- Produces: when launched with a file path arg (from the context menu), the app opens that file in a tab; a second launch routes the file to the existing instance instead of opening a new window. Installer registers the context menu at install, removes it at uninstall.

- [ ] **Step 1: Add single-instance + file routing to `src/main/index.ts`**

```ts
let pendingFile: string | null = null

function fileArgFrom(argv: string[]): string | null {
  // last arg that exists as a path and isn't a flag
  const candidate = argv.slice(1).reverse().find(a => !a.startsWith('-') && /[\\/.]/.test(a))
  return candidate ?? null
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_e, argv) => {
    const f = fileArgFrom(argv)
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
      if (f) mainWindow.webContents.send('open-file', f)
    }
  })

  app.whenReady().then(() => {
    registerIpc({ /* as Task 14 */ })
    pendingFile = fileArgFrom(process.argv)
    mainWindow = createWindow()
    mainWindow.webContents.on('did-finish-load', () => {
      if (pendingFile) mainWindow!.webContents.send('open-file', pendingFile)
    })
  })
}
```

- [ ] **Step 2: Handle `onOpenFile` in `src/renderer/main.ts`**

```ts
window.api.onOpenFile(async (path) => {
  const file = await window.api.readFile(path)
  manager.open(file); showActive(); scheduleSessionSave()
})
```

- [ ] **Step 3: Create `electron-builder.yml`**

```yaml
appId: com.notesandcodes.app
productName: Notes & Codes
directories:
  output: dist
  buildResources: build
files:
  - out/**/*
win:
  target:
    - target: nsis
    - target: portable
nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
  include: build/installer.nsh
```

- [ ] **Step 4: Create `build/installer.nsh` (register context menu at install)**

```nsis
!macro customInstall
  WriteRegStr HKCU "Software\Classes\*\shell\NotesAndCodes" "" "Open with Notes & Codes"
  WriteRegStr HKCU "Software\Classes\*\shell\NotesAndCodes\command" "" '"$INSTDIR\Notes & Codes.exe" "%1"'
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\*\shell\NotesAndCodes"
!macroend
```

- [ ] **Step 5: Build the installer**

Run: `npm run package`
Expected: `dist/` contains `Notes & Codes Setup <version>.exe` and a portable `.exe`. No build errors.

- [ ] **Step 6: Manual end-to-end verification**

Install via the produced setup exe. Then in Explorer, right-click a `.txt`/`.ts` file → "Open with Notes & Codes".
Expected: app launches (or focuses if running) and opens the file in a tab. Uninstall removes the context-menu entry.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: single-instance file routing and electron-builder packaging with context-menu install"
```

---

### Task 16: Playwright smoke tests

**Files:**
- Create: `playwright.config.ts`, `tests/smoke/app.spec.ts`

**Interfaces:**
- Consumes: the built app (`out/main/index.js`).
- Produces: automated smoke coverage of the core flows.

- [ ] **Step 1: Create `playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: 'tests/smoke',
  timeout: 30000,
  fullyParallel: false
})
```

- [ ] **Step 2: Write `tests/smoke/app.spec.ts`**

```ts
import { test, expect, _electron as electron } from '@playwright/test'

test('launches, creates tabs, splits, toggles theme', async () => {
  const app = await electron.launch({ args: ['out/main/index.js'] })
  const win = await app.firstWindow()
  await expect(win.locator('#tabbar')).toBeVisible()

  // new tab via palette
  await win.keyboard.press('Control+Shift+P')
  await win.locator('#palette input').fill('New Tab')
  await win.keyboard.press('Enter')
  await expect(win.locator('.tab')).toHaveCount(2)

  // toggle split
  await win.keyboard.press('Control+Shift+P')
  await win.locator('#palette input').fill('Toggle Split')
  await win.keyboard.press('Enter')
  await expect(win.locator('#paneB')).toBeVisible()

  // toggle theme
  await win.click('#theme-toggle')
  const theme = await win.evaluate(() => document.body.dataset.theme)
  expect(['light', 'dark']).toContain(theme)

  await app.close()
})
```

- [ ] **Step 3: Build then run the smoke test**

Run: `npm run build`
Run: `npm run test:smoke`
Expected: the spec passes (window opens, 2 tabs, pane B visible, theme set).

- [ ] **Step 4: Run the full unit suite once more**

Run: `npm test`
Expected: all unit tests (types, bufferManager, sessionStore, settingsStore, fileService, contextMenu) PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test: add Playwright electron smoke test for core flows"
```

---

## Self-Review

**Spec coverage check (each spec section → task):**
- §3 stack/process model/IPC/security → Tasks 1, 5 ✓
- §4 UI layout (tabs, split, status bar, command palette) → Tasks 7, 8, 11, 12 ✓
- §5 buffer model, session auto-save (default on + toggle), named-file save, settings store → Tasks 3, 4, 5, 10, 11 ✓
- §6 tabs behavior → Task 7 ✓; diff tab-vs-tab v1 → Task 13 ✓; theme light/dark/follow-os → Task 9 ✓; Monaco freebies (syntax/find/multicursor/minimap) → Task 6 (enabled via Monaco defaults) ✓
- §7 context-menu HKCU + runtime toggle + install-time registration + single-instance routing → Tasks 14, 15 ✓
- §8 roadmap v1 scope only — clipboard/file diff, markdown, hotkey, portable-as-feature deferred (portable build itself comes free with electron-builder in Task 15) ✓
- §9 testing: Vitest logic + Playwright smoke → Tasks 2–5, 14, 16 ✓

**Placeholder scan:** No "TBD/TODO/handle edge cases" left as instructions; every code step has concrete code. No native `prompt()`/`alert()` — diff uses a styled `DiffPicker` overlay and transient `toast()` notifications.

**Type consistency:** `BufferState`, `Settings`, `SessionData`, `OpenedFile`, `Api` defined in Task 2/5 and used with matching names/signatures throughout. `BufferManager` method names (`create/open/update/markSaved/close/toSession/restore`) consistent across Tasks 3, 7, 8, 10, 11, 13. `setContextMenu` signature consistent across preload (Task 5 Api), ipc (`contextmenu:set`), and main (Task 14).

**Known v1 notes:** line-number state lives on `EditorPane` (`lineNumbersOn`); diff uses a styled `DiffPicker` + `toast()`. Remaining minor item: theme toggle button placement relative to `#tabbar` (TabBar.render clears `#tabbar` children, so the button must live outside it — noted in Task 9 Step 3). Not blocking.
