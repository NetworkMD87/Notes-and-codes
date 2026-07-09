# Bug & Improvement Audit — Notes & Codes v1.12.0

Audit date: 2026-07-09 (master @ `b735c7c`, clean tree)
Scope: full-codebase review — correctness, data-loss paths, races, leaks, security boundary,
architecture conventions, and improvement opportunities. Follows up on the v1.7.0 audit
(`AUDIT.md`), whose 18 fixes all still hold. Findings below are **new**.

---

## HIGH

### H1 — "Save As…" cancel permanently drops the file association

**`src/renderer/main.ts:667`**

```ts
'save-as': async () => { ...; const b = manager.get(id)!; b.filePath = null; await saveBuffer(id); ... }
```

`b.filePath` is nulled **before** the dialog opens. If the user cancels the Save-As dialog,
`saveBuffer` returns `false` and `filePath` stays `null`: the tab silently detaches from its
file. The next Ctrl+S re-prompts Save-As; the file watcher stops watching the original path
(`syncWatch` runs on the next save); autosave-to-disk stops for that buffer (`filePath === null`
is ineligible). The user gets no feedback that anything changed.

**Fix:** don't mutate the buffer up front. Add a `forceDialog` flag to `SaveOpts` and only call
`manager.markSaved(id, newPath)` after the dialog returns a path.

---

### H2 — Command-palette "Close Tab" bypasses every close safeguard

**`src/renderer/commands.ts:55`**

```ts
p.register({ id: 'close', label: 'Close Tab', run: () => { d.manager.close(d.manager.activeId!); ... } })
```

This calls `manager.close()` directly instead of `main.ts`'s `closeTab()`. Compared to closing
via the tab ×, middle-click, or File ▸ Close Tab, the palette path skips:

- the **dirty-file confirm** — unsaved changes to a named file are discarded with no warning
  (this is exactly what v1.7 finding I7 fixed for the other paths);
- the pending-highlight flush (`flushHighlightSave`);
- `paneA/paneB.forgetBuffer(id)` — the Monaco model + view state **leak** for every
  palette-closed tab;
- `highlights.forget(id)` / `hlLoaded.delete(id)` cleanup;
- the hide-to-tray behaviour when the last tab closes.

**Fix:** pass `closeTab` into `CommandDeps` and make the palette command call it, same as the
menu handler does.

---

### H3 — Opening a file from Explorer while hidden to tray never shows the window

**`src/main/index.ts:105-112`**

```ts
app.on('second-instance', (_e, argv) => {
  const f = fileArgFrom(argv)
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
    if (f) mainWindow.webContents.send('open-file', f)
  }
})
```

The app's normal resting state is **hidden to the tray** (X hides, doesn't quit). A hidden
`BrowserWindow` is neither minimized nor focusable — `restore()` doesn't apply and `focus()`
on a hidden window does nothing visible on Windows. Double-clicking an associated file (or
using the "Open with Notes & Codes" context-menu entry) while the app sits in the tray opens
the file *invisibly*: the second instance exits, nothing appears on screen.

**Fix:** call the existing `showWindow()` helper here instead of the restore/focus pair.

---

### H4 — One malformed session entry bricks startup (blank window)

**`src/main/sessionStore.ts:21-30` + `src/renderer/bufferManager.ts:83-95` + `src/renderer/main.ts:695`**

`SessionStore.load()` only checks that `parsed.buffers` is an array — unlike every other store
it does **not** filter malformed entries (CLAUDE.md's store contract says load "filters
malformed entries"). If any element is `null`/not an object (partial write predating
atomicWrite, disk bit-rot, hand-editing), `bufferManager.restore()` throws on the backfill
loop (`if (!b.encoding)` → TypeError on `null`). `boot()` is invoked as a floating promise
with **no `.catch`** (`main.ts:695`), so the exception vanishes and the app stays a blank
window until the user manually deletes `session.json`.

**Fix (both layers):**
1. In `SessionStore.load()`, filter: keep only entries with `typeof id === 'string' &&
   typeof title === 'string' && typeof content === 'string'`.
2. `boot().catch(...)` that toasts + falls back to `manager.create(); showActive()` so a bad
   session can never produce a dead app.

---

### H5 — Settings writes race at two layers (lost updates, possible write failure)

**Layer 1 — renderer read-modify-write.** ~14 call sites use the pattern
`loadSettings().then(s => saveSettings({ ...s, X }))` (`main.ts:61, 204, 217, 225, 231, 382,
391, 530-539`; `commands.ts:75-78, 88-92`; `folderMode.ts:50, 60, 97, 144`). Two overlapping
updates (e.g. zoom spam while a theme pick persists, or `openFolder` racing an appearance
toggle) read the same base object and the last write silently clobbers the other's field.

