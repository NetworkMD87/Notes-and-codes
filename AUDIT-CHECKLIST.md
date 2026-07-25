# Audit Checklist — Notes & Codes

Consolidated, workable checklist merged from the project's **two** codebase audits:

- **v1.7.0 audit** (2026-06-30) — full bug-hunt; **triaged + shipped in v1.7.1**. 19 findings:
  16 fixed, 2 fixed-defensively, 1 rejected. Resolved record kept in [Appendix A](#appendix-a).
- **v1.12.0 audit** (2026-07-09, master @ `b735c7c`) — full-codebase follow-up; **triaged + fully
  resolved** (2026-07). 21 findings: 5 High, 7 Medium, 9 Low — each verified against the code
  ("audit the audit"), then fixed; every item below is `[x]`. **Both audits are now CLOSED — this file
  is a resolved record. The "How to work this" flow below is kept for reference / the next audit.**

**Two checks remain unverified by hand**, and are labelled **Open manual check** inline (H1 and L4).
Both are fixed in code and covered by build + unit tests; what's missing is a human confirming the
behaviour on a real build, because each needs something a test can't stage — a native OS dialog, and
a folder of 20,000+ files. They are listed rather than quietly closed.

The original `AUDIT.md` / `AUDIT-v1.12.0.md` were folded into this file and deleted; their full
verbatim text stays recoverable from git history if ever needed.

**How to work this:** same flow as the v1.7 triage — first **verify each finding against the
code** ("audit the audit"), then fix. Each item is a small isolated diff unless flagged.
Gate every change on `npm run build` (strict `tsc`, the real gate) + `npm test`; manual checks
where noted (OS-level paths aren't smoke-testable). Phases are ordered by risk × blast-radius;
within a phase, do the items top-down.

**Legend:** `[ ]` to do · `[x]` done · severity **High** / **Med** / **Low** ·
source tag = which audit + original ID.

---

## Phase 1 — Data-loss & close/quit safety  *(do first)*

Every item here **silently loses user content** on a save / close / quit path with no feedback.
Coherent theme (close + save code), and the highest-impact class of bug.

- [x] **H1 · High · v1.12 H1 — "Save As…" cancel permanently drops the file association.** ✅ *Fixed (branch `fix/audit-p1-data-loss`).*
  `src/renderer/main.ts:667`. `b.filePath` is nulled *before* the dialog opens; if the user
  cancels, `saveBuffer` returns `false` and `filePath` stays `null` — the tab silently detaches
  from its file (next Ctrl+S re-prompts Save-As, the watcher stops watching the original path,
  autosave-to-disk stops for that buffer), with no feedback.
  **Fix:** don't mutate the buffer up front. Add a `forceDialog` flag to `SaveOpts`, and only call
  `manager.markSaved(id, newPath)` *after* the dialog returns a path.
  **Done:** `SaveOpts` gained `forceDialog`; `saveBuffer` prompts when `!path || opts.forceDialog`;
  the `save-as` handler no longer nulls `filePath` and passes `{ ...MANUAL_SAVE, forceDialog: true }`
  — so a cancelled Save-As is now a no-op, the association survives. Verified: `npm run build`
  (strict tsc) clean + 155/155 unit tests. **Open manual check** — the native Save-As dialog is
  OS-level and can't be smoke-tested, so this fix is verified by build + unit tests only and has
  not been confirmed by hand on a real build: Save-As a named file → Cancel → confirm the tab keeps
  its name, Ctrl+S saves silently (no re-prompt), autosave still works.

- [x] **H2 · High · v1.12 H2 — Command-palette "Close Tab" bypasses every close safeguard.** ✅ *Fixed (branch `fix/audit-p1-close-safety`).*
  `src/renderer/commands.ts:55` calls `manager.close()` directly instead of `main.ts`'s
  `closeTab()`, so the palette path skips: the **dirty-file confirm** (unsaved named-file changes
  discarded with no warning — exactly what v1.7 I7 fixed for the other paths); the pending
  `flushHighlightSave`; `paneA/paneB.forgetBuffer(id)` — the Monaco model + view state **leak**
  for every palette-closed tab; `highlights.forget(id)` / `hlLoaded.delete(id)` cleanup; and the
  hide-to-tray behaviour when the last tab closes.
  **Fix:** pass `closeTab` into `CommandDeps` and have the palette command call it, same as the
  menu handler does.
  **Done:** `CommandDeps` gained `closeTab`; palette `close` is now `() => void d.closeTab(d.manager.activeId!)`
  and `main.ts` passes `closeTab` into the deps — the palette shares the full safe close path.
  **Surfaced + fixed a latent bug:** routing the palette (Enter-triggered) through the dirty confirm
  exposed an **Enter-bleed** — the same Enter that ran the command instantly activated the confirm's
  focused Discard button, discarding *without the user seeing the prompt*. Fixed in `inputOverlay.ts`:
  `confirmDialog` now arms its Enter-listener + `ok.focus()` on the next `requestAnimationFrame`, past
  the opening keystroke. Verified: `npm run build` (strict tsc) + 155 unit + full smoke
  (`tests/smoke/close-safety.spec.ts` × 3; suite green bar the pre-existing Monaco cold-render flake).

- [x] **M1 · Med · v1.12 M1 — Closing a dirty *untitled* tab discards content silently.** ✅ *Fixed (branch `fix/audit-p1-close-safety`).*
  `src/renderer/main.ts:127-133` — the confirm only fires for `b.dirty && b.filePath`. An untitled
  buffer full of notes closes with zero warning, and closing removes it from the session too, so
  it's unrecoverable (untitled buffers never hit file history). v1.7 I7 deliberately covered named
  files only, but untitled scratch content is arguably the app's core use case.
  **Fix:** confirm when `b.dirty && b.content.trim()` regardless of `filePath` (button "Discard").
  *(Grouped here with H2 — both are close-time dirty-confirm gaps in the same code path.)*
  **Done:** `closeTab` guard widened to `b.dirty && (b.filePath || b.content.trim())` — a dirty
  untitled buffer with content now prompts before discard, via both the tab-× and (post-H2) palette
  paths. Covered by `tests/smoke/close-safety.spec.ts`.

- [x] **R1 · Med · v1.7 I8 (residual) — Clean quit bypasses the clipboard/session debounce flush.** ✅ *Fixed (branch `fix/audit-p1-clean-quit-flush`).*
  A *clean* quit (no dirty tabs) skips the flush that `onSaveAllAndQuit` performs, so the last
  ~500ms of clipboard history and session state can be lost. The v1.7 fix covered only the
  Save-on-quit path; this residual was documented + deferred at the time.
  **Fix:** flush the `clipSaveTimer` + `saveTimer` debounces (await `persistClipHistory` and a
  synchronous `saveSession`) on the clean-quit path too, before `quitNow()`.
  **Done:** extracted the renderer flush into a shared `flushPendingWritesBeforeQuit()` (used by
  both the save-then-quit and clean-quit paths). Added an `app:flushAndQuit` main→renderer signal
  (`Api.onFlushAndQuit` + preload bridge): on a clean quit `requestQuit` now asks the renderer to
  flush, which replies `app:quitNow`; a `FLUSH_QUIT_FALLBACK_MS` (2s) force-quit still guarantees
  the exit if the renderer wedges. Covered by `tests/smoke/clean-quit.spec.ts` (relaunch shows the
  flushed tab). *Scope note:* the **"Don't Save"** dialog choice still exits without flushing — it's
  an explicit discard, so left as-is. Verified: `npm run build` (strict tsc) + 155 unit + full smoke.

---

## Phase 2 — Startup & window reliability

The app failing to come up, or failing to show, is functionally as bad as data loss. Two small,
isolated diffs in the main process + startup path.

- [x] **H4 · High · v1.12 H4 — One malformed session entry bricks startup (blank window).** ✅ *Fixed (branch `fix/audit-p2-startup-window`).*
  `src/main/sessionStore.ts:21-30` + `src/renderer/bufferManager.ts:83-95` + `src/renderer/main.ts:695`.
  `SessionStore.load()` only checks `parsed.buffers` is an array — unlike every other store it does
  **not** filter malformed entries (violates CLAUDE.md's store contract). A `null`/non-object element
  (partial write predating `atomicWrite`, bit-rot, hand-edit) makes `bufferManager.restore()` throw
  in the backfill loop; `boot()` runs as a floating promise with **no `.catch`**, so the exception
  vanishes and the app stays a blank window until the user manually deletes `session.json`.
  **Fix (both layers):** (1) in `SessionStore.load()`, keep only entries with
  `typeof id === 'string' && typeof title === 'string' && typeof content === 'string'`; (2)
  `boot().catch(...)` that toasts + falls back to `manager.create(); showActive()` so a bad
  session can never produce a dead app.
  **Done:** `load()` now filters malformed buffers (id/title/content string check) **and** nulls a
  dangling `activeId` that pointed to a dropped buffer (else `showActive` would crash and the catch
  would discard the good buffers — caught in self-review). `boot().catch` toasts + falls back to
  `manager.create(); showActive()`. Covered by `tests/unit/sessionStore.test.ts` (filter + dangling
  activeId) + `tests/smoke/startup-window.spec.ts` (malformed session → app still renders its tab).

- [x] **H3 · High · v1.12 H3 — Opening a file from Explorer while hidden to tray never shows the window.** ✅ *Fixed (branch `fix/audit-p2-startup-window`).*
  `src/main/index.ts:105-112`. The app's resting state is hidden-to-tray (X hides, doesn't quit).
  A hidden `BrowserWindow` is neither minimized nor focusable — `restore()` doesn't apply and
  `focus()` does nothing visible on Windows. Double-clicking an associated file (or "Open with
  Notes & Codes") while in the tray opens the file *invisibly*: the second instance exits, nothing
  appears.
  **Fix:** call the existing `showWindow()` helper here instead of the `restore()`/`focus()` pair.
  **Done:** the `second-instance` handler now calls `showWindow()` (which `show()`s a hidden window,
  restores a minimized one, and recreates a closed one) before delivering the file. Covered by
  `tests/smoke/startup-window.spec.ts` (hidden-to-tray + `second-instance` → window becomes visible).

---

## Phase 3 — Store integrity & write races

All main-process store / write-integrity. **H5 + M4 are best done together** (one settings/store
refactor); M5/M6 are store lifecycle in the same neighbourhood.

- [x] **H5 · High · v1.12 H5 — Settings writes race at two layers (lost updates + possible write failure).** ✅ *Fixed (branch `fix/audit-p3-store-integrity`).*
  **Layer 1 (renderer read-modify-write):** ~14 sites use `loadSettings().then(s => saveSettings({ ...s, X }))`
  (`main.ts:61,204,217,225,231,382,391,530-539`; `commands.ts:75-78,88-92`; `folderMode.ts:50,60,97,144`).
  Two overlapping updates read the same base object; the last write clobbers the other's field.
  **Layer 2 (main store):** `SettingsStore.save()` (`settingsStore.ts:19-21`) has no serialization
  chain, and `atomicWrite` (`atomicWrite.ts:14`) always uses the **same** temp path — two concurrent
  saves interleave (A writes tmp → B writes tmp → A renames B's content → B renames a missing file →
  `ENOENT`).
  **Fix:** add a `settings:update` IPC taking a *partial*, merged + written through a serialized
  chain in main; migrate the ~14 renderer sites to it (deletes the boilerplate). Cheap extra
  hardening: suffix the temp name (`file + '.' + random + '.tmp'`).
  **Done:** `SettingsStore` gained a serialized write `chain` + `update(partial)` (read-merge-write
  inside the chain); new `settings:update` IPC (`Api.updateSettings` + preload). All 17 renderer
  read-modify-write sites migrated (value-setters drop the read; toggles keep only the read they
  need). `atomicWrite` now uses a unique per-write temp name. `saveSettings` (full write) is now
  unused by the renderer but kept as a valid store API (tested). Covered by `settingsStore.test.ts`
  (merge + concurrent-serialization). *(`saveSettings` IPC is a candidate for later pruning.)*

- [x] **M4 · Med · v1.12 M4 — Duplicate store instances between `index.ts` and `ipc.ts`.** ✅ *Fixed (with H5).*
  `RecentFilesStore` is constructed twice (`index.ts:115`, `ipc.ts:30`) — each has its own write
  chain, so the menu's "Clear Recent" (instance A) and a renderer `recent:add` (instance B) aren't
  serialized against each other and can interleave. `SettingsStore` is also duplicated, via an odd
  one-shot dynamic import (`index.ts:132`) though it's already statically imported in `ipc.ts`.
  **Fix:** construct each store once in `index.ts` and pass them into `registerIpc`.
  *(Do alongside H5 — same store-serialization refactor.)*
  **Done:** `SettingsStore` + `RecentFilesStore` are constructed once in `index.ts` and passed via
  `IpcDeps`; `registerIpc` uses `deps.settings`/`deps.recent`; the one-shot dynamic `SettingsStore`
  import in `index.ts` is gone (uses the shared instance for the hotkey read).

- [x] **M5 · Med · v1.12 M5 — Exports write non-atomically.** ✅ *Fixed (branch `fix/audit-p3-store-integrity`).*
  `src/main/exportService.ts:25,51` — final HTML/PDF outputs use plain `writeFile`. Overwriting an
  existing export + a crash mid-write truncates the previous good copy — the exact failure mode
  `atomicWrite` was introduced for (v1.7 C1/C2).
  **Fix:** route both writes through `atomicWrite` (it already accepts a `Buffer` for the PDF).
  **Done:** both HTML + PDF outputs go through `atomicWrite` (the throwaway temp render file for the
  PDF stays a plain write). No new test — the export fns are native-save-dialog-gated (not
  end-to-end testable) and atomicity is already covered by `atomicWrite.test.ts`.

- [x] **M6 · Med · v1.12 M6 — File-history & highlight stores grow without bound and orphan entries.** ✅ *Fixed (branch `fix/audit-p3-store-integrity`).*
  `FileHistoryStore` keeps up to 50 **full-content** snapshots per file, keyed by path hash,
  forever — deleted/renamed files leave dead `.json` blobs; `%APPDATA%` grows indefinitely.
  `HighlightStore` keeps all files' highlights in one `highlights.json` keyed by absolute path —
  renames/deletes orphan their entries permanently. *(Also the v1.7-deferred "prune orphaned
  history for deleted/renamed files" item.)*
  **Fix:** a startup sweep (drop history/highlight entries whose source path no longer exists,
  optionally cap total history size), and/or migrate highlight entries on `fs:rename`.
  **Done:** both stores gained a best-effort `sweep()` (fire-and-forget in `registerIpc` at startup)
  that drops entries whose source file is **confirmed missing** (ENOENT only — a shared
  `fsService.isMissing()`, so a temporarily-offline drive never triggers a delete). Covered by sweep
  tests in `fileHistoryStore.test.ts` + `highlightStore.test.ts`. *(`fs:rename` migration not done —
  the sweep reclaims renamed files' orphans; preserving highlights across rename is a future nicety.)*

---

## Phase 4 — Editor correctness & content fidelity

Correctness of what the editor reads, writes, and shows. No silent data loss like Phase 1, but
each mangles or hides user content.

- [x] **M2 · Med · v1.12 M2 — Export always renders the document as Markdown.** ✅ *Fixed (branch `fix/audit-p4-editor-correctness`).*
  `src/renderer/main.ts:450` → `src/renderer/exportDoc.ts:50`. `buildExportHtml` pipes any buffer
  through `renderMarkdown` whatever its language — exporting a `.ts`/`.py`/plain-text tab to HTML/PDF
  mangles it (`#` comments → headings, indentation collapses, `<` swallowed).
  **Fix:** for non-markdown languages wrap in `<pre><code>${escapeHtml(content)}</code></pre>`
  instead of the Markdown pipeline (language is already known at the call site).
  **Done:** `buildExportHtml(src, title, language)` — only `language === 'markdown'` renders via
  markdown-it; everything else exports verbatim in `<pre><code>`. Covered by `exportDoc.test.ts`.

- [x] **M3 · Med · v1.12 M3 — No size or binary guard on file open.** ✅ *Fixed (branch `fix/audit-p4-editor-correctness`).*
  `src/main/fileService.ts:10-15` — `readFileForEditor` reads the whole file and hands it to Monaco.
  A multi-hundred-MB log freezes/OOMs the renderer; a **binary** file (no BOM → decoded as UTF-8)
  renders as garbage and, if saved, is **written back corrupted** through the lossy decode→encode
  round-trip.
  **Fix:** `fs.stat` first and refuse (or confirm) above a threshold (e.g. 50 MB); sniff the first
  few KB for NUL bytes and warn "binary file" before opening writable.
  **Done:** `readFileForEditor` stats first and refuses above `MAX_OPEN_BYTES` (50 MB), and refuses a
  NUL-bearing buffer with no BOM (BOM-marked UTF-16 still opens). Returns a `ReadResult` union
  `{ ok, file } | { ok:false, reason }`; all four renderer open paths surface `reason` as a toast.
  Covered by `fileService.test.ts` (size + binary + BOM-utf16 guards).

- [x] **M7 · Med · v1.12 M7 — Only one on-disk-change conflict can be resolved at a time.** ✅ *Fixed (branch `fix/audit-p4-editor-correctness`).*
  `src/renderer/main.ts:636-644` — `showChangeBar` `replaceChildren()`s the single change bar, so if
  two watched files change while dirty, the second notice replaces the first. The first buffer stays
  in `conflicts` (autosave correctly suppressed) but the user has lost the UI to resolve it — no path
  back to Reload/Keep except editing the file again.
  **Fix:** queue conflicts (show next after resolve) or stack one bar per conflicted buffer.
  **Done:** conflicts queue — the bar shows one at a time with an "(N more)" hint and surfaces the
  next on Reload/Keep; `closeTab` drops a closed tab's conflict and advances the bar. Covered by
  `change-conflicts.spec.ts`.

---

## Phase 5 — Hardening & cleanups  *(low risk, opportunistic)*

No user-visible bug today; each is cheap insurance or a convention fix. Pick up between the
heavier phases.

- [x] **L1 · Low · v1.12 L1 — Main process imports a renderer module.** ✅ *Fixed (branch `fix/audit-p5-l1-theme-boundary`).*
  `src/main/menu.ts:3` — `import { THEME_LIST } from '../renderer/themes'`. Works today (pure data;
  the module's `monaco` import is type-only) but violates the process-boundary rule; a future
  `themes.ts` DOM/monaco import breaks the main build. **Fix:** move `THEME_LIST`/theme metadata to
  `src/shared/`.
  **Done:** `THEME_LIST` (id/label metadata, pure data) moved to new `src/shared/themes.ts` as the
  source of truth; `menu.ts` imports it from `../shared/themes` (no `src/main` file imports `renderer`
  anymore — verified by grep). Renderer `themes.ts` re-exports it so `appearancePanel.ts` + the test
  keep importing from `./themes` unchanged; the full monaco-bearing `THEMES` defs stay renderer-only.
  New `sharedThemes.test.ts` guards the shared list stays aligned with renderer `THEMES` (id + label,
  in order) so a future theme add / label typo fails CI. Gate: build (strict tsc) + 178 unit + smoke.
- [x] **L2 · Low · v1.12 L2 — IPC handlers never validate the sender.** ✅ *Fixed (branch `fix/audit-p5-l2-ipc-sender`).*
  `ipc.ts` registers ~40 handlers, several fs-capable with arbitrary paths (`file:read`, `file:write`,
  `fs:rename`, `dir:walk`). Risk is low today (only the app window + offscreen export window exist),
  but the standard hardening is one line per handler: verify `event.senderFrame` is the main window's
  main frame. Worth doing while the surface is small.
  **Done:** every `ipcMain.handle`/`ipcMain.on` is now registered through local `handle`/`on` wrappers
  that reject any sender whose frame isn't the app window's own `webContents.mainFrame` (identity, not
  URL — plus a null/destroyed-window guard), logging + returning `undefined`. The predicate is a pure
  `isTrustedSender()` in `src/main/senderGuard.ts` (unit-tested, 4 cases). Confirmed the offscreen
  export `BrowserWindow` has no preload and sends no IPC, so it's unaffected. Gate: build (strict tsc)
  + 183 unit + full smoke 47/47 (every IPC-driven flow — open/save/session/settings/walk/export —
  proves the guard doesn't reject legitimate main-window IPC).
- [x] **L3 · Low · v1.12 L3 — `atomicWrite` never fsyncs and can strand `.tmp` files.** ✅ *Fixed — cleanup shipped; fsync verified-but-rejected (branch `fix/audit-p5-l3-atomicwrite-fsync`).*
  No `filehandle.sync()` before rename → on power loss the rename can survive while data didn't (rare
  on NTFS, but that crash window is the whole point of the helper). A crash between write and rename
  also leaves `*.tmp` litter never cleaned.
  **Done (tmp cleanup):** `atomicWrite` now wraps the write+rename in try/catch and `fs.rm(tmp,{force})`
  on any failure, so an interrupted write can't strand a `.tmp`. Covered by `atomicWrite.test.ts`
  (rename-into-a-non-empty-dir forces failure → asserts no `.tmp` remains); also fixed a pre-existing
  vacuous "no .tmp" test (it probed the old fixed name, which the unique-temp scheme never produces).
  **fsync deliberately NOT adopted:** implementing `handle.sync()` before the rename **reproducibly
  regressed** the `Format on save … persists` smoke test — Windows `FlushFileBuffers` has highly
  variable latency and occasionally stalled the settings-write path past the test's 5 s window
  (i.e. a real user-facing write stall, not just a test artifact). Isolated by A/B/C variant testing:
  cleanup-only and handle-write-without-sync both pass 8/8; only the fsync build flakes. The durability
  gain is marginal (crash-between-write-and-rename is rare on NTFS, per the finding) and not worth the
  latency regression for a local scratchpad, so `atomicWrite` keeps its atomic-rename guarantee without
  the blocking fsync. Rationale recorded in `atomicWrite.ts`. Gate: build + 184 unit + smoke (formatOnSave 8/8).
- [x] **L4 · Low · v1.12 L4 — `walkFiles` caps at 20 000 files silently.** ✅ *Fixed (branch `fix/audit-p5-l4-walkfiles-truncated`).*
  `src/main/fsService.ts:6` — Quick Open just misses files beyond the cap with no signal. Return a
  `{ files, truncated }` shape (or log) so the UI can hint "index truncated".
  **Done:** `walkFiles` returns `WalkResult { files, truncated }` (new type in `shared/types.ts`,
  threaded through the `dir:walk` IPC + `Api`); `truncated` is set when a real (non-ignored) entry is
  reached past the cap. Added an optional `max` param (defaults to `MAX_INDEX_FILES`) so truncation is
  unit-testable without 20k files. `folderMode` stores the flag and passes it to `QuickOpen`, which
  renders a muted `.qo-note` footer ("Index truncated — some files may not appear.") when set. Covered
  by `fsService.test.ts` (recursive-list + cap/truncated cases). Gate: build + 179 unit + smoke.
  **Open manual check** — the truncated-note footer only appears past the 20k-file cap, so staging it
  needs a genuinely huge folder. The logic is unit-tested via the `max` param; the note has never been
  eyeballed rendering in the app.
- [x] **L5 · Low · v1.12 L5 — `FileHistoryStore.chains` map entries are never deleted.** ✅ *Fixed (branch `fix/audit-p5-hardening-batch`).*
  `src/main/fileHistoryStore.ts:9` — one retained promise per distinct path for the process lifetime.
  Tiny; delete the entry when the chain settles and equals the stored promise.
  **Done:** `snapshot()` drops the per-path `chains` entry once the write settles, guarded on promise
  **identity** (`chains.get(path) === guarded`) so a newer snapshot that chained on in the meantime
  keeps its entry. Covered by `fileHistoryStore.test.ts` ("drops the per-path chain entry once its
  snapshot settles").
- [x] **L6 · Low · v1.12 L6 — `refreshStatus` double non-null assertion.** ✅ *Fixed (branch `fix/audit-p5-hardening-batch`).*
  `src/renderer/main.ts:121-122` — `manager.get(id)!` with `manager.activeId!` fallback; a close/focus
  race would throw here and take the listener down. Guard and early-return.
  **Done:** both `!` assertions dropped — `id` resolves to `null`, `b` to `undefined`, and the function
  early-returns on a nullish buffer instead of throwing. Renderer wiring (not unit-testable); gated by
  strict `tsc` + the full smoke suite (47/47 — every startup/focus path exercises `refreshStatus`).
- [x] **L7 · Low · v1.12 L7 — `fileArgFrom` heuristic can mis-detect a file argument.** ✅ *Fixed (branch `fix/audit-p5-hardening-batch`).*
  `src/main/index.ts:39-44` — "last arg containing `\`, `/` or `.`" can match stray Chromium switch
  values. Fine in practice; an `existsSync` check would make it exact.
  **Done:** heuristic extracted to a pure, DI'd `pickFileArg(argv, isPackaged, exists)` in
  `src/main/fileArg.ts`; it prefers the last path-like arg that **exists on disk**, falling back to the
  old last-path-like match when none exist (no regression). `index.ts` calls it with `existsSync`.
  Covered by `fileArg.test.ts` (6 cases).
- [x] **L8 · Low · v1.12 L8 — `clipboard-history:save` accepts unbounded payloads.** ✅ *Fixed (branch `fix/audit-p5-hardening-batch`).*
  The renderer caps entries (50 × 1 MB) but main trusts whatever arrives (`clipboardHistoryStore.save`
  writes verbatim). Cheap to clamp server-side too.
  **Done:** `save()` now clamps server-side (mirrors `PasteHistoryList`): non-strings filtered, ≤ 50
  entries, each ≤ `MAX_ENTRY_LEN` (kept just above the renderer's per-entry cap so a normally-truncated
  entry passes untouched). Covered by `clipboardHistoryStore.test.ts` (clamp-count + truncate cases).
- [x] **L9 · Low · v1.12 L9 — `escapeHtml` doesn't escape single quotes.** ✅ *Fixed (branch `fix/audit-p5-hardening-batch`).*
  `src/renderer/exportDoc.ts:5-9` — only used in `<title>` (double-quoted) today, so safe; add
  `'` → `&#39;` so future attribute use can't bite.
  **Done:** `'` → `&#39;` added to the `ESC` map + the replace regex. Covered by `exportDoc.test.ts`.

---

## Known issues (pre-existing, tracked elsewhere — not re-counted)

- ~~Native **Shift+Alt+F** Format Document hotkey broken (menu + palette paths work); shipped as a
  known issue in v1.6, one fix attempt failed, deferred.~~ **Fixed 2026-07-25** — two `EditorPane`
  instances registered the same global Monaco keybinding, so the hidden empty pane won. See
  ROADMAP ▸ Format Document.
- *(v1.7 I8 clean-quit flush is promoted to an actionable item — see **R1** in Phase 1.)*

## What's in good shape (verified in the v1.12 pass, no action)

- **Security boundary:** `contextIsolation:true`, `sandbox:true`, `nodeIntegration:false`; no
  `node:*`/`electron` imports under `src/renderer/`; narrow typed preload bridge; `app:openExternal`
  https-only; tight CSP (`default-src 'self'`, no `unsafe-eval`, inline CSS only).
- **Markdown pipeline:** `markdown-it` with `html:false` + DOMPurify + `rel="noopener"` hook.
- **Registry context-menu writes** go through `execFile` arg arrays (no shell injection).
- **Crash-safety pass (v1.7) holds:** all seven stores load corrupt-safe and write through
  `atomicWrite`; save failures surface as toasts.
- **Overlay manager** gives consistent topmost-Esc dismissal; overlays register correctly.
- **Test breadth:** 30 unit files (incl. a palette-alignment guard) + 7 Playwright smoke specs
  with isolated user-data dirs.

---

## Progress summary

| Phase | Theme | Items | Severity |
|-------|-------|-------|----------|
| 1 | Data-loss & close/quit safety | ~~H1~~✅, ~~H2~~✅, ~~M1~~✅, ~~R1~~✅ **— DONE** | 2 High, 2 Med |
| 2 | Startup & window reliability | ~~H4~~✅, ~~H3~~✅ **— DONE** | 2 High |
| 3 | Store integrity & write races | ~~H5~~✅, ~~M4~~✅, ~~M5~~✅, ~~M6~~✅ **— DONE** | 1 High, 3 Med |
| 4 | Editor correctness & content fidelity | ~~M2~~✅, ~~M3~~✅, ~~M7~~✅ **— DONE** | 3 Med |
| 5 | Hardening & cleanups | ~~L1~~✅, ~~L2~~✅, ~~L3~~✅, ~~L4~~✅, ~~L5~~✅, ~~L6~~✅, ~~L7~~✅, ~~L8~~✅, ~~L9~~✅ **— DONE** | 9 Low |
| — | **Total open** | **0** | **All phases complete** — every v1.12.0 audit finding is resolved (5 High + 7 Med + 9 Low + R1). L3's fsync sub-part verified-but-rejected with rationale; the rest fixed. |

---

<a name="appendix-a"></a>
## Appendix A — v1.7.0 audit (RESOLVED, shipped v1.7.1 · commit `a135da2`)

Every finding was verified against the code ("audit the audit"). **16 confirmed + fixed**,
2 confirmed-but-downgraded (fixed defensively), **1 rejected**. Fixes built clean + 131 unit tests
green; verified on the 1.7.1 portable build. Full plan: `docs/superpowers/plans/audit-triage-fixes.md`.
Kept here as the record; full verbatim finding text is in git history (former `AUDIT.md`).

| ID | Finding (short) | Verdict | Resolution |
|----|-----------------|---------|------------|
| C1 | Non-atomic file writes corrupt data on crash | ✅ Confirmed | `atomicWrite` (tmp + `fs.rename`) in `fileService.writeFile`. |
| C2 | All JSON stores lack atomic writes | ✅ Confirmed | All 7 stores routed through `atomicWrite`. |
| C3 | Unhandled rejection in session-save timer | ✅ High (not Crit) | Session-timer `.catch` + one-shot toast. |
| I1 | `saveActive`/`saveAll` unhandled rejection | ✅ Confirmed | `try/catch` + toast in both. |
| I2 | Highlight store `load()` bypasses chain | ✅ Low | `highlightStore.load` awaits the write chain. |
| I3 | `bufferManager.restore()` incomplete backfill | ⚠️ Theoretical | Fixed defensively — backfills `eol`/`language`/`dirty`. |
| I4 | `recentFilesStore.add()` read-modify-write race | ✅ Low | Writes serialized through a chain. |
| I5 | `requestQuit()` no re-entrance guard | ❌ Rejected | No change — `showMessageBoxSync` blocks the loop; dialogs can't stack. |
| I6 | `selfWrites` map entries never expire | ✅ Downgraded | Stale entries swept on each `file:changed`. |
| I7 | No dirty-check on named-file tab close | ✅ Confirmed | Discard-confirm on dirty named-file close. |
| I8 | Settings/clipboard not flushed on quit | ✅ Partial | Fixed for Save-on-quit path. **Residual → R1 above.** |
| M1 | `globalShortcut.register()` failure silent | ✅ Confirmed | Later degraded to non-blocking toast (Phase 3.5 P2). |
| M2 | `follow-os` never updates on OS theme change | ✅ Confirmed | `matchMedia` change listener re-applies `follow-os`. |
| M3 | No `clearInterval` for history snapshot timer | ✅ Dev-only | `clearInterval` on `beforeunload`. |
| M4 | History/highlight error chains swallow failures | ✅ Confirmed | `console.error` in the `.catch` chains. |
| M5 | `PromptInput` missing capture-phase keydown | ✅ Theoretical | `promptInput` uses document capture-phase keydown. |
| M6 | Export PDF data-URL ceiling | ✅ Confirmed | PDF render via temp file + `loadFile`. |
| M7 | No runtime guard that `window.api` exists | ✅ Confirmed | `window.api` guard at top of `boot()`. |
| M8 | `sessionStore.save()` mkdir failure ungraceful | ✅ Dup of C3 | Surfaced by the C3 catch. |

*(Bonus, not in audit: removed a dead `overlayOpen` const in `renderer/main.ts`.)*
