# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## What this is

**Notes & Codes** — a Windows-first Electron + TypeScript + Monaco desktop scratchpad
(Notepad-simple, code-editor-powerful). The released version is defined in `package.json` and
documented in `CHANGELOG.md`; the app is **MIT-licensed** (`LICENSE`;
the bundled JetBrains Mono / Fira Code / IBM Plex Mono fonts are SIL OFL 1.1 — see
`THIRD_PARTY_NOTICES.md`). See `README.md` for the user-facing feature list, `ROADMAP.md` for what's next, and
**`AUDIT-CHECKLIST.md`** — the record of the two consolidated codebase audits, now **fully resolved**
(every finding fixed *and* both outstanding manual checks carried out, 2026-07-25; the flow was
"audit the audit" — verify each finding against the code before fixing). **`AUDIT-CHECKLIST.md` is
tracked and public**, unlike this file and `docs/superpowers/` — README links to it as the audit
record, so removing it from git would 404 that link.

## Commands

- `npm run dev` — run in development (electron-vite, HMR).
- `npm run build` — type-check (`tsc --noEmit`) **then** compile main/preload/renderer to `out/`. **This is the primary gate** for any change — the `tsc` pass genuinely catches IPC/type breakage (electron-vite/esbuild alone does *not* type-check).
- `npm run typecheck` — `tsc --noEmit` only (the first half of `build`); fast type-only check without emitting.
- `npm test` — unit tests (Vitest, `tests/unit/`, node env).
- `npm test -- <name>` — run one test file by filename substring, e.g. `npm test -- bufferManager`.
- `npm run test:smoke` — Playwright Electron smoke tests (`tests/smoke/`). **Requires `npm run build` first** — they launch the built app from `out/main/index.js`. They run a real Electron window on a Windows desktop. **If an agent shell has `ELECTRON_RUN_AS_NODE=1` set, every one of these fails with a bare `Error: Process failed to launch!`** — that makes `electron.exe` run as plain Node, so no window is ever created. It looks like a broken suite and isn't. Clear it in the same command: `Remove-Item env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue; npx playwright test …` (shell state doesn't persist between calls, so re-do it every time). Note the config carries `retries: 2` for genuine Monaco cold-render jitter — running with `--retries=0` will surface those flakes as failures.
- `npm run package` — build the NSIS installer + portable exe into `dist/`. **Requires Windows Developer Mode ON** (or an elevated shell) — electron-builder extracts winCodeSign symlinks which need the symlink-creation privilege; without it packaging fails (the unpacked app still builds to `dist/win-unpacked/`).
- `npm run make-icon` — regenerate `build/icon.ico` + `src/main/trayImage.ts` from the
  committed brand pack in `assets/branding/notes-and-codes-logo/`: **composes** the `.ico`
  per size (see "Icons are theme-aware" below) and embeds **both** 32px tray glyphs (dark-bg +
  light-bg), padded to square, as base64. Both outputs are committed — regenerate and commit
  them together, and never hand-edit `trayImage.ts`. The script is **deterministic**: re-running
  it must leave `git status` clean, and `tests/unit/appIcon.test.ts` guards the committed
  artifacts against going stale. The tray picks a glyph by the Windows taskbar theme at runtime
  (see `tray.ts`).

## Architecture (the big picture)

**Two Electron processes, talking over a narrow typed IPC bridge.** Read these together
to understand the system: `src/main/index.ts`, `src/main/ipc.ts`, `src/preload/index.ts`,
`src/shared/types.ts`, `src/renderer/main.ts`.

- **Security boundary is load-bearing.** `contextIsolation:true`, `nodeIntegration:false`,
  `sandbox:true`. The renderer reaches the OS **only** through `window.api` (the preload
  `contextBridge`). Never import `node:*`/`electron`/`fs`/`Buffer` in a `src/renderer/`
  file — the sandboxed renderer can't use them. All disk/OS work lives in `src/main/`.
  (Example: encoding's `Buffer` logic is `src/main/encoding.ts`; the renderer imports only
  the `Encoding` *type* from `shared/types`.) The boundary runs **both ways**: `src/main/`
  must not import from `src/renderer/` either — cross-process constants live in `src/shared/`
  (e.g. `THEME_LIST` in `shared/themes.ts`, `ACCENT_PALETTE` in `shared/types.ts`).
