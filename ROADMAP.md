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

## ▶ NEXT ACTION — 🚧 Phase 3.7 in progress (6 slices merged + pushed; bundle release pending)

**Phase 3.7 "Polish & discoverability" is underway.** Each slice gets its own `feat/` branch
(brainstorm → spec → plan → TDD → merge `--no-ff`) with **no per-slice version bump** — the whole pass
ships as ONE release when every slice is done (polish-pass convention, [[polish-pass-version-hold]]).

**Merged to `master` (pushed, UNRELEASED):**
- ✅ File History button on the toolbar + toolbar regroup
- ✅ Rounded tab tops (6px)
- ✅ Revert File command (confirm-when-dirty)
- ✅ Diff-theme fix (bonus bug) — opening a diff no longer flips the editors to a light theme on any
  dark theme whose id isn't literally `dark` (Monokai/Dracula/Nord/…)
- ✅ Theme-picker swatch previews + hover live-preview
- ✅ Highlighter pen-tip cursor

**Remaining slices:**
- ⬜ **Taskbar icon `{&}` at small sizes** — heaviest; `make-icon.mjs` per-size artwork; **do this next**.

**⚠️ RESUME STATE (2026-07-19):** `master` is **pushed and in sync with `origin`**, holding the 5 merged
slices above — all captured under `## [Unreleased]` in `CHANGELOG.md`, with **no version bump and no
tag** (still v1.12.3). Eyeballs so far: a **dev** eyeball passed for the first 3 visual slices
(2026-07-18) and an **installer** eyeball passed for the swatch/hover slice (2026-07-19). A final
installer eyeball still gates the v1.13.0 release once the last two slices land.

**To ship Phase 3.7 (once all slices land):** bump **minor → v1.13.0** (feature release), `npm run
package`, manual **installer eyeball** (tray/hotkey + the new slices), tag `v1.13.0`, GitHub release
with installer + portable, and resolve `## [Unreleased]` → `## [1.13.0]` in `CHANGELOG.md`.

Other candidates (after 3.7): two-process second-instance smoke test (Phase 3.6), dead `Shift+Alt+F`
hotkey (Format Document known-issue), parked Phase 4. Audit fully resolved — see `AUDIT-CHECKLIST.md`.

_In-flight / resume detail: [[phase-3.7-in-progress]] memory. v1.12.3 shipped state:
[[phase-3.5-p5-awaiting-eyeball-and-release]]._

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

> ▶ **STATUS (2026-07-18):** all Phase 3 power features shipped (file history, Markdown export,
> autosave-to-disk, Format Document, folder mode, text highlighter); the Phase 3.5 design-polish pass
> shipped as v1.12.0; the v1.12.0 codebase audit is fully closed (Phase 1 → v1.12.1, Phases 2–5 →
> v1.12.2 — see `AUDIT-CHECKLIST.md`). Latest **release** is **v1.12.3**; **Phase 3.7 polish is in
> progress on `master` — 6 slices merged, unreleased** (next release will be **v1.13.0**). See ▶ NEXT
> ACTION at the top for what's next.
> **Live known issues (deferred):** ① native `Shift+Alt+F` Format hotkey does nothing (works via
> palette + Edit menu — details under **Format Document** below); ③ the static exe/installer icon can't
> theme-swap (uses the contrast-safe dark tile — tracked by the taskbar-icon item in Phase 3.7).
> _(② the clean-quit clipboard/session flush is resolved — audit R1, v1.12.1.)_

