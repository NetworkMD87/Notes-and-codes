# Notes & Codes — Roadmap

---

Living checklist. Glance the emoji to see status; phases are ordered for flow with
**minimal backtracking**. Each item still gets a full design → plan → build pass
when picked up.

**Legend:** ✅ done · 🚧 in progress · ⬜ to do · 🔜 next up · ❓ decision needed ·
🧊 parked · 💡 maybe · effort: **S** small · **M** medium · **L** large

**Sequencing logic:** ① make it _trustworthy_ (safety/basics) → ② build a reusable
**theme/token system** and polish once (so every later surface inherits the look and
never needs re-polishing) → ③ answer the identity fork → ④ build the big features on
the styled base → ⑤ parked platform work. This avoids polishing twice and building
features twice.

---

## ▶ NEXT ACTION — Design the Microsoft Store / MSIX release

✅ **v1.18.1 shipped 2026-08-08 — Markdown dependency security and release-test reliability.**
Tagged and published as a GitHub release after validation of the installed build. PR #11 raised
DOMPurify to `3.4.13`, overrode linkify-it to `5.0.2`, and added a lockfile security guard. The npm
production graph remains audit-clean (`npm audit --omit=dev`: 0 vulnerabilities). The full audit
still reports the existing 20 development/build-graph findings; Electron supplies the packaged
runtime despite its `devDependencies` classification, so those Electron/toolchain advisories remain
separate compatibility-tested upgrade work rather than being described as closed. No automatic
`npm audit fix` was applied.

The release also carries PR #12's smoke-teardown reliability work: the Windows harness now owns and
closes every Electron process it launches, eliminating the earlier cleanup-only false red; normal app
usage was never affected. All 766 unit tests, typecheck/build, focused Markdown preview smoke, the
full normally configured 119-test smoke suite, Windows packaging, audit, diff, independent review,
PR-head CI, merge-commit CI, and release-preparation CI gates passed. The installed 1.18.1 build reported
the correct About version, rendered and sanitized Markdown preview, registered the configured global
hotkey, completed the close-to-tray/show cycle, and persisted launch-on-login across a relaunch before
restoring its original disabled state. Final installer and portable artifacts were rebuilt from the
tagged commit.

**v1.17.0 shipped 2026-08-07 — Fully offline spell checking + startup readiness fix.** Tagged
`v1.17.0` and published as a GitHub release (installer + portable). Plain-text and Markdown prose
now get bundled UK/US spell checking, Quick Fix suggestions, session ignores, and a personal
dictionary, with no network dependency. It also carries the `boot()` readiness fix that prevents
an early settings change being silently reverted on a slow startup. See **Phase 4.4** below.

**v1.18.0 shipped 2026-08-07 — Right-click spell corrections.** Tagged and published as a GitHub
release after owner testing of the installed build. Right-clicking a red-underlined word now opens up
to five offline replacements, **Ignore for this session**, **Add to personal dictionary**, and familiar
Undo/Redo/Cut/Copy/Paste/Select All/Command Palette actions. The clicked word and pane own the
correction even when the caret was elsewhere; correct words, code, excluded Markdown ranges, editor
chrome, and keyboard context-menu invocation remain Monaco-owned. `Ctrl+.` stays available. The same
release also fixes startup file requests being hidden behind a late blank Untitled tab. Its dependency
audit follow-up landed in PR #11 and is being released as v1.18.1, as recorded above.

**v1.14.0 shipped 2026-07-24** — tagged `v1.14.0` and published as a GitHub release (installer +
portable). It carried the first Phase 4 slice (**Settings home + launch-on-login + configurable
global hotkey**) and the entire **Phase 4.5 design-polish pass, slices 1–5** (tonal ladder, floating
chrome, interactive states, structural chrome, sidebar + tab file-type badges) — all under the one
`1.13.0 → 1.14.0` bump (polish-pass convention: one bump for the whole pass). The manual
tray / hotkey / launch-on-login checklist passed on the real build before tagging.

**v1.14.1 shipped 2026-07-25** — patch release: the `Shift+Alt+F` Format Document hotkey, dead since
v1.6, is fixed (two `EditorPane` instances were each registering the same *global* Monaco keybinding,
so the hidden empty pane always won and silently no-op'd — which also suppressed the Edit-menu
accelerator, since Electron only fires those for unhandled keys). Now registered once app-wide and
routed to the focused pane, with an end-to-end smoke guard verified by falsification and a real
keypress check on the packaged build. Also published `AUDIT-CHECKLIST.md` (README had linked to a
file that was gitignored and had never been committed) and closed its last two manual checks, H1 and
L4 — the audit record now has zero open items, code or manual.

**v1.15.0 shipped 2026-07-26** — **Find in Files**: content search across the open folder **and** open
tabs, on `Ctrl+Shift+F` / Edit menu / palette. Merged via PR #5, tagged `v1.15.0`, GitHub release live
with installer + portable. Closes the "content search in quick-open" deferred
item from folder mode, though it landed as its own overlay rather than a quick-open mode: quick-open's
row is name + path, which fights line numbers and snippets. A dirty buffer is searched from its live
content and its path is sent to main as a skip-set, so one rule covers both staleness and duplication.
See **Phase 3.6** below. _Manual eyeball passed on the packaged 1.15.0 build (2026-07-26)._