- **Adding an IPC call** means three consistent edits: a method on the `Api` interface
  (`shared/types.ts`), the bridge in `preload/index.ts`, and a handler in `main/ipc.ts`. The
  channel string must match across all three or it silently breaks. **Register through the local
  `handle`/`on` wrappers inside `registerIpc`, not raw `ipcMain.handle`/`.on`** — the wrappers
  reject any sender that isn't the app window's own main frame (`senderGuard.ts`); a raw
  registration silently bypasses that guard.
- **Main-side stores** (`sessionStore`, `settingsStore`, `clipboardHistoryStore`,
  `snippetStore`, `recentFilesStore`, `recentFoldersStore`, `fileHistoryStore`, `highlightStore`,
  `spellDictionaryStore`) all follow the same pattern: constructor takes a `baseDir`
  (`app.getPath('userData')`), `load()` is **corrupt-safe**
  (never throws — returns the default/`[]` and filters malformed entries), and `save()` is
  **crash-safe** — write through `atomicWrite` (`src/main/atomicWrite.ts`: unique temp file +
  `fs.rename`, temp cleaned up on failure — **deliberately no `fsync`**; it stalled writes for
  seconds on Windows for a marginal, rare-on-NTFS gain, see AUDIT-CHECKLIST L3), never
  `fs.writeFile` straight to the target. Match this pattern for any new store.
- **Renderer pure-logic vs DOM modules.** Pure logic (`bufferManager`, `pasteHistory`,
  `snippets`, `findInFilesModel`, `shared/encoding`/`language`/`searchText`) takes injected
  dependencies (e.g. an id factory) and is **unit-tested**. DOM/Monaco modules (`editorPane`,
  `splitView`, `tabBar`, pickers, manager, toolbar, statusBar, `findInFiles`) are
  **smoke-tested**. Keep that split.
- **Offline spell check.** Spell checking applies only to plain text and Markdown, runs in a
  renderer worker using bundled dictionaries, and persists personal words through typed IPC.
  Context actions that arrive asynchronously must revalidate the Monaco model URI, version, range,
  and current word slice before editing. Spell ranges use UTF-16 half-open `[start, end)` offsets.
- **Find in Files searches two sources, and the matcher is shared for a reason (v1.15.0).**
  `searchText()` lives in **`src/shared/`** because *both* processes match: `main/searchService.ts`
  over files on disk, `renderer/findInFilesModel.ts` over open buffers. One implementation is what
  makes disk results and buffer results incapable of disagreeing — don't fork it. The renderer
  searches **every** open buffer and sends their paths as `skipPaths`; main searches the folder
  **minus** those paths. That single rule covers *both* staleness (a dirty buffer differs from its
  disk copy) and duplication (nothing is searched twice) — changing one half without the other
  re-introduces both bugs at once. Reads go through `detectEncoding`+`decode`, never
  `toString('utf8')`: a UTF-16 file read as UTF-8 is mojibake that silently never matches. The
  query is **escaped** before it reaches `new RegExp`, so the pattern is always a literal and cannot
  backtrack catastrophically over 20k files — that property is why regex search is deferred rather
  than added. Path comparisons on both sides are case-folded (Windows); they are still exact-string
  otherwise, so a relative `filePath` from argv can double-list a file (known, parked).
- **`commands.ts` is the single command registry.** All palette commands are registered in
  `registerCommands(deps)`; `main.ts` builds the `deps` (managers/views/handlers) and calls
  it once. Add new commands there — don't scatter `palette.register` calls. **When you add a
  palette command or a menu accelerator, also add its entry to `src/renderer/helpContent.ts`**
  so the in-app Help reference (Help ▸ Keyboard Shortcuts) stays in sync — it's a curated
  static list, not auto-derived.
