# Bug & Robustness Audit — Notes & Codes v1.7.0

Audit date: 2026-06-30
Scope: Full codebase bug-hunt — correctness, crash/data-loss paths, race conditions, leaks,
security-boundary violations. No features or restyling.

---

## Triage outcome (2026-06-30, shipped v1.7.1 · commit `a135da2`)

Every finding was verified against the code ("audit the audit"). **16 confirmed and fixed**,
2 confirmed-but-downgraded (still fixed defensively), **1 rejected**. Fixes built clean +
131 unit tests green; manually verified on the 1.7.1 portable build. Plan:
`docs/superpowers/plans/audit-triage-fixes.md`.

| ID | Verdict | Resolution |
|----|---------|------------|
| C1 | ✅ Confirmed | Fixed — `atomicWrite` (tmp + `fs.rename`) in `fileService.writeFile`. |
| C2 | ✅ Confirmed | Fixed — all 7 stores routed through `atomicWrite`. |
| C3 | ✅ Confirmed (sev High, not Critical) | Fixed — session-timer `.catch` + one-shot toast. |
| I1 | ✅ Confirmed | Fixed — `try/catch` + toast in `saveActive`/`saveAll`. |
| I2 | ✅ Confirmed (low) | Fixed — `highlightStore.load` awaits the write chain. |
| I3 | ⚠️ Partial / theoretical | Fixed defensively — `restore` backfills `eol`/`language`/`dirty`. |
| I4 | ✅ Confirmed (low) | Fixed — `recentFilesStore` writes serialized through a chain. |
| I5 | ❌ Rejected | No change — `showMessageBoxSync` blocks the event loop; dialogs can't stack. |
| I6 | ✅ Confirmed (downgraded — bounded by distinct paths) | Fixed — stale `selfWrites` swept on each `file:changed`. |
| I7 | ✅ Confirmed | Fixed — discard-confirm on dirty named-file tab close. |
| I8 | ✅ Confirmed (partial) | Fixed for the Save-on-quit path (flush clip+session). **Residual:** a clean quit (no unsaved tabs) bypasses the flush — documented, deferred. |
| M1 | ✅ Confirmed | Fixed — `dialog.showErrorBox` on hotkey-register failure. |
| M2 | ✅ Confirmed | Fixed — `matchMedia` change listener re-applies `follow-os`. |
| M3 | ✅ Confirmed (dev-only) | Fixed — `clearInterval` on `beforeunload`. |
| M4 | ✅ Confirmed | Fixed — `console.error` in the history/highlight `.catch` chains. |
| M5 | ✅ Confirmed (theoretical) | Fixed — `promptInput` uses document capture-phase keydown. |
| M6 | ✅ Confirmed | Fixed — PDF render via temp file + `loadFile` (no data-URL ceiling). |
| M7 | ✅ Confirmed | Fixed — `window.api` guard at the top of `boot()`. |
| M8 | ✅ Confirmed (dup of C3) | Fixed — `mkdir` rejection now surfaced by the C3 catch. |

Bonus (not in audit): removed a dead `overlayOpen` const in `renderer/main.ts`.

---

## CRITICAL

### C1 — Non-atomic file writes can corrupt user data on crash

**`src/main/fileService.ts:17`** — `writeFile` uses `fs.writeFile(path, encode(withEol, encoding))`.

`fs.writeFile` opens with `O_TRUNC`, writes, and closes. If the process or OS crashes
mid-write, the file is left truncated/partially written — the **original file content is
permanently lost**. This affects every save path: manual save, autosave, and Save-All-on-quit.

**Suggested fix:** Write to a temp file in the same directory, then `fs.rename` (atomic on
NTFS). Only delete the original after the rename succeeds.

---

### C2 — All JSON stores lack atomic writes; crash mid-write → corrupted store, all data lost

**`src/main/sessionStore.ts:17-18`, `src/main/settingsStore.ts:18`,
`src/main/snippetStore.ts:24`, `src/main/clipboardHistoryStore.ts:16`,
`src/main/recentFilesStore.ts:13,17,21`, `src/main/highlightStore.ts:36`,
`src/main/fileHistoryStore.ts:36`**