**Layer 2 — main-side store.** `SettingsStore.save()` (`settingsStore.ts:19-21`) has no
serialization chain (unlike `recentFilesStore`/`highlightStore`/`fileHistoryStore`), and
`atomicWrite` (`atomicWrite.ts:14`) always uses the **same** temp path (`file + '.tmp'`).
Two concurrent saves interleave as: A writes tmp → B writes tmp → A renames (B's content!) →
B renames a now-missing file → `ENOENT` rejection.

**Fix:** add a `settings:update` IPC that takes a *partial*, merged and written through a
serialized chain in main; migrate the renderer call sites to it (also deletes ~14 copies of
the same boilerplate). Cheap extra hardening: suffix the temp name
(`file + '.' + random + '.tmp'`).

---

## MEDIUM

### M1 — Closing a dirty *untitled* tab discards content silently

**`src/renderer/main.ts:127-133`** — the confirm only fires for `b.dirty && b.filePath`.
An untitled buffer full of notes closes with zero warning, and since closing removes it from
the session too, the content is unrecoverable (untitled buffers never hit file history either).
The v1.7 fix (I7) deliberately covered named files only; untitled scratch content is arguably
the app's core use case. **Fix:** confirm when `b.dirty && b.content.trim()` regardless of
`filePath` (label the button "Discard").

### M2 — Export always renders the document as Markdown

**`src/renderer/main.ts:450` → `src/renderer/exportDoc.ts:50`** — `buildExportHtml` pipes any
buffer through `renderMarkdown`, whatever its language. Exporting a `.ts`/`.py`/plain-text tab
to HTML/PDF mangles it (# comments become headings, indentation collapses, `<` swallowed).
**Fix:** for non-markdown languages wrap in `<pre><code>${escapeHtml(content)}</code></pre>`
instead of the Markdown pipeline (language is already known at the call site).

### M3 — No size or binary guard on file open

**`src/main/fileService.ts:10-15`** — `readFileForEditor` reads the whole file and hands it to
Monaco. A multi-hundred-MB log freezes/OOMs the renderer; a **binary** file (no BOM → decoded
as UTF-8) renders as garbage and — if the user saves — is **written back corrupted** through
the lossy decode→encode round-trip. **Fix:** `fs.stat` first and refuse (or confirm) above a
threshold (e.g. 50 MB); sniff the first few KB for NUL bytes and warn "binary file" before
opening writable.

### M4 — Duplicate store instances between `index.ts` and `ipc.ts`

`RecentFilesStore` is constructed twice (`src/main/index.ts:115` and `src/main/ipc.ts:30`) —
each has its own write chain, so the menu's "Clear Recent" (instance A) and a renderer
`recent:add` (instance B) are *not* serialized against each other and can interleave
read-modify-writes. `SettingsStore` is also duplicated, via an odd one-shot dynamic import
(`index.ts:132`: `new (await import('./settingsStore')).SettingsStore(...)` — it's already
statically imported in `ipc.ts`). **Fix:** construct each store once in `index.ts` and pass
them into `registerIpc`.

### M5 — Exports write non-atomically

**`src/main/exportService.ts:25, 51`** — final HTML/PDF outputs use plain `writeFile`. When the
user overwrites an existing export, a crash mid-write truncates the previous good copy — the
exact failure mode `atomicWrite` was introduced for (v1.7 C1/C2). **Fix:** route both writes
through `atomicWrite` (it already accepts a `Buffer` for the PDF).

### M6 — File-history and highlight stores grow without bound and orphan entries

`FileHistoryStore` keeps up to 50 **full-content** snapshots per file, keyed by path hash,
forever — files deleted or renamed on disk leave dead `.json` blobs; heavy use grows
`%APPDATA%` indefinitely. `HighlightStore` keeps all files' highlights in one
`highlights.json` keyed by absolute path — renames/deletes orphan their entries permanently.
**Fix:** a startup sweep (drop history/highlight entries whose source path no longer exists,
optionally cap total history size), and/or migrate highlight entries on `fs:rename`.

### M7 — Only one on-disk-change conflict can be resolved at a time

**`src/renderer/main.ts:636-644`** — `showChangeBar` `replaceChildren()`s the single change
bar, so if two watched files change while dirty, the second notice replaces the first. The
first buffer stays in `conflicts` (autosave correctly suppressed) but the user has lost the
UI to resolve it — no path back to Reload/Keep except editing the file again. **Fix:** queue
conflicts (show next after resolve) or stack one bar per conflicted buffer.

---

## LOW / hardening / cleanups

### L1 — Main process imports a renderer module
**`src/main/menu.ts:3`** — `import { THEME_LIST } from '../renderer/themes'`. Works today
(pure data; the module's `monaco` import is type-only) but silently violates the repo's own
process-boundary rule; a future `themes.ts` edit that adds a real DOM/monaco import breaks the
main build. **Fix:** move `THEME_LIST`/theme metadata to `src/shared/`.

### L2 — IPC handlers never validate the sender
`ipc.ts` registers ~40 handlers, several fs-capable with arbitrary paths (`file:read`,
`file:write`, `fs:rename`, `dir:walk`). Any webContents in the process may invoke them —
today only the sandboxed app window and the offscreen export window exist, so actual risk is
low, but the standard hardening is one line per handler (or a wrapper): verify
`event.senderFrame` is the main window's main frame. Worth doing while the surface is small.

### L3 — `atomicWrite` never fsyncs and can strand `.tmp` files
No `filehandle.sync()` before rename → on power loss the rename can survive while data didn't
(rare on NTFS, but the whole point of the helper is the crash window). A crash between write
and rename also leaves `*.tmp` litter that is never cleaned. Low priority; note for a rainy
day.

### L4 — `walkFiles` caps at 20 000 files silently
**`src/main/fsService.ts:6`** — Quick Open just misses files beyond the cap with no signal.
Return a `{ files, truncated }` shape (or log) so the UI can hint "index truncated".

### L5 — `FileHistoryStore.chains` map entries are never deleted
**`src/main/fileHistoryStore.ts:9`** — one retained promise per distinct path for the process
lifetime. Tiny, but trivially fixed by deleting the entry when the chain settles and equals
the stored promise.

### L6 — `refreshStatus` double non-null assertion
**`src/renderer/main.ts:121-122`** — `manager.get(id)!` with `manager.activeId!` fallback;
a close/focus race would throw here and take the listener down. Guard and early-return.

### L7 — `fileArgFrom` heuristic can mis-detect a file argument
**`src/main/index.ts:39-44`** — "last arg containing `\\`, `/` or `.`" can match stray
Chromium switch values. Fine in practice; an `existsSync` check would make it exact.

### L8 — `clipboard-history:save` accepts unbounded payloads
The renderer caps entries (50 × 1 MB) but main trusts whatever arrives
(`clipboardHistoryStore.save` writes verbatim). Cheap to clamp server-side too.

### L9 — `escapeHtml` doesn't escape single quotes
**`src/renderer/exportDoc.ts:5-9`** — currently only used in `<title>` (double-quoted
contexts), so safe today; add `'` → `&#39;` so future attribute use can't bite.

---

## Known issues (pre-existing, tracked elsewhere — not re-counted)

- Native **Shift+Alt+F** Format Document hotkey broken (menu + palette paths work); shipped
  as a known issue in v1.6, one fix attempt failed, deferred.
- Clean quit (no dirty tabs) bypasses the clipboard/session debounce flush — documented
  residual of v1.7 finding I8.

---

## What's in good shape (verified, no action)

- **Security boundary:** `contextIsolation:true`, `sandbox:true`, `nodeIntegration:false`;
  no `node:*`/`electron` imports anywhere under `src/renderer/`; the preload bridge is
  narrow and typed; `app:openExternal` is https-only; CSP is tight (`default-src 'self'`,
  no `unsafe-eval`, inline CSS only).
- **Markdown pipeline:** `markdown-it` with `html:false` + DOMPurify + `rel="noopener"` hook.
- **Registry context-menu writes** go through `execFile` arg arrays (no shell injection).
- **Crash-safety pass holds:** all seven stores load corrupt-safe and write through
  `atomicWrite`; save failures surface as toasts.
- **Overlay manager** gives consistent topmost-Esc dismissal; overlays register correctly.
- **Test breadth:** 30 unit files covering the pure-logic layer (including a palette-alignment
  guard test) + 7 Playwright smoke specs with isolated user-data dirs.

## Summary

| Severity | Count | Data-loss capable |
|----------|-------|-------------------|
| High     | 5     | H1, H2, H4 (+H3 user-facing loss of output) |
| Medium   | 7     | M1, M3, M5 |
| Low      | 9     | — |

**Suggested fix order:** H2 → H1 → H4 → H3 (each is a small, isolated diff) → M1 → H5/M4
together (one settings/store refactor) → M2/M3 → the rest opportunistically.