- **Lifecycle (tray app).** Since 1.0 the window **X hides to the system tray** (does NOT
  quit) — this is intentional, not a bug. Real quit is gated by an `isQuitting` flag set by
  the tray Quit menu / `Ctrl+Q` / `before-quit`; `window-all-closed` deliberately does not
  quit on Windows. A global hotkey (`Ctrl+Shift+Space`, from `Settings.globalHotkey`)
  toggles show/hide; if registration **fails** (another app/instance already holds it) the app
  **must not block** — it degrades to a non-blocking toast via the one-way `app:notify` IPC, never
  a modal. (A blocking `dialog.showErrorBox` here used to freeze startup + every second-instance
  smoke test — see `notifyRenderer` in `src/main/index.ts`.) See `src/main/index.ts` +
  `src/main/tray.ts`.
- **Icons are theme-aware, and `icon.ico` is composed per size (Phase 3.7).** The taskbar
  button, Alt+Tab, Explorer and the desktop shortcut all render the exe/shortcut **identity
  icon** (`build/icon.ico`) — *not* `win.setIcon`. So the full `{N&C}` mark, illegible below
  ~48px, had to go: `icon.ico` now carries `{&}` on the same dark `#1B1D21` tile (20% radius)
  at **16/24/32** and the `{N&C}` tile at **48/256**. **16px drops the braces entirely** — at
  that size three shapes turn to mush, and per-size simplification is the Windows-native
  pattern. Keeping the tile (rather than a bare transparent glyph) is deliberate: the identity
  icon is static, so it must stay legible on white Explorer backgrounds *and* dark taskbars,
  and the tile is what buys both. The ladder lives in the pure `scripts/iconLadder.mjs`; the
  `.ico` bytes come from the pure `scripts/icoWriter.mjs` (PNG payloads — an uncompressed-BMP
  writer bloats the file 14×). The **live** small icons — system tray plus window button — still
  use the `{&}` glyph and swap bright/dark against the Windows **taskbar** theme
  (`SystemUsesLightTheme`, `src/main/themeIcon.ts`), re-applied on `nativeTheme` `'updated'`.
- **`setAppUserModelId` must match `appId` in `electron-builder.yml`** (`com.notesandcodes.app`,
  set in `index.ts` before any window exists). electron-builder stamps that AUMID onto the
  installed shortcut; if the process declares a different one, Windows treats shortcut and
  window as two apps and a pinned entry keeps a stale icon.
- **Shell-integration registry writes go through `buildContextMenuPlan`** (`src/main/contextMenu.ts`,
  pure + unit-tested). The Explorer verb needs three values — label, `command`, and `Icon` — and
  the `Icon` write goes **last** so a cosmetic failure still leaves a working menu entry.
  `setContextMenu` is re-applied on **packaged** startup (`index.ts`), which is how existing users
  pick up new registry values without re-toggling the setting; that re-apply **must** stay gated on
  `app.isPackaged`, or a dev run would rewrite the user's real entry to point at `electron.exe`.
  Never write a test that invokes it, spawns `reg`, or asserts against `HKCU` — that would mutate
  the developer's own shell integration.

## Project-specific conventions (easy to get wrong)

Renderer-only visual/DOM conventions (overlays, theming, motion, accent tokens, sidebar and tab
chrome, the pen-cursor CSP) live alongside their renderer modules and styles. The cross-cutting
rules below stay here because they span processes.

- **One owner per key binding — and NEVER `editor.addCommand` from a per-pane constructor.**
  Monaco's dynamic keybindings are **global**: `editor.addCommand` has no `when` scoping it to the
  editor it was called on, and `SplitView` constructs **both** panes up front. So a per-pane
  registration binds the chord twice and the *last* one (hidden paneB, empty model) wins — which is
  how `Shift+Alt+F` was silently dead from v1.6 to v1.14.1. It also killed the menu accelerator,
  because Electron only fires those for **unhandled** keys and Monaco `preventDefault`s anything it
  matched. Register app-wide **once** (see `registerFormatKeybinding` in `editorPane.ts`) and route
  to `paneFor(view.focusedPane())`. Equally: a chord belongs to exactly one mechanism — the
  renderer's window `keydown` handler (`Ctrl+Shift+P`/`Ctrl+P`/`Ctrl+Shift+F`) **or** a menu
  accelerator, never both. `Find`, `Replace` and `Find in Files` menu items deliberately carry no
  accelerator for this reason. Note Monaco's own `Shift+Alt+F` is *not* inert — the bundled
  ts/css/html/json workers satisfy its `hasDocumentFormattingProvider` precondition, so dropping
  our binding hands those languages to the TypeScript formatter instead of prettier.