Every `Store.save()` calls `fs.writeFile(file, JSON.stringify(...))` directly to the target
file. The load side is corrupt-safe (returns defaults on parse failure), but the **data
itself is gone**. Session (open tabs, active tab, all buffer content) is the most impactful
— crash at the wrong moment and the user's entire workspace is blank on restart.

**Suggested fix:** Write `{file}.tmp`, then `fs.rename(tmp, file)` (rename is atomic).
Apply this pattern to all stores.

---

### C3 — Unhandled promise rejections in session-save timer; session silently lost on write failure

**`src/renderer/main.ts:232`**

```ts
saveTimer = setTimeout(() => window.api.saveSession(manager.toSession()), 500) as unknown as number
```

The `setTimeout` callback creates a floating Promise. There is no `.catch()`. If the IPC
call or `fs.writeFile` fails (disk full, permission denied), the rejection is **unhandled**
— no toast, no retry, no console error the user would see. Work is silently lost. This
fires on every edit.

**Suggested fix:** Chain `.catch(err => { console.error('session save failed', err);
toast('Session save failed.'); })`.

---

## IMPORTANT

### I1 — `saveActive()` / `saveAll()` propagate unhandled rejections on write failure

**`src/renderer/main.ts:306-321`** (and command palette / menu call sites)

```ts
async function saveActive(): Promise<void> {
  const id = paneFor(view.focusedPane()).currentBufferId(); if (!id) return
  await saveBuffer(id)   // ← if writeFile/highlightSave throws, rejection is unhandled
  tabBar.render(manager.list(), manager.activeId); refreshStatus()
}
```

If `saveBuffer` throws (write failure, highlight save failure), the error propagates to the
caller. `saveActive` has no `try/catch`; callers at `commands.ts:31` and the menu handler
at `main.ts:518` also lack error handling. The user sees no feedback and the UI gets stuck
in a stale state.

**Suggested fix:** Wrap `saveActive` and `saveAll` callbacks in `try/catch` that shows a
toast on failure and refreshes the UI.

---

### I2 — Highlight store `load()` bypasses serialization chain; can return stale data

**`src/main/highlightStore.ts:24-25` vs `30-38`**

`save()` chains writes serially through `this.chain`, but `load()` (and its helper
`readAll()`) reads directly from disk without waiting for the chain. A `save(path, hs)`
followed by an immediate `load(path)` can return old data because the disk write hasn't
completed yet.

**Suggested fix:** Have `load()` wait on `this.chain` before reading, or route reads
through the chain too.

---

### I3 — `bufferManager.restore()` incomplete migration backfill

**`src/renderer/bufferManager.ts:77-82`**

```ts
restore(data: SessionData): void {
    this.buffers = data.buffers
    this._activeId = data.activeId
    this.untitledCount = this.buffers.length
    for (const b of this.buffers) if (!b.encoding) b.encoding = 'utf8'
}
```

Only `encoding` is backfilled. If session data from an older version is missing `eol`,
`language`, or `highlights`, those fields become `undefined`, causing downstream crashes
when the status bar reads `b.eol` (line 194) or when `writeFile` passes `undefined` to
`encode()`.

**Suggested fix:** Backfill all optional/missing fields: `eol ?? 'LF'`,
`language ?? 'plaintext'`, `highlights ?? undefined`, `dirty ?? false`.

---

### I4 — `recentFilesStore.add()` read-modify-write race

**`src/main/recentFilesStore.ts:14-17`**

```ts
async add(path: string): Promise<string[]> {
    const list = [path, ...(await this.load()).filter(p => p !== path)].slice(0, this.cap)
    await fs.writeFile(this.file, JSON.stringify(list), 'utf8')
    return list
}
```

Two nearly-simultaneous IPC calls (e.g., opening two files in quick succession) both read
the old file, both compute their version, and both write. The second write silently
overwrites the first — the file added by the first call vanishes from the list.

**Suggested fix:** Chain writes through a `Promise` queue (as `fileHistoryStore` and
`highlightStore` already do), or use a lock.

---

### I5 — `requestQuit()` has no re-entrance guard; can fire quit dialog multiple times

**`src/main/index.ts:39-48`**