- ✅ **Local file history / timeline** (shipped v1.2) — per saved file: snapshots on save + every 5 min (deduped, 50/file), browse/**diff/restore** in a File History panel (palette + Tools menu). _Deferred: prune orphaned history for deleted/renamed files; a status-bar entry; restore confirmation._
- ✅ **Markdown export** (shipped v1.4) — export the active tab (rendered as Markdown) to a standalone **HTML** file or **PDF** via File ▸ Export or the palette; clean light document style, self-contained (no CDN). _Deferred: relative-image embedding, custom page size/margins, batch export, code syntax highlighting._
- ✅ **Optional autosave-to-disk** (shipped v1.5) — opt-in autosave for **named** files: debounced after you stop typing (~1.5s) + flushed on focus loss (window blur / hide / tab switch); off by default (toggle in Appearance ▸ Editor or the palette). Skips untitled buffers and unresolved external-change conflicts; no history snapshot per autosave. Whole-branch reviewed; manual focus-loss / cursor-jump checklist passed on the 1.5.0 installer. _Deferred: autosaving untitled buffers, per-file opt-out, configurable delay._
- ✅ **Format Document** (shipped v1.6) — prettify the active buffer (prettier standalone, lazy-loaded) for JS/TS, JSON, CSS/SCSS/LESS, HTML, Markdown, YAML; palette + Edit menu + Format Selection; optional manual-save-only format-on-save. Code-complete + whole-branch reviewed on `feat/format-document` (1 Important found + fixed: stale-text overwrite guard). Smoke-verified: palette reformat, Format Selection, format-on-save + toggle persist, unsupported-language no-op + toast, syntax-error buffer-untouched + toast, Edit-menu items + `Shift+Alt+F` accelerator registered. Manual test passed: Edit-menu reformat, no cursor/scroll jump.
  - ⬜ **Known issue (deferred): native `Shift+Alt+F` hotkey does nothing in the editor.** Command works via palette + Edit menu, so it's a polish gap, not a blocker. One fix attempt (remove Monaco's no-op built-in `editor.action.formatDocument` binding via `addKeybindingRules`) did not work and was reverted — hypothesis insufficient. Revisit: confirm the `editorPane.ts` `addCommand` handler fires at all; check whether Electron suppresses `Alt`-combo menu accelerators on Windows while the Monaco webview is focused; or register a real Monaco formatting provider. (OS keypress can't be smoke-tested, same as Ctrl+S.)
    _Deferred: configurable options UI, more languages, `.prettierrc` discovery._
- ✅ **Folder mode: sidebar file-tree + quick-open** (shipped v1.3) — opt-in "Open Folder" → toggleable, resizable left sidebar tree (lazy-loaded) + basic file ops (New File/Folder, Rename, Delete→Recycle Bin) + `Ctrl+P` quick-open; `.git`/`node_modules` hidden by default (Show-all toggle); startup-restore of the last folder. Scratchpad stays the default with no folder open. _Deferred: drag-to-move, cut/copy/paste, multi-root, content search in quick-open, `.gitignore` awareness._
- ✅ **Text highlighter / pen** (shipped v1.7) — toolbar toggle + **7-colour** swatch dropdown (yellow/green/blue/pink/orange/purple/red) with a **Clear highlights** action in the dropdown; the button underline shows the active colour. With the mode on, drag-select paints a persistent semi-transparent highlight (Monaco decorations), re-stroking the same colour erases, dragging a different colour recolours; also a **Clear Highlights** palette command. Persists **per file on disk** (path-keyed store in `userData`), untitled buffers via the session (migrated on Save-As); highlights ride edits (decoration read-back), clamp on reload, and flush on tab close / quit. Pure interval engine + store are unit-tested; paint / clear / persistence are smoke-tested (incl. relaunch). Code-complete + whole-branch reviewed on `feat/text-highlighter`. _Deferred: external-edit re-anchoring, highlights list panel, carrying highlights into HTML/PDF export, a free custom colour picker, an Edit-menu item, keyboard-only painting. (Multi-part select → copy/paste is already native in Monaco — `Alt+Click` / `Ctrl+D`.)_

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

## ⬜ Phase 3.6 — Quality-of-life & UX (independent of 3.5 — can interleave)

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
- ⬜ **Real two-process second-instance smoke test** (**S**) — `startup-window.spec.ts` emits
  `second-instance` synthetically; add a variant that spawns a genuine second OS process with a
  file arg against the same `--user-data-dir` (repro script proved this works for dev + packaged
  builds, 2026-07-16 — H3 fix verified cross-process).
- ✅ **In-app Help / discoverability** (shipped v1.9.0) — searchable, categorized, read-only
  **keyboard-shortcut / command reference** overlay (File/Edit/View/Tools/Editor/Global) built
  from a curated static `helpContent` module; Help menu + palette entry points (no F1 — Monaco
  owns it). Real **About** dialog: live version, tagline, https links (README/repo/issues). Two
  new IPCs (`getAppVersion`, https-guarded `openExternal`). Unit + smoke tested; whole-branch
  reviewed on `feat/in-app-help` (2 bugs found + fixed: stale empty-state on repeat no-match,
  Esc not closing the About view). _Deferred: a dedicated hotkey (F1/Monaco conflict),
  clickable-to-run rows, auto-derived content, a shared shortcut-constants refactor._

## 🚧 Phase 3.7 — Polish & discoverability (round 2)

_A second small polish/QoL cluster: finish the Phase 3.5 Slice C/D leftovers, surface the buried safety
features so newbies can find them, and tidy the toolbar. Low-risk — mostly one-file CSS / token /
command-registry changes on systems already in place. Ships as **one branch under one version bump**
(polish-pass convention — don't bump per item; see [[polish-pass-version-hold]])._

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
  Smoke-covered (`app.spec.ts`); spec + plan in `docs/superpowers/`. _(Superseded the deferred "File
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
  had. Unit-tested (encoding + all 18 colours) and smoke-tested (wiring + a CSP-violation guard).
- ⬜ **Taskbar icon: `{&}` at small sizes inside `icon.ico`** (**S–M**, root-caused 2026-07-16; moved
  from Phase 3.6 — the heaviest item here) — the taskbar button icon comes from the app's exe/shortcut
  **identity icon** (`build/icon.ico`, currently the `{N&C}` tile at all 5 sizes: 16/24/32/48/256), not
  from `win.setIcon`. Diagnosis: full icon-cache rebuild (15 `iconcache_*.db` deleted, Explorer
  restarted) changed nothing, while a second isolated instance's plain window button DOES show `{&}` —
  so the window-icon code works and the identity icon is what the user sees. Fix in `make-icon.mjs`:
  compose `icon.ico` with `{&}` glyph artwork at **16/24/32** and the `{N&C}` tile at **48/256**
  (per-size artwork is the Windows-native pattern). Trade-off: the identity icon is static — bake the
  bright (dark-taskbar) glyph; light-taskbar users get lower contrast, same as carried known issue ③.
  Complementary hardening: `app.setAppUserModelId('com.notesandcodes.app')` at startup + pad the runtime
  glyph PNGs (32×19) to square 32×32. Re-pin after shipping (pins keep their own copy).

## 🧊 Phase 4 — Platform & power (parked)

- 🧊 **Code signing** (**M**, needs a purchased cert) — removes the SmartScreen warning.
- 🧊 **Native Win11 top-level "Open with"** (**L**) — `IExplorerCommand` handler so it's not under "Show more options".
- 🧊 **Configurable global hotkey** (**M**) — capture-the-keystroke UI (today: `settings.json` only).
- 🧊 **Snippet placeholders / tabstops** (**M–L**) — VS Code-style `$1` + abbreviation expansion.
- 🧊 **Launch on login** (**S**) — optional start-with-Windows.

## 💡 Someday / maybe

- 💡 Large-file mode (lazy load / feature-degrade over a size threshold) (**M**)
- 💡 Cloud sync of session/snippets/settings (**L**)
- 💡 Plugin / extension hooks (**L**)
- 💡 Cross-platform builds — macOS / Linux (the stack already allows it) (**M–L**)

---

_Check items off as they ship; roll finished phases up into the "Shipped" section. Effort tags are planning aids, not commitments._