**v1.16.0 shipped 2026-07-26 — Sidebar folder panel + recent folders + an Appearance tidy-up.**
Tagged `v1.16.0` at `3e08f4d` and published as a GitHub release (installer + portable, both built
from the tagged commit). The manual tray / hotkey / launch-on-login checklist passed on the real
build before tagging. The sidebar edge tab is now always visible; with no folder open it offers a folder
panel (**Open Folder…** + up to 10 recent folders, pruned on click if one has gone) and the sidebar
header becomes a click-to-switch folder control carrying the same recents. `Toggle Sidebar` no
longer warns you need a folder open (PR #6). See **Phase 3.6** below.

Three follow-ups landed on `master` the same day, all owner-driven from using the build:
- ✅ **Header `◐` theme button removed** — it and the toolbar gear were wired to the same call
  (`openSettings('appearance')`, the gear's default category), sitting side by side. Five entry
  points to Appearance remain, so only the element and its `onclick` went.
- ✅ **Appearance hover live-preview removed** — painting an uncommitted theme meant every chrome
  var plus `setTheme` on both Monaco panes, on hover-in and again on grid-leave; a passing cursor
  read as a rendering bug. `ThemeController.preview`/`endPreview` are gone and `apply()` is now
  `paint()`'s only caller, so nothing can paint a theme that hasn't been committed. The old hover
  test is replaced by its inverse (hover changes nothing), falsified before being trusted.
- ✅ **Accent swatch grid + heading spacing** — the 18 swatches were a wrapping flex row that split
  differently with panel width; now a fixed 9-column grid (two equal rows), guarded by a smoke test
  asserting the count divides evenly by the track count rather than restating either number. The
  **Accent** heading gained an 18px top margin — Theme and Accent share one wrapper, so neither got
  `.settings-detail`'s child gap and the heading sat flush against the last theme row.

**Two correctness fixes that landed on `master` after v1.14.0** — both rode v1.14.1:
- ✅ **`overlayManager` registration-overwrite sweep** — the audit of this turned out **wider and
  worse** than the note claimed. Not 4 files but **9** (`commandPalette`, `quickOpen`, `helpOverlay`,
  `snippetManager`, `fileHistoryPanel`, `diffView`, `diffPicker`, `pasteHistoryPicker`,
  `snippetPicker`), and the leak was not "one eaten Escape" but **permanent**: `close()` unhooks via
  the unregister fn the re-entrant `open()` already overwrote, so the orphan can never be removed and
  sinks *every* later Escape for the rest of the session. Fixed structurally rather than by pasting a
  guard into 9 files — the slot now lives in an `OverlayRegistration` class (`overlayManager.ts`)
  whose `open()` releases before it re-registers, so double-registration is impossible by
  construction; all 10 overlays (incl. `settingsPanel`, whose hand-rolled guard this replaces) hold
  one. Unit-tested (4 cases) + a smoke guard asserting Monaco's find widget still closes on Escape
  after a re-entrant open — **falsified by hand** (drop the release → red on both).
- ✅ **`app.isPackaged` gate on the context-menu toggle** — Settings ▸ Integration's checkbox now
  routes through `applyContextMenu`, gated like `setLoginItem` and the packaged-startup re-apply.
  Both directions were destructive in dev, not just enable: a dev-run *disable* ran `reg delete` and
  removed the developer's real installed entry outright. Decision extracted to a pure, DI'd
  `contextMenuAction(enabled, isPackaged)` (4 unit cases) so it's covered without any test touching
  `HKCU`.

**Open, none blocking a release** — candidates for the next pass:
- 🔜 **Microsoft Store release via MSIX** (Phase 4) — the chosen next platform move. A free
  individual account plus Microsoft's automatic re-signing of MSIX packages kills the SmartScreen
  warning on the Store channel at zero cost, which retires the parked "buy a cert" item. Needs a
  proper design pass first: MSIX virtualises the registry, so the Explorer context menu and
  launch-on-login would **silently no-op** in a Store build. Full detail under Phase 4.
- The parked Phase 4 items: native Win11 `IExplorerCommand` **"Open with"**, **snippet placeholders
  / tabstops**, and a purchased code-signing cert (now only relevant to the direct-download channel).
- **CI covers build + unit only.** The Playwright smoke suite is dispatch-only: GitHub-hosted
  runners don't reliably paint Monaco's viewport, so every test asserting on rendered editor
  content fails there regardless of timeout. Revisit with software rendering
  (`--use-gl=swiftshader` / `--disable-gpu`) on the Electron launch args.
  Note the Shift+Alt+F fix proved a related assumption wrong: a Playwright key press *does* reach a
  real Monaco keybinding, so keyboard paths previously written off as untestable are worth retrying
  before being deferred.

---

## ✅ Shipped — v1.0.0

- ✅ Tabs · full/split panes (draggable, per-pane line numbers) · word wrap
- ✅ Light / dark / follow-OS theme
- ✅ Session auto-save + crash recovery
- ✅ Diffs: tab-vs-tab · current-vs-clipboard · file-vs-file
- ✅ Live markdown preview · UTF-8/UTF-16 encoding · LF/CRLF
- ✅ Paste history · full snippets manager
- ✅ Command palette · header toolbar · status bar
- ✅ System tray · global summon hotkey · always-on-top
- ✅ Windows "Open with" · single-instance file routing
- ✅ App icon · README · installer + portable

---

## ✅ Phase 1 — Safety & basics (shipped v1.0.1)

- ✅ **Close-last-tab → hide to tray** — closing the only tab hides to tray + leaves a fresh **Untitled-1** (climbing-number bug fixed).
- ✅ **"Save changes?" prompt on quit** — native Save / Don't Save / Cancel for **any** unsaved tab (named + untitled); single-fire on Ctrl+Q; resilient (always quittable). _(untitled coverage + double-fire fixed in v1.0.2)_
- ✅ **Drag & drop files to open**.
- ✅ **Open Recent** — persisted recent-files list, in the File menu.
- ✅ **Detect external file changes** — watch open files; clean → silent reload, dirty → non-blocking bar (never clobbers edits).
- ✅ **Save All**.
- ✅ **Zoom** — `Ctrl +/-/0` and `Ctrl+scroll`, persisted.
- ✅ **Native menu bar** — File / Edit / View / Tools / Help (dispatches to existing commands; Edit uses native roles).

**Fast-follow (deferred from Phase 1):**

- ✅ **On-save overwrite warning** (**S**) — **shipped v1.12.3 (2026-07-18).** Save compares the
  file's on-disk mtime against the baseline the buffer has carried since it was opened (persisted
  through session, so it survives a restart) and warns before overwriting. Covers what the change bar
  can't: the app being restarted, a failed watcher, or a last-second change. Autosave skips the write
  and queues the buffer into the change bar instead of prompting. **This was Phase 1's last open
  item — Phase 1 is now COMPLETE.**

## ✅ Phase 2 — Look & Feel (shipped v1.1)

- ✅ **Theme/design-token system** — 14 chrome CSS-variable tokens + shape tokens, single-source `themes.ts`; all chrome reads tokens.
- ✅ **8 cohesive themes + accent** — Light, Dark, Dark Dimmed, Solarized Dark/Light, One Dark, Monokai, High-Contrast (+ Follow-OS); per-theme accent + curated swatch override.
- ✅ **Tab styling** — hairline borders, accent active top-border, hover.
- ✅ **Font options** — bundled JetBrains Mono + Fira Code (+ system fonts + custom), size, ligatures; in the Appearance panel; persisted.
- ✅ **UI polish** — Appearance panel (theme/accent/font), overlay depth/shadows, header divider, tokenized chrome.

**Polish follow-ups (deferred, minor):**

- ✅ Status-bar secondary-text dimming via `--muted` (delivered by Phase 3.5 P1 — the status bar is now quiet `--panel-bg` chrome with `--muted` secondary text and a `--border` top rule, no longer an accent slab; a dirty buffer's `● unsaved` is the one accent touch).
- ✅ Accent-text auto-contrast (delivered Phase 3.5 P4) — `contrastText()` (YIQ brightness) derives near-black/white text per accent, so light accents (e.g. the new Yellow preset, or any custom colour) stay legible instead of white-on-light.

## ✅ Decision — Identity fork (resolved: **Hybrid**)

- ✅ **Hybrid (Option C).** Stay a fast scratchpad **by default**; add an **optional, toggleable** folder sidebar (file tree) + `Ctrl+P` quick-open for project work. Lightweight by default, powerful on demand — the folder mode never gets in the way and can be toggled off. The folder/tree/quick-open item is **activated** in Phase 3 (built as an opt-in mode, not always-on chrome).

## ✅ Phase 3 — Power features (shipped v1.2–v1.7)

_The big, on-brand features — built on the Phase-2 styled base, so only their structural layout is new (colors/spacing inherited)._

> ▶ **STATUS (updated 2026-07-26):** all Phase 3 power features shipped (file history, Markdown export,
> autosave-to-disk, Format Document, folder mode, text highlighter); the Phase 3.5 design-polish pass
> shipped as v1.12.0; the v1.12.0 codebase audit is fully closed (Phase 1 → v1.12.1, Phases 2–5 →
> v1.12.2). **Phase 3.7 polish is complete — all 7 slices merged, released as v1.13.0**, tagged and
> published. See ▶ NEXT ACTION at the top.
> **Live known issues (deferred), all small:** ①② from Find in Files (v1.15.0), ③ a boot-ordering
> race surfaced 2026-07-26.
> ① launching the exe from a shell with a **relative** path arg can double-list that file in search
> results — `pickFileArg` returns the raw argv string, so its `filePath` never matches the absolute
> path `walkFiles` produces, and neither the skip-set nor the merge de-dupes it. Pre-existing to the
> search feature; a proper fix changes `pickFileArg`'s contract and breaks `fileArg.test.ts`.
> Explorer / taskbar / file-association launches are unaffected. ② flipping the match-case or
> whole-word toggles doesn't reset the selected result row (changing the query text does).
> ③ ~~**`boot()` can silently revert a user action that lands before it finishes.**~~
> **RESOLVED 2026-07-26.** `boot()` unconditionally re-applies persisted settings
> (`settings.alwaysOnTop`, `fontSize`, …), but the readiness signal in use was `#tabbar` — **static
> HTML in `index.html`**, painted long before `boot()` resolves. So an action could land first and
> boot would overwrite it. This hit a real user on a slow start (large session restore, slow disk,
> folder restore), not just tests. **Fixed** by `markBooted()` (`src/renderer/main.ts`), which stamps
> `body[data-booted]` at the end of boot **and** in the `boot().catch` fallback — both paths that
> leave a usable window, but deliberately *not* the preload-bridge failure path, where a waiting
> caller should time out rather than act on a dead window. Smoke tests that mutate boot-owned state
> now wait on `waitForBoot()` (`tests/smoke/appReady.ts`); `#tabbar` stays fine for read-only tests,
> so the suite was not swept wholesale.
>
> The original diagnosis could not force the race on an idle machine (40 samples, no `true→false`
> transition), so it was **made deterministic instead**: injecting a 1.5s delay into `boot()` turned
> `app.spec.ts` (snippets / always-on-top) **red at the `isAlwaysOnTop()` assertion every time**.
> With the same delay still injected, re-anchoring on `data-booted` turned it green — same
> conditions, only the anchor changed, which is what makes this a fix rather than a hope. Refuted
> earlier with evidence, so don't re-check these: wrong command dispatched; 100ms read too short;
> `setAlwaysOnTop` broken in this environment; hidden/minimized window losing topmost.
> _(① the native `Shift+Alt+F` Format hotkey is resolved — fixed 2026-07-25, details under
> **Format Document** below. ② the clean-quit clipboard/session flush is resolved — audit R1, v1.12.1. ③ the static
> exe/installer icon not theme-swapping is resolved by design as of v1.13.0 — it carries the `{&}`
> glyph on the contrast-safe dark `#1B1D21` tile at 16/24/32, legible on light and dark taskbars
> alike, so there is no swap to want.)_

- ✅ **Local file history / timeline** (shipped v1.2) — per saved file: snapshots on save + every 5 min (deduped, 50/file), browse/**diff/restore** in a File History panel (palette + Tools menu). _Deferred: prune orphaned history for deleted/renamed files; a status-bar entry; restore confirmation._
- ✅ **Markdown export** (shipped v1.4) — export the active tab (rendered as Markdown) to a standalone **HTML** file or **PDF** via File ▸ Export or the palette; clean light document style, self-contained (no CDN). _Deferred: relative-image embedding, custom page size/margins, batch export, code syntax highlighting._
- ✅ **Optional autosave-to-disk** (shipped v1.5) — opt-in autosave for **named** files: debounced after you stop typing (~1.5s) + flushed on focus loss (window blur / hide / tab switch); off by default (toggle in Appearance ▸ Editor or the palette). Skips untitled buffers and unresolved external-change conflicts; no history snapshot per autosave. Whole-branch reviewed; manual focus-loss / cursor-jump checklist passed on the 1.5.0 installer. _Deferred: autosaving untitled buffers, per-file opt-out, configurable delay._
- ✅ **Format Document** (shipped v1.6) — prettify the active buffer (prettier standalone, lazy-loaded) for JS/TS, JSON, CSS/SCSS/LESS, HTML, Markdown, YAML; palette + Edit menu + Format Selection; optional manual-save-only format-on-save. Code-complete + whole-branch reviewed on `feat/format-document` (1 Important found + fixed: stale-text overwrite guard). Smoke-verified: palette reformat, Format Selection, format-on-save + toggle persist, unsupported-language no-op + toast, syntax-error buffer-untouched + toast, Edit-menu items + `Shift+Alt+F` accelerator registered. Manual test passed: Edit-menu reformat, no cursor/scroll jump.
  - ✅ **Fixed: the native `Shift+Alt+F` hotkey (v1.14.1, 2026-07-25).** Manually verified on the packaged build — JS/JSON/CSS all reformat via prettier on a real keypress, plaintext still toasts. Root cause was neither hypothesis on the old list: Monaco's dynamic keybindings are **global** (`editor.addCommand` has no `when` scoping it to one editor), and `SplitView` constructs both panes up front — so `EditorPane`'s per-pane registration bound the chord twice and the **last** one (hidden paneB, empty model) always won, returning at `!text.trim()`. That also killed the Edit-menu accelerator, because matching a binding makes Monaco `preventDefault`+`stopPropagation` the key and Electron only fires menu accelerators for **unhandled** keys. Fix: one app-level `registerFormatKeybinding()` routed to the focused pane. The earlier attempt failed because it targeted Monaco's built-in — which was never the winner. Note the built-in is *not* inert: the bundled ts/css/html/json workers satisfy its `hasDocumentFormattingProvider` precondition, so simply deleting our binding hands js/ts/css/html/json to the **TypeScript** formatter instead of prettier. Contrary to the old note this **is** smoke-testable — a Playwright key press does reach the real binding, so `format-manual.spec.ts` now guards it end-to-end (verified by falsification), asserting prettier's semicolon to also catch the built-in taking the chord back.
    _Deferred: configurable options UI, more languages, `.prettierrc` discovery._
- ✅ **Folder mode: sidebar file-tree + quick-open** (shipped v1.3) — opt-in "Open Folder" → toggleable, resizable left sidebar tree (lazy-loaded) + basic file ops (New File/Folder, Rename, Delete→Recycle Bin) + `Ctrl+P` quick-open; `.git`/`node_modules` hidden by default (Show-all toggle); startup-restore of the last folder. Scratchpad stays the default with no folder open. _Deferred: drag-to-move, cut/copy/paste, multi-root, `.gitignore` awareness. (Content search shipped separately as **Find in Files** — Phase 3.6 — on its own overlay rather than inside quick-open.)_
- ✅ **Text highlighter / pen** (shipped v1.7; **swatches 7 → 18** with the shared palette in v1.12.0, **chisel-marker cursor + matching button icon** in Phase 3.7) — toolbar toggle + swatch dropdown over the full `ACCENT_PALETTE` with a **Clear highlights** action; the button underline shows the active colour, and in paint mode the mouse cursor is a marker whose tip carries it. With the mode on, drag-select paints a persistent semi-transparent highlight (Monaco decorations), re-stroking the same colour erases, dragging a different colour recolours; also a **Clear Highlights** palette command. Persists **per file on disk** (path-keyed store in `userData`), untitled buffers via the session (migrated on Save-As); highlights ride edits (decoration read-back), clamp on reload, and flush on tab close / quit. Pure interval engine + store are unit-tested; paint / clear / persistence are smoke-tested (incl. relaunch). Code-complete + whole-branch reviewed on `feat/text-highlighter`. _Deferred: external-edit re-anchoring, highlights list panel, carrying highlights into HTML/PDF export, a free custom colour picker, an Edit-menu item, keyboard-only painting. (Multi-part select → copy/paste is already native in Monaco — `Alt+Click` / `Ctrl+D`.)_

## ✅ Phase 3.5 — Design polish pass (P1–P5 complete, merged to master; v1.12.0)

_Holistic "does it feel as premium as it can?" pass. Deliberately sequenced **after** the
Phase 3 structural features so every surface is polished **once** — the token system already gives new
surfaces the right colours; this pass tuned what tokens don't fix: spacing, density, type scale,
hierarchy, micro-motion._

- ✅ **Appearance panel: interface font + landscape layout** (v1.10.0) — a separate, opt-in **Interface
  font** for app chrome (default **System**), distinct from the editor code font; panel re-laid
  landscape (theme list left; accent / font / editor / folder right) with a narrow-window wrap fallback.
- ✅ **Whole-app visual critique + targeted upgrade** (**M**, P1–P3) — reviewed the real surfaces (tabs,
  toolbar, status bar, panels, overlays, empty states) and refined through the token system:
  de-loudified status bar; stacked command palette + themed focus; a reusable token-driven micro-motion
  layer (`overlayIn` entry + `prefers-reduced-motion` kill-switch that later polish inherits); accent
  borders on all floating chrome; one unified container-agnostic scrollbar; shared `overlayManager`
  (capture-phase Esc closes the topmost overlay); `accent-color` checkboxes; icon-only `◐` theme button
  (_removed in v1.16.0 — redundant once the Settings gear landed beside it_);
  highlighter `crosshair`; inline-SVG empty-state glyphs. _Slice C/D leftovers (theme-picker swatch
  previews, highlighter pen-tip SVG cursor) are gathered into **Phase 3.7** below._
- ✅ **User polish notes (P1 eyeball, 2026-07-03)** — all delivered: accent border on every toast +
  pop-out menu (P2, + snippet-manager theming); one unified scrollbar (P2); use accent more boldly but
  tasteful (P2 borders → P3 accent surfaces → P4 accent-text auto-contrast → P5 expanded range).
- ✅ **Phase-2 token tweaks folded in** — status-bar `--muted` dimming (P1) + accent-text auto-contrast
  (P4, `contrastText()` YIQ).
- ✅ **More accent colours** (**S**, P4) — `ACCENT_SWATCHES` 6 → **18** curated accents spanning the
  wheel (+ a neutral Slate). A native `<input type=color>` picker was tried but **dropped per user
  preference** (fiddly / dismissed on click) — curated presets only.
- ✅ **More bundled themes + fonts** (**S**, P5) — **5 new themes** (8 → 13): Nord, Dracula, Gruvbox
  Dark/Light, Tokyo Night; bundled **IBM Plex Mono** (3rd editor font) + surfaced system font options.

**Phase 3.5 is COMPLETE (P1–P5), SHIPPED as v1.12.0** — packaged, manual tray/hotkey checklist PASSED,
tagged, pushed, GitHub release live.

## ✅ Phase 3.6 — Quality-of-life & UX (complete)

_Small functional niceties, not visual polish, so they sit outside the 3.5 design pass.
Neither depends on 3.5 — they can land before, during, or after it._

- ✅ **Drag-to-reorder tabs** (shipped v1.11.0) — HTML5
  native drag in `tabBar.ts` with an accent insertion mark; `BufferManager.move()` reorders the
  buffer array; new order persists via the existing session serialization (survives restart).
  Unit-tested (`move`, 146/146) + smoke-tested (drag + relaunch + close-×/`+` regression);
  whole-branch reviewed on `feat/drag-reorder-tabs` (opus: ready to merge, no Critical/Important);
  eyeballed on the installed build (drag feel + insertion mark + persist + tray/hotkey checklist — PASS).
  Merged `--no-ff` → `master`, tagged `v1.11.0`. _Deferred: live-shift/FLIP animation of neighbouring
  tabs (Phase 3.5 polish)._
- ✅ **Real two-process second-instance smoke test** (**S**) — shipped 2026-07-20. The synthetic
  `app.emit('second-instance', ...)` in `startup-window.spec.ts` is **replaced** (not supplemented —
  the real test is a strict superset) by one that `spawn`s a genuine second Electron process with a
  file arg against the same `--user-data-dir`. Asserts the second process exits cleanly rather than
  opening a rival window, the hidden window becomes visible, and the forwarded file lands in a
  second tab with its content — so the real single-instance lock, argv forwarding, `pickFileArg`
  and the `open-file` IPC are all covered. Falsified by hand (dropping the handler's
  `send('open-file')` turns it red on the tab count) — the same falsification convention as the
  pen-cursor CSP guard.
- ✅ **Find in Files — content search** (**M**, v1.15.0, PR #5) — `Ctrl+Shift+F` / Edit menu /
  palette opens a dedicated overlay searching the open folder **and** every open tab; results group
  by file with line numbers + preview and a file-type badge, Enter opens the file, selects the match
  and seeds Monaco's find widget so `F3` walks the rest. Substring matching with match-case and
  whole-word toggles — **no user-supplied regex**, so an escaped literal pattern cannot backtrack
  catastrophically over 20k files. The matcher is one pure module in `src/shared/` used by **both**
  processes, which is what makes disk results and open-buffer results incapable of disagreeing; a
  dirty buffer is searched live and its path goes to main as a skip-set, so one rule covers staleness
  *and* duplication. Reads through the existing `detectEncoding`/`decode` (a UTF-16 file read as
  UTF-8 is mojibake that silently never matches). Caps stop the walk at 20/file and 1000 total;
  cancellation is a main-owned generation counter. Three guards falsified by hand (query escaping,
  UTF-16 decoding, the skip-set). 7 task reviews + a whole-branch review + one fix wave; the reviews
  found **7 defects in the plan itself**, including two tests that could not have failed.
  _Deferred: regex, replace-across-files, include/exclude globs, streaming results._
- ✅ **Sidebar folder panel + recent folders** (**S**, shipped v1.16.0, merged via PR #6;
  eyeballed on the packaged build, tagged and released 2026-07-26) — the
  sidebar edge tab is now always visible, no longer gated on a folder being open. With none open it
  shows a folder panel with an **Open Folder…** button and a recent-folders list (up to 10,
  case-folded dedupe, mirroring `RecentFilesStore`); the sidebar header doubles as a click-to-switch
  folder control offering the same recents plus Open Folder… / Close Folder. A recent folder that's
  been deleted or moved is pruned from the list the moment you click it, with a toast, instead of
  failing silently — one `chooseRecent` path shared by the panel and the header switcher so the two
  surfaces can't disagree about a dead entry. **Toggle Sidebar** no longer warns that you need a
  folder open first; it shows the panel instead.
- ✅ **Fully offline spell checker** (**L**, complete for v1.17.0) — checks prose in plain-text and
  Markdown buffers with bundled English (UK/US) dictionaries, subtle Monaco decorations, public
  Quick Fix replacements, session ignores, and an atomically persisted personal dictionary.
  Settings provides an on/off toggle, Follow Windows / UK / US selection, and dictionary manager;
  code buffers plus Markdown code, links, HTML, paths, and technical syntax stay out of scope. One
  worker handles debounced newest-only batches with stale-result guards and bounded crash recovery.
  The built worker is statically checked for network capabilities and the Electron workflow is
  smoke-tested with HTTP/HTTPS blocked before renderer navigation.
- ✅ **Right-click spell corrections** (**S–M**, shipped in v1.18.0) — a pointer right-click on the
  exact red-underlined word offers
  up to five offline replacements, session-ignore, personal-dictionary, and familiar editor actions.
  It targets the clicked pane/occurrence independently of the caret, preserves the `Ctrl+.` route,
  and leaves correct words, code, excluded Markdown ranges, widgets, scrollbars, and keyboard
  context menus to Monaco. Electron smoke coverage exercises the real pointer, Cut/Copy/Paste,
  persistence, split panes, fallback ownership, Undo, and falsified stale/targeting guards.
- ✅ **In-app Help / discoverability** (shipped v1.9.0) — searchable, categorized, read-only
  **keyboard-shortcut / command reference** overlay (File/Edit/View/Tools/Editor/Global) built
  from a curated static `helpContent` module; Help menu + palette entry points (no F1 — Monaco
  owns it). Real **About** dialog: live version, tagline, https links (README/repo/issues). Two
  new IPCs (`getAppVersion`, https-guarded `openExternal`). Unit + smoke tested; whole-branch
  reviewed on `feat/in-app-help` (2 bugs found + fixed: stale empty-state on repeat no-match,
  Esc not closing the About view). _Deferred: a dedicated hotkey (F1/Monaco conflict),
  clickable-to-run rows, auto-derived content, a shared shortcut-constants refactor._

## ✅ Phase 4.5 — Design polish pass 2 (shipped v1.14.0)

_From an outside design review (2026-07-23, `UI-IDEAS.md`): the app reads flat because every
surface is a near-identical tone separated by 1px hairlines. All token/CSS/config work — no
dependency, no layout change, no density change. **Ships under one version bump when the pass is
done** (polish-pass convention — don't bump per slice)._

- ✅ **Slice 1 — tonal ladder, softer floating chrome, calmer accent, Monaco feel** (**S**) —
  three-step chrome ladder across all 13 themes (`--panel-bg` / `--bar` / `--statusbar-bg`, derived
  via a pure `shiftL`; High Contrast opts out of the formula, Monokai keeps it and lands the
  darkest band on screen); `--radius-lg:10px` + a
  two-layer `--shadow` on overlay boxes; the active toolbar button tinted with `--accent-soft` and
  an `--accent-readable` glyph; Monaco smooth caret/scrolling (reduced-motion gated), 8px top
  padding, accent active line number, faint line highlight, indent guides. Unit-tested (colour
  helpers, ladder direction per theme, HC opt-out, accent-override re-derivation, CSS token wiring).
- ✅ **`:focus-visible` rings on chrome** (**S**) — keyboard users get hover styles only today; an
  accent outline is both an a11y fix and a modern touch.
- ✅ **Palette hints as kbd chips** (**S**) — reuse the Help overlay's `.help-kbd` style for the
  palette / quick-open right-aligned hints, and give `.palette-row.active` the same tinted treatment
  the toolbar button got in slice 1.
- ✅ **Toast hierarchy** (**S**) — an inline-SVG info/success/warning glyph plus a 3px semantic left
  bar (`--danger` for errors), so toasts can be glance-read.
- ✅ **Slice 2 — interactive-state polish** (**S**) — toast severity levels (info/success/warning/
  error, inline-SVG glyph + 3px semantic left bar, new `--success`/`--warning` constants); palette
  shortcut hints as `.kbd` keycap chips; the active palette/quick-open row tinted with `--accent-soft`
  + a left bar (decoupling quick-open hover); keyboard-only `:focus-visible` accent rings on chrome.
- ✅ **Sidebar header caption + tree indent guides** (**S**) — folder mode starts with rows and no
  header, which reads as bolted on.
- ✅ **Change bar as a floating banner** (**S**) — margins + radius + shadow instead of a full-width
  accent slab.
- ✅ **Slice 3 — structural chrome** (**S**) — the on-disk-change banner floats as a `--warning`
  notification (panel chrome + accent border + shared `toastGlyph`) instead of a full-width accent
  slab; the folder sidebar gains a muted folder-name header caption and depth-driven tree indent guides.
- ✅ **File-type icon glyphs in the tab bar** (**S**) — the sidebar half shipped in Slice 4 (tinted
  extension badges); the tab bar could reuse the same `fileType()` map. (The original #8's "monochrome
  first" caution was reconsidered for the sidebar — tinting only from the shared `ACCENT_PALETTE`
  avoided a genuinely new colour system, so the badges went colourful.)
- ✅ **Slice 4 — sidebar personality** (**M**) — tinted file-type extension badges (colours drawn from
  the shared `ACCENT_PALETTE` via a pure `fileType()` map) + folder glyphs in the tree, and a visible
  edge-tab open/close toggle at the main-pane seam. (Tab-bar file-type icons remain a possible follow-up.)
- ✅ **Slice 5 — tab-bar file-type badges** (**S**) — each tab shows a tinted badge from the buffer's
  Monaco language via a pure `langBadge()` (reusing the sidebar's shared `ACCENT_PALETTE` colours), so
  a tab's type is scannable and sidebar/tab badges match. Completes UI-IDEAS #8.
- 🧊 **Re-harmonize theme chrome hues** — parked. Most of the 13 are faithful upstream ports
  (Solarized, Nord, Dracula, Gruvbox, Monokai, Tokyo Night); tinting their chrome off canonical
  values reads as *wrong* to anyone who knows them.
- 🧊 **One gradient moment** — parked; lowest value per unit of taste risk.
- ❌ **Retire the accent border on floating chrome** — rejected 2026-07-23 after a side-by-side
  mockup review. It reverses a shipped, documented convention and removes the app's one visual
  signature; radius + shadow carry the softening instead.

## ✅ Phase 3.7 — Polish & discoverability (round 2) (shipped v1.13.0)

_A second small polish/QoL cluster: finish the Phase 3.5 Slice C/D leftovers, surface the buried safety
features so newbies can find them, and tidy the toolbar. Low-risk — mostly one-file CSS / token /
command-registry changes on systems already in place. Shipped as **one release under one version bump**
(polish-pass convention — don't bump per item)._

- ✅ **Rounded tab tops** (**S**) — **merged to `master` 2026-07-18 (no version bump — Phase 3.7 bundle
  ships together).** Tabs now carry a 6px top-corner radius (bottoms square, flush with the strip) for a
  modern browser-tab look. CSS-only in `index.html`; the active tab already color-matches the editor
  (`--tab-active-bg === --editorbg`), so it reads as connected to the content. Smoke-guarded (top-only).
  Floating chrome was already rounded via `--radius`; softening that globally stays a separate taste call.
- ✅ **File History on the toolbar + toolbar regroup** (**S**) — **merged to `master` 2026-07-18 (no
  version bump — the Phase 3.7 bundle ships together).** Added a **History** button grouped with
  Open/Save and regrouped the dividers to `[Open Save History] | [Split Preview Pin] |
  [Highlighter▾ Diff Paste]` (highlighter moved into the tools group). Reuses the existing `'history'`
  command — no behaviour change, and **no `helpContent.ts` change** (File History was already listed).
  Smoke-covered (`app.spec.ts`). _(Superseded the deferred "File
  History status-bar entry" idea — toolbar chosen as the single, louder surface.)_
- ✅ **"Revert File" command — with a confirm** (**S**) — **merged to `master` 2026-07-18 (no version
  bump — Phase 3.7 bundle ships together).** Discards unsaved edits and reloads the current file from
  disk; confirms first when dirty, no-ops with a toast on untitled/clean buffers. Palette + **File
  menu** (placed with Save — more conventional than Edit, the inverse of Save). Reuses the existing
  `reloadBuffer` + themed `confirmDialog`; added to `helpContent.ts`. Smoke-covered (`app.spec.ts`).
  Complements File History (old saved versions) and the change bar (external conflicts).
- ✅ **Theme-picker swatch previews** (**S**, from Phase 3.5 Slice C) — **merged to `master`
  2026-07-19 (no version bump — Phase 3.7 bundle ships together).** Each theme row shows four dots
  from its own chrome tokens (editor bg / bar / bar text / accent), `follow-os` resolving to whatever
  it currently is. Unit-tested (`swatchColours`) + smoke-tested (dots, click-persists-across-relaunch).
  **The hover live-preview half was removed 2026-07-26** — painting an uncommitted theme repainted
  the whole app (all chrome vars + `setTheme` on both Monaco panes) on hover-in and again on
  grid-leave, which read as a flicker, not a feature. `ThemeController.preview`/`endPreview` are
  gone with it; theme changes are click-only, and a smoke guard now asserts hover changes nothing.
  The dots stay — they're what makes the click informed.
- ✅ **Highlighter pen-tip SVG cursor** (**S**, from Phase 3.5 Slice D) — **merged to `master`
  2026-07-20 (no version bump — Phase 3.7 bundle ships together).** The paint-mode cursor is a
  chisel marker with its tip filled in the active highlight colour (`penCursor()`,
  `src/renderer/penCursor.ts`), set as `--hl-cursor` on `body` so both split panes share one write.
  The deferred CSP question resolved to `img-src 'self' data:` — the concession `font-src` already
  had. Unit-tested (encoding + all 18 colours) and smoke-tested (wiring + a CSP-violation guard,
  falsified by hand). **The toolbar's highlighter icon was redrawn to the same chisel silhouette**
  (stroke-only at its 24 viewBox) so the button and the pointer read as one tool. _The first
  artwork — the old icon's four thin outline strokes at 24×24 — was **rejected at the installer
  eyeball**: legible, but unrecognisable as a pen. A 16px toolbar glyph doesn't survive being reused
  as a cursor._
- ✅ **Taskbar icon: `{&}` at small sizes inside `icon.ico`** (**S–M**, root-caused 2026-07-16; moved
  from Phase 3.6 — the heaviest item here) — **merged to `master` 2026-07-20 (no version bump — Phase
  3.7 bundle ships together).** The taskbar button icon comes from the app's exe/shortcut
  **identity icon** (`build/icon.ico`, previously the `{N&C}` tile at all 5 sizes: 16/24/32/48/256), not
  from `win.setIcon`. Diagnosis: full icon-cache rebuild (15 `iconcache_*.db` deleted, Explorer
  restarted) changed nothing, while a second isolated instance's plain window button DOES show `{&}` —
  so the window-icon code works and the identity icon is what the user sees. Fixed in `make-icon.mjs`:
  `icon.ico` now composes `{&}` glyph artwork at **16/24/32** and the `{N&C}` tile at **48/256**
  (per-size artwork is the Windows-native pattern). The `{&}` sits on the same dark `#1B1D21`
  tile as the larger sizes rather than baking a taskbar-specific glyph, so it stays legible on
  light and dark taskbars alike — no theme-swap trade-off to carry. Complementary hardening: `app.setAppUserModelId('com.notesandcodes.app')` at startup + the runtime
  glyph PNGs (32×19) padded to square 32×32. The now-unused `png-to-ico` devDependency (replaced by
  the pure `scripts/icoWriter.mjs` writer, landed with this slice) was removed — it wrote
  **uncompressed BMP** frames (288 KB against the 18 KB PNG payloads produce). Re-pin after shipping
  (pins keep their own copy). _Also folded in after the installer eyeball: Explorer's right-click
  **"Open with Notes & Codes"** entry had always rendered with a blank icon slot — the registry key
  carried only its label and command, never an `Icon` value. Now written, and **re-applied on every
  packaged startup** (gated on `app.isPackaged`) so existing users get it without re-toggling the
  setting; the re-apply also self-heals a stale exe path after a reinstall elsewhere._

## 🚧 Phase 4 — Platform & power (3 shipped in v1.14.0 · 1 next up · 3 parked)

- 🔜 **Microsoft Store release via MSIX** (**M**) — **replaces the parked "buy a code-signing cert"
  item** (see below). Researched 2026-07-25 against Microsoft's current docs.

  **Why this is the route.** An individual developer account is now **free** (nearly 200 markets;
  registration must start at `storedeveloper.microsoft.com`, the only supported entry point for the
  new flow). An MSIX submitted to the Store is **re-signed by Microsoft** with their own certificate
  after it passes certification — no CA cert, no `.pfx`, no USB token or HSM. So the SmartScreen
  warning goes away on the Store channel **for £0**, which is the whole reason the cert was ever
  on this list. The Store also handles updates, which the app has no mechanism for today.

  **The trap: this must NOT be a repackage-and-submit.** MSIX containerises the registry, so writes
  land in the package's private view and the real system never sees them. Two shipped features do
  exactly that, and both are gated on `app.isPackaged` — which is **true** in an MSIX build. So they
  would run, report success, and silently do nothing; the Settings checkbox would tick on with zero
  effect. Silent no-op is worse than a clean failure.
  - **Explorer context menu** (`setContextMenu` → `reg add HKCU\Software\Classes\*\shell\…`) —
    Store apps must declare context-menu / file-association entries in the **app manifest**.
    Decide: reimplement declaratively, or hide the toggle in Store builds.
  - **Launch on login** (`app.setLoginItemSettings` → `HKCU\…\Run`) — Store apps use the
    `windows.startupTask` manifest extension. The `getLoginItemSettings()` drift-reconcile would
    also start reporting nonsense.

  **The detection hook is `process.windowsStore`** (Electron sets it true when running from a Store
  package) — the natural third branch alongside the existing `app.isPackaged` gates.

  **Work list:** free account + identity verification · `appx` target + config in
  `electron-builder.yml` (electron-builder 24.13.3 already supports it) · `process.windowsStore`
  gating for the two features above · IARC age-rating questionnaire · privacy-policy URL (the app is
  local-only with no telemetry, so a three-line policy covers it) · Store listing using the
  screenshots in `assets/screenshots/` · certification review (days, with real rejection risk).

  **Explicitly a trial run.** Owner intent (2026-07-25): learn the Store submission and signing
  pipeline end-to-end on a free app, before it matters on a paid one.

- 🧊 **Code signing — a purchased cert** (**M**) — **demoted, not deleted.** The Store route above
  removes the need for this *for the Store channel only*: Microsoft's signature covers the Store
  copy, and the NSIS installer on GitHub Releases stays unsigned and still trips SmartScreen. So a
  bought cert (~$200–400/yr) remains the only fix for the **direct-download** channel. Worth
  revisiting only if direct downloads stay the main way people install after the Store listing is
  live. _(Note: submitting the **EXE/MSI** to the Store instead of an MSIX does not avoid this —
  the Store does not re-sign MSI/EXE, so that path requires a CA-chained cert of your own and is
  therefore the strictly worse option here.)_
- 🧊 **Native Win11 top-level "Open with"** (**L**) — `IExplorerCommand` handler so it's not under "Show more options".
- ✅ **Settings home** (not originally on the roadmap — shipped v1.14.0) — a new Settings overlay
  (gear button on the toolbar / `Ctrl+,` / palette `Settings…` / `File ▸ Preferences…`) with a left
  category nav: Appearance / Font / Editor / Folder / Startup / Integration. Replaces the old,
  Appearance-only panel; its contents (incl. the theme hover live-preview, _since removed in
  v1.16.0 — see the top of this file_) moved in unchanged. The
  Windows "Open with" right-click-menu toggle moved out of the Tools menu into Settings ▸
  Integration in the same pass (it was a setting filed as a tool), and its previously-duplicated
  toggle logic is now single-sourced. Forced by the configurable-hotkey and launch-on-login items
  below needing a home.
- ✅ **Configurable global hotkey** (**M**) — shipped v1.14.0. Record/Clear widget in Settings ▸
  Startup, replacing the `settings.json`-only mandatory hotkey. Rebinding is test-then-commit: a
  combo already taken by another app reverts to the previous one with a toast, so settings can
  never store a combo that isn't actually bound. Fixed two bugs surfaced along the way: a
  deliberately-cleared hotkey silently reverting to the default on restart (an `||` treating `''`
  as unset), and a malformed `settings.json` hotkey value that could throw during startup instead
  of degrading to a toast.
- 🧊 **Snippet placeholders / tabstops** (**M–L**) — VS Code-style `$1` + abbreviation expansion.
- ✅ **Launch on login** (**S**) — shipped v1.14.0. Opt-in "Launch when Windows starts" in Settings
  ▸ Startup; starts hidden in the system tray so the app is ready to summon instantly. Reconciles
  to the real OS state (`getLoginItemSettings`) on next launch if the entry is disabled behind the
  app's back (Task Manager ▸ Startup), so the checkbox can't lie.

**Deferred item surfaced during this slice — ✅ now fixed** (see ▶ NEXT ACTION): the `contextmenu:set`
toggle path (Settings ▸ Integration's right-click-menu checkbox) was **not** gated on `app.isPackaged`,
unlike the packaged-startup re-apply and the login-item write. It now goes through `applyContextMenu`
→ the pure `contextMenuAction(enabled, isPackaged)`, which skips a dev run in **both** directions
(a dev-run disable would `reg delete` the developer's real installed entry).

## 💡 Someday / maybe

- 💡 Large-file mode (lazy load / feature-degrade over a size threshold) (**M**)
- 💡 Cloud sync of session/snippets/settings (**L**)
- 💡 Plugin / extension hooks (**L**)
- 💡 Cross-platform builds — macOS / Linux (the stack already allows it) (**M–L**)

---

_Check items off as they ship; roll finished phases up into the "Shipped" section. Effort tags are planning aids, not commitments._
