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

## ▶ NEXT ACTION — 🚧 **Manual installer eyeball of v1.14.0** (everything else is done)

**Settings home + launch on login + configurable global hotkey** — the first Phase 4 slice — is
code-complete, fully reviewed (**whole-branch verdict: ready to merge**) and **packaged** on
`feat/settings-home-and-startup`. The only thing standing between here and the release is the
manual checklist below, which needs a real reboot and real OS-level hotkey binding and therefore
cannot be automated.

**Build to test:** `dist/Notes & Codes Setup 1.14.0.exe` (installer) · `dist/Notes & Codes 1.14.0.exe`
(portable). Both built 2026-07-21.

### ⬜ The checklist

_Launch on login — the reboot test:_
- ⬜ Tick **Settings ▸ Startup ▸ Launch when Windows starts**, then **reboot**.
- ⬜ App is in the tray, **no window**, and the summon hotkey opens it.
- ⬜ **Reopen Settings ▸ Startup and confirm the box is STILL TICKED.** ⚠️ **Do not skip this one.**
  The steps above look correct whether or not the bug is present — the app really does launch. This
  checkbox is the *only* observable for the `getLoginItemSettings` args-mismatch defect found in the
  whole-branch review, and the entire automated suite is structurally blind to it (the reconcile is
  `app.isPackaged`-gated and no test may call `setLoginItemSettings`).
- ⬜ Untick it, and confirm the entry disappears from Task Manager ▸ Startup.

_Configurable hotkey:_
- ⬜ Record `Ctrl+Alt+J`; confirm it summons the window from inside another app.
- ⬜ Restart the app; confirm it still summons.
- ⬜ Record a combo another running app already owns → expect a toast naming it, the widget snapping
  back to the previous combo, and that previous combo still working.
- ⬜ **Clear** the hotkey, restart, confirm it stays cleared (this is the regression guard for the
  cleared-hotkey-reverts-on-restart bug).

_Settings panel:_
- ⬜ Gear button looks right in **light and dark** themes; `Ctrl+,` opens Settings and does nothing
  unwanted while Monaco has focus.
- ⬜ Every migrated control still works: theme click, hover preview + revert, accent, editor font,
  interface font, size, ligatures, both Folder toggles, both Editor toggles, the "Open with" toggle.
- ⬜ Narrow the window — the panel wraps rather than clipping.
- ⬜ Standard tray / hotkey release checklist.

**Then:** merge `--no-ff` → `master`, tag `v1.14.0`, `npm run package` on `master`, publish the
GitHub release with both assets. **Nothing is merged or tagged until the checklist passes.**

**After that ships:** the remaining Phase 4 items — code signing (needs a purchased cert), native
Win11 `IExplorerCommand` "Open with", and snippet placeholders/tabstops. Also still open: the dead
`Shift+Alt+F` hotkey (Format Document known-issue), the deferred `app.isPackaged` gating gap on the
context-menu toggle (noted under Phase 4 below), and the `overlayManager` registration-overwrite
pattern — fixed in `settingsPanel.ts` this slice, but `commandPalette.ts`, `helpOverlay.ts`,
`quickOpen.ts` and `snippetManager.ts` all still stack a stale close-callback on re-entrant open,
which silently eats one Escape press each. Wants its own sweep.

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

> ▶ **STATUS (2026-07-20):** all Phase 3 power features shipped (file history, Markdown export,
> autosave-to-disk, Format Document, folder mode, text highlighter); the Phase 3.5 design-polish pass
> shipped as v1.12.0; the v1.12.0 codebase audit is fully closed (Phase 1 → v1.12.1, Phases 2–5 →
> v1.12.2). **Phase 3.7 polish is complete — all 7 slices merged and
> released as v1.13.0** (tag + GitHub release still outstanding). See ▶ NEXT ACTION at the top.
> **Live known issues (deferred):** ① native `Shift+Alt+F` Format hotkey does nothing (works via
> palette + Edit menu — details under **Format Document** below).
> _(② the clean-quit clipboard/session flush is resolved — audit R1, v1.12.1. ③ the static
> exe/installer icon not theme-swapping is resolved by design as of v1.13.0 — it carries the `{&}`
> glyph on the contrast-safe dark `#1B1D21` tile at 16/24/32, legible on light and dark taskbars
> alike, so there is no swap to want.)_