`requestQuit()` can be triggered by: tray Quit menu click, File > Exit menu, and Ctrl+Q
accelerator. It calls `dialog.showMessageBoxSync()` which is blocking — so within one call
it can't re-enter. But `isQuitting` is never checked at the top of `requestQuit()`. If the
user hits "Cancel" and triggers quit again (e.g., spamming Ctrl+Q), a second dialog
appears.

**Suggested fix:** Check `if (isQuitting) return` at the top of `requestQuit()`.

---

### I6 — `selfWrites` Map entries never expire for files on non-watchable filesystems

**`src/renderer/main.ts:186-197`**

```ts
window.api.onFileChanged((path) => {
  const ts = selfWrites.get(path)
  if (ts !== undefined && Date.now() - ts < SELF_WRITE_WINDOW_MS) { selfWrites.delete(path); return }
  ...
})
```

Entries are only cleaned when a `file:changed` event arrives **within the 2.5s window**. If
the watcher fires after the window (e.g., network lag) or never fires (unsupported
filesystem like a mounted WebDAV share), entries persist indefinitely. Over many save
cycles, the Map accumulates dead entries.

**Suggested fix:** Periodically purge entries older than 10s, or use a `WeakMap`-like
approach tied to file path lifetimes.

---

### I7 — No dirty-check on tab close; unsaved file changes silently discarded

**`src/renderer/main.ts:209-216`**

```ts
function closeTab(id: string): void {
  const wasLast = manager.list().length === 1
  void flushHighlightSave(id)
  manager.close(id)
  ...
}
```

Closing a tab with a named file that has unsaved changes (dirty) **discards those changes
from disk without warning**. The session save captures the content, but the file on disk is
not updated.

**Suggested fix:** Warn on close if `b.dirty && b.filePath` with a "Save before closing?"
prompt.

---

### I8 — Settings writes and clipboard history not flushed on quit

**`src/renderer/main.ts:278-291`** (`onSaveAllAndQuit`) and **`main.ts:175`**
`persistClipHistory`

The quit sequence flushes highlight saves but does **not**:
- Flush the clipboard history debounce timer (`clipSaveTimer`, 500ms)
- Flush the session save debounce timer (`saveTimer`, 500ms)
- Await any in-flight settings saves (`persistFont`, etc.)

Recent clipboard entries and the most recent session state (last ~500ms of edits) can be
lost.

**Suggested fix:** In `onSaveAllAndQuit`, await `persistClipHistory` directly and await
a synchronous `window.api.saveSession(manager.toSession())` before calling `quitNow()`.

---

## MINOR

### M1 — `globalShortcut.register()` failure is silent

**`src/main/index.ts:117-118`**

```ts
const ok = globalShortcut.register(settings.globalHotkey || 'CommandOrControl+Shift+Space', toggleWindow)
if (!ok) console.error('global hotkey registration failed:', settings.globalHotkey)
```

The user gets no visual feedback that the hotkey is broken. If another app stole the
shortcut, the user won't know until they try it.

**Suggested fix:** Send a toast to the renderer (or show a `dialog.showErrorBox`).

---

### M2 — `follow-os` theme resolved once at boot, never updates on OS theme change

**`src/renderer/themes.ts:112-115`**

```ts
export function resolveThemeId(id: string): string {
  if (id === 'follow-os') {
    const dark = typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches
    return dark ? 'dark' : 'light'
  }
```

No `matchMedia('(prefers-color-scheme: dark)').addEventListener('change', ...)` anywhere.
If the user switches their OS from dark to light while the app is running, the app stays
dark until they manually toggle.

**Suggested fix:** In `ThemeController`, add a `matchMedia` change listener when
`themeId === 'follow-os'`.

---

### M3 — No `clearInterval` for the 5-minute history snapshot timer

**`src/renderer/main.ts:635-639`**

```ts
setInterval(() => {
  for (const b of manager.list()) {
    if (b.filePath && b.dirty) window.api.snapshotHistory(b.filePath, b.content, b.eol, b.encoding)
  }
}, HISTORY_INTERVAL_MS)
```

The interval is never cleared. In production the renderer lives for the app's lifetime, so
it's harmless. But in HMR dev reloads, the old interval survives (the new `boot()` creates
a new one), accumulating duplicate timers.