- **No native `prompt()`/`alert()`/`confirm()`.** Use the themed `promptInput()` overlay
  (`inputOverlay.ts`) and `toast()` (`notify.ts`).
- **File-arg detection** (`fileArgFrom` → pure `pickFileArg` in `src/main/fileArg.ts`) uses
  `app.isPackaged` to skip the entry-script arg in dev vs packaged, and existence-checks the candidate.
- **One shared colour palette (Phase 3.5 P4).** `ACCENT_PALETTE` (name+hex, `shared/types.ts`) is
  the single source: `ACCENT_SWATCHES` (`renderer/themes.ts`) re-exports it, `HIGHLIGHT_COLOURS`
  mirrors its lowercased names, and `HL_HEX` (also `shared/types.ts` — used by both `toolbar.ts` and
  `penCursor.ts`) derives from it (`tests/unit/palette.test.ts` guards alignment). To add/change a
  colour, edit `ACCENT_PALETTE` **and** the matching
  `.hl-<name>{background:<hex>59}` rule in `index.html` (the `.hl-*` fills are the one hand-mirrored
  copy — hex + `59` ≈ 35% alpha) — **and the column count in `.appearance-sw`**, which is
  `repeat(9,22px)` so the 18 swatches fall into two equal rows; a 19th colour would leave a ragged
  one (smoke-guarded by `accent swatches fill two equal rows`). **Accent-text auto-contrast:** never hardcode text colour on an
  accent fill — `contrastText()` (`renderer/themes.ts`, YIQ) picks near-black/white so any accent
  stays legible.

## Testing notes

Use an isolated `--user-data-dir` for Electron smoke tests. `NC_HEADLESS` is test-only: it avoids
the OS global-hotkey conflict and enables explicitly guarded test seams. Test CSP changes and
main-to-renderer handoffs with a real two-process smoke flow, not a renderer-only approximation.

**A guard isn't trusted until it's been seen failing.** Every cross-cutting guard here was verified
by falsification before being believed — the pen-cursor CSP guard (tighten `img-src` → red); the
second-instance test (stub the handler's `send('open-file')` → red on the tab count, while the
visibility poll stays green, which is what proves the two assertions are independent); the
`Shift+Alt+F` guard (disable the app-level binding → red); and Find in Files' three (unescape the
query → `a.b` matches `axb`; read as UTF-8 → the UTF-16 fixture stops matching; empty `skipPaths` →
the stale disk copy becomes findable). Write the break, watch it go red, revert.

**Two failure modes that look exactly like coverage** — both shipped into plans here and were caught
only by attempting the falsification:
- **A guard that cannot fail.** Find in Files' original skip-set test opened no folder, so the search
  returned early and never reached the code the test claimed to guard. It was green for the wrong
  reason. Before writing a falsification step, trace whether the test actually *reaches* the code
  being broken.
- **Claimed coverage that isn't.** A task asserted `revealMatch` was "covered by the smoke test", but
  opening the file alone satisfied the assertion — the whole deliverable could be deleted with the
  suite still green. Any claim of the form "covered by X" must name the **specific assertion that
  would go red**.

Also: assertions that pass on a *transient* state are green-by-timing, not by construction. Anchor
on a completion-only signal first (e.g. `.fif-empty` renders only once a search has finished), then
assert the thing you care about.

## How work is done here

This repo is developed with the **superpowers** flow: brainstorm → spec
(`docs/superpowers/specs/`) → plan (`docs/superpowers/plans/`) → subagent-driven build on a
feature branch → per-task + whole-branch review → merge to `master`. Progress ledger lives
in `.superpowers/sdd/` (git-ignored scratch). Branch off `master` for new work; don't commit
features directly to `master`.

## Release bookkeeping — DO NOT SKIP

When work ships (a feature/fix lands on `master`) — ROADMAP tick, CHANGELOG entry, version bump,
tag, package — follow the available **`release-checklist` skill**.
Do not cut a release from memory; the bump-before-package and tag-before-package ordering rules
there exist because getting them wrong silently overwrites an already-published artifact.