- ✅ **Local file history / timeline** (shipped v1.2) — per saved file: snapshots on save + every 5 min (deduped, 50/file), browse/**diff/restore** in a File History panel (palette + Tools menu). _Deferred: prune orphaned history for deleted/renamed files; a status-bar entry; restore confirmation._
- ✅ **Markdown export** (shipped v1.4) — export the active tab (rendered as Markdown) to a standalone **HTML** file or **PDF** via File ▸ Export or the palette; clean light document style, self-contained (no CDN). _Deferred: relative-image embedding, custom page size/margins, batch export, code syntax highlighting._
- ✅ **Optional autosave-to-disk** (shipped v1.5) — opt-in autosave for **named** files: debounced after you stop typing (~1.5s) + flushed on focus loss (window blur / hide / tab switch); off by default (toggle in Appearance ▸ Editor or the palette). Skips untitled buffers and unresolved external-change conflicts; no history snapshot per autosave. Whole-branch reviewed; manual focus-loss / cursor-jump checklist passed on the 1.5.0 installer. _Deferred: autosaving untitled buffers, per-file opt-out, configurable delay._
- ✅ **Format Document** (shipped v1.6) — prettify the active buffer (prettier standalone, lazy-loaded) for JS/TS, JSON, CSS/SCSS/LESS, HTML, Markdown, YAML; palette + Edit menu + Format Selection; optional manual-save-only format-on-save. Code-complete + whole-branch reviewed on `feat/format-document` (1 Important found + fixed: stale-text overwrite guard). Smoke-verified: palette reformat, Format Selection, format-on-save + toggle persist, unsupported-language no-op + toast, syntax-error buffer-untouched + toast, Edit-menu items + `Shift+Alt+F` accelerator registered. Manual test passed: Edit-menu reformat, no cursor/scroll jump.
  - ⬜ **Known issue (deferred): native `Shift+Alt+F` hotkey does nothing in the editor.** Command works via palette + Edit menu, so it's a polish gap, not a blocker. One fix attempt (remove Monaco's no-op built-in `editor.action.formatDocument` binding via `addKeybindingRules`) did not work and was reverted — hypothesis insufficient. Revisit: confirm the `editorPane.ts` `addCommand` handler fires at all; check whether Electron suppresses `Alt`-combo menu accelerators on Windows while the Monaco webview is focused; or register a real Monaco formatting provider. (OS keypress can't be smoke-tested, same as Ctrl+S.)
    _Deferred: configurable options UI, more languages, `.prettierrc` discovery._
- ✅ **Folder mode: sidebar file-tree + quick-open** (shipped v1.3) — opt-in "Open Folder" → toggleable, resizable left sidebar tree (lazy-loaded) + basic file ops (New File/Folder, Rename, Delete→Recycle Bin) + `Ctrl+P` quick-open; `.git`/`node_modules` hidden by default (Show-all toggle); startup-restore of the last folder. Scratchpad stays the default with no folder open. _Deferred: drag-to-move, cut/copy/paste, multi-root, content search in quick-open, `.gitignore` awareness._
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
  (capture-phase Esc closes the topmost overlay); `accent-color` checkboxes; icon-only `◐` theme button;
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
- ✅ **In-app Help / discoverability** (shipped v1.9.0) — searchable, categorized, read-only
  **keyboard-shortcut / command reference** overlay (File/Edit/View/Tools/Editor/Global) built
  from a curated static `helpContent` module; Help menu + palette entry points (no F1 — Monaco
  owns it). Real **About** dialog: live version, tagline, https links (README/repo/issues). Two
  new IPCs (`getAppVersion`, https-guarded `openExternal`). Unit + smoke tested; whole-branch
  reviewed on `feat/in-app-help` (2 bugs found + fixed: stale empty-state on repeat no-match,
  Esc not closing the About view). _Deferred: a dedicated hotkey (F1/Monaco conflict),
  clickable-to-run rows, auto-derived content, a shared shortcut-constants refactor._

## 🚧 Phase 4.5 — Design polish pass 2 (slice 1 of N)

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
- ⬜ **File-type icon glyphs in tabs and the sidebar** (**M**) — a language → inline-SVG map,
  ~10-15 languages plus a fallback. Biggest personality lever, but **monochrome first**: per-type
  tinting would introduce a second colour system alongside the accent.
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
  it currently is. Hovering a row live-previews the theme app-wide (`ThemeController.preview` paints
  without committing, so it can't reach `onPersist`); the grid's `mouseleave` and the panel's
  `close()` both revert. Unit-tested (`swatchColours`) + smoke-tested (dots, hover, Escape-mid-preview,
  click-persists-across-relaunch).
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

## 🚧 Phase 4 — Platform & power (2 of 5 shipped — v1.14.0; 3 remain parked)

- 🧊 **Code signing** (**M**, needs a purchased cert) — removes the SmartScreen warning.
- 🧊 **Native Win11 top-level "Open with"** (**L**) — `IExplorerCommand` handler so it's not under "Show more options".
- ✅ **Settings home** (not originally on the roadmap — shipped v1.14.0) — a new Settings overlay
  (gear button on the toolbar / `Ctrl+,` / palette `Settings…` / `File ▸ Preferences…`) with a left
  category nav: Appearance / Font / Editor / Folder / Startup / Integration. Replaces the old,
  Appearance-only panel; its contents (incl. the theme hover live-preview) moved in unchanged. The
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

**Deferred item surfaced during this slice:** the existing `contextmenu:set` toggle path (Settings
▸ Integration's right-click-menu checkbox → `setContextMenu` called directly from `index.ts`) is
**not** gated on `app.isPackaged` — unlike the packaged-startup context-menu re-apply and the new
login-item write, both of which are. Toggling it in a dev run writes to the developer's own real
`HKCU`. Not fixed on this branch; needs its own small pass.

## 💡 Someday / maybe

- 💡 Large-file mode (lazy load / feature-degrade over a size threshold) (**M**)
- 💡 Cloud sync of session/snippets/settings (**L**)
- 💡 Plugin / extension hooks (**L**)
- 💡 Cross-platform builds — macOS / Linux (the stack already allows it) (**M–L**)

---

_Check items off as they ship; roll finished phases up into the "Shipped" section. Effort tags are planning aids, not commitments._