**Suggested fix:** Store the interval ID and clear it on `window.addEventListener('beforeunload', ...)`.

---

### M4 — File history and highlight store error chains silently swallow failures

**`src/main/fileHistoryStore.ts:44`** and **`src/main/highlightStore.ts:37`**

Both use `this.chains.set(path, next.catch(() => {}))` / `this.chain = next.catch(() => {})`.
If a snapshot or highlight save fails (disk full, permission denied), the error is
completely invisible — no console.error, no IPC error response. The data is silently lost.

**Suggested fix:** At minimum, `console.error('snapshot failed for', path, err)` inside
the catch.

---

### M5 — `PromptInput` overlay missing `capture: true` on keydown

**`src/renderer/inputOverlay.ts:27-30`**

```ts
field.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') done(field.value.trim() || null)
  if (e.key === 'Escape') done(null)
})
```

Unlike `confirmDialog` which uses `document.addEventListener('keydown', onKey, true)`
(capture phase), `promptInput` adds the listener on the input field directly with
bubble-phase. This is fine since the field has focus, but if something else captures the
event first, Enter won't fire.

**Suggested fix:** Use the same capture-phase pattern as `confirmDialog`.

---

### M6 — Export PDF data-URL ceiling — large documents silently fail

**`src/main/exportService.ts:41`**

```ts
await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
```

Chromium has a ~2MB data-URL limit. Large markdown documents (>~1.5MB of HTML) will fail
to load. The error is caught and returned as `{ ok: false }`, but the user gets a generic
"Export failed." toast with no indication that size was the cause.

**Suggested fix:** Write HTML to a temp file and use `win.loadFile()` instead, or give a
more descriptive error message.

---

### M7 — No runtime guard that `window.api` exists

**`src/renderer/main.ts:34`**

```ts
declare global { interface Window { api: Api } }
```

If the preload script fails to load or `contextBridge.exposeInMainWorld` is somehow
skipped, every `window.api.*` call throws `TypeError: Cannot read properties of undefined`.
There's no early-exit check at the top of `boot()`.

**Suggested fix:** At the top of `boot()`: `if (!window.api) { document.body.textContent = 'Failed to initialize.'; return; }`.

---

### M8 — `sessionStore.save()` doesn't handle `fs.mkdir` failure gracefully

**`src/main/sessionStore.ts:16`**

```ts
await fs.mkdir(this.dir, { recursive: true })
```

If the user's `%APPDATA%` directory is unwritable (permissions, quota), this throws. The
error propagates back to the renderer as an unhandled rejection (see C3).

**Suggested fix:** Catch and log, or at minimum ensure the caller handles the rejection.

---

## NON-BUGS (investigated and cleared)

- **IPC contract:** All 44 channel strings match across `types.ts`, `preload/index.ts`, and
  `main/ipc.ts`. No mismatches.
- **Security boundary:** No `node:*`, `electron`, `fs`, or `Buffer` imports in any
  `src/renderer/` file. `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`
  confirmed in `main/index.ts:73-78`.
- **Stores corrupt-safe on load:** Every `Store.load()` catches parse errors and returns
  defaults. Confirmed for all 7 stores.
- **Listener leaks:** All `ipcRenderer.on` callers in preload are preceded by
  `removeAllListeners`. Editor pane disposes cursor/paste listeners on re-registration. Diff
  view disposes models in `hide()`.
- **Encoding round-trip:** Unit tests confirm UTF-8/UTF-8-BOM/UTF-16LE/UTF-16BE round-trip
  correctly.
- **Tray lifecycle:** `window-all-closed` intentionally no-ops on Windows. `close` event
  prevents quit (hides to tray). Real quit gated behind `isQuitting` flag in `before-quit`.
- **Markdown XSS:** `renderMarkdown` runs through `DOMPurify.sanitize()`. `markdown-it` is
  configured with `html: false`.
- **Context menu registration:** `reg.exe` is invoked with the app's own exe path from
  `app.getPath('exe')`, not user-supplied input.

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 3     |
| Important | 8   |
| Minor | 8      |
| **Total** | **19** |

Top priorities: atomic file writes (C1, C2) and unhandled promise rejections (C3, I1) are
the most impactful to fix first, as they directly cause data loss with no user feedback.
