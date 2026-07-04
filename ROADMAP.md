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

- ⬜ **On-save overwrite warning** (**S**) — when a file changed on disk since open, warn before overwriting on Save (spec §7 part 2; the change-bar mitigates the common case today).

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

> ▶ **STATUS (2026-07-03) — v1.11.0 shipped (drag-to-reorder tabs); Phase 3 complete, audit triaged, brand identity in.**
> All power features shipped (file history, Markdown export, autosave-to-disk, Format Document,
> folder mode, text highlighter).
> • **Robustness (v1.7.1):** the external `AUDIT.md` bug audit is triaged — all 19 findings
> verified, **16 fixed**, 2 defensive, **1 rejected (I5)**. Headline: atomic writes
> (`atomicWrite` tmp+rename across `fileService` + all 7 stores), surfaced save-failure toasts,
> dirty-tab-close + quit flush. See `AUDIT.md` ▸ _Triage outcome_.
> • **Identity (v1.8.0):** app logo + **theme-aware small icons** — the tray and live
> window/taskbar button use the `{&}` glyph and swap bright/dark with the Windows taskbar
> theme; static exe/installer icon is the dark `{N&C}` tile. Brand pack in `assets/branding/`.
> Manually eyeballed + released (GitHub release v1.8.0, installer attached).
> **v1.11.0 SHIPPED (2026-07-03) — drag-to-reorder tabs.** Built + whole-branch reviewed on
> `feat/drag-reorder-tabs` (opus: ready to merge), eyeballed on the installed build (drag feel +
> accent insertion mark + persist across restart + tray/hotkey checklist — PASS), merged `--no-ff`
> → `master`, tagged `v1.11.0`.
> **Phase 3.5 design polish — IN PROGRESS (version held, ships under one bump when done).**
> **P1 delivered + merged** (status bar, stacked palette, micro-motion layer). **P2 delivered +
> merged (2026-07-04, `feat/design-polish-p2`, eyeball PASS):** accent borders on all floating
> chrome + one unified container-agnostic scrollbar; snippet-manager theming (killed the
> stark-white default inputs). **Bonus robustness fix (P2 branch):** the global-hotkey conflict
> that popped a **blocking modal** (froze startup + the smoke suite when the app was already in the
> tray holding `Ctrl+Shift+Space`) now degrades to a **non-blocking toast** (`app:notify` IPC);
> smoke gates the OS hotkey via `NC_HEADLESS` + a regression test. **P3 delivered + merged**
> (`feat/design-polish-p3`, eyeball PASS): shared `overlayManager` (reliable topmost Esc),
> scrim depth+blur, accent checkboxes, icon-only theme button, highlighter crosshair, inline-SVG
> empty states. **P4 built on `feat/design-polish-p4-accent` (eyeball pending):** accent-text
> auto-contrast (`contrastText`) + 18 curated accent presets (custom colour picker
> tried then dropped per preference). **Remaining 3.5:
> Slice D** (more bundled themes + fonts) — the last item before the single 3.5 version bump;
> plus the ongoing bolder-accent direction + drag-to-reorder's deferred FLIP animation.
> _(v1.9.0 in-app Help; v1.10.0 Appearance-panel polish — the first 3.5 surface. All eyeballed,
> merged.)_
> **Carried known issues (deferred):** ① native `Shift+Alt+F` Format hotkey does nothing
> (works via palette + Edit menu — details under **Format Document**); ② audit I8 residual —
> a _clean_ quit (no unsaved tabs) bypasses the clipboard/session flush; ③ static exe/installer
> icon can't theme-swap (uses the contrast-safe dark tile).

- ✅ **Local file history / timeline** (shipped v1.2) — per saved file: snapshots on save + every 5 min (deduped, 50/file), browse/**diff/restore** in a File History panel (palette + Tools menu). _Deferred: prune orphaned history for deleted/renamed files; a status-bar entry; restore confirmation._
- ✅ **Markdown export** (shipped v1.4) — export the active tab (rendered as Markdown) to a standalone **HTML** file or **PDF** via File ▸ Export or the palette; clean light document style, self-contained (no CDN). _Deferred: relative-image embedding, custom page size/margins, batch export, code syntax highlighting._
- ✅ **Optional autosave-to-disk** (shipped v1.5) — opt-in autosave for **named** files: debounced after you stop typing (~1.5s) + flushed on focus loss (window blur / hide / tab switch); off by default (toggle in Appearance ▸ Editor or the palette). Skips untitled buffers and unresolved external-change conflicts; no history snapshot per autosave. Whole-branch reviewed; manual focus-loss / cursor-jump checklist passed on the 1.5.0 installer. _Deferred: autosaving untitled buffers, per-file opt-out, configurable delay._
- ✅ **Format Document** (shipped v1.6) — prettify the active buffer (prettier standalone, lazy-loaded) for JS/TS, JSON, CSS/SCSS/LESS, HTML, Markdown, YAML; palette + Edit menu + Format Selection; optional manual-save-only format-on-save. Code-complete + whole-branch reviewed on `feat/format-document` (1 Important found + fixed: stale-text overwrite guard). Smoke-verified: palette reformat, Format Selection, format-on-save + toggle persist, unsupported-language no-op + toast, syntax-error buffer-untouched + toast, Edit-menu items + `Shift+Alt+F` accelerator registered. Manual test passed: Edit-menu reformat, no cursor/scroll jump.
  - ⬜ **Known issue (deferred): native `Shift+Alt+F` hotkey does nothing in the editor.** Command works via palette + Edit menu, so it's a polish gap, not a blocker. One fix attempt (remove Monaco's no-op built-in `editor.action.formatDocument` binding via `addKeybindingRules`) did not work and was reverted — hypothesis insufficient. Revisit: confirm the `editorPane.ts` `addCommand` handler fires at all; check whether Electron suppresses `Alt`-combo menu accelerators on Windows while the Monaco webview is focused; or register a real Monaco formatting provider. (OS keypress can't be smoke-tested, same as Ctrl+S.)
    _Deferred: configurable options UI, more languages, `.prettierrc` discovery._
- ✅ **Folder mode: sidebar file-tree + quick-open** (shipped v1.3) — opt-in "Open Folder" → toggleable, resizable left sidebar tree (lazy-loaded) + basic file ops (New File/Folder, Rename, Delete→Recycle Bin) + `Ctrl+P` quick-open; `.git`/`node_modules` hidden by default (Show-all toggle); startup-restore of the last folder. Scratchpad stays the default with no folder open. _Deferred: drag-to-move, cut/copy/paste, multi-root, content search in quick-open, `.gitignore` awareness._
- ✅ **Text highlighter / pen** (shipped v1.7) — toolbar toggle + **7-colour** swatch dropdown (yellow/green/blue/pink/orange/purple/red) with a **Clear highlights** action in the dropdown; the button underline shows the active colour. With the mode on, drag-select paints a persistent semi-transparent highlight (Monaco decorations), re-stroking the same colour erases, dragging a different colour recolours; also a **Clear Highlights** palette command. Persists **per file on disk** (path-keyed store in `userData`), untitled buffers via the session (migrated on Save-As); highlights ride edits (decoration read-back), clamp on reload, and flush on tab close / quit. Pure interval engine + store are unit-tested; paint / clear / persistence are smoke-tested (incl. relaunch). Code-complete + whole-branch reviewed on `feat/text-highlighter`. _Deferred: external-edit re-anchoring, highlights list panel, carrying highlights into HTML/PDF export, a free custom colour picker, an Edit-menu item, keyboard-only painting. (Multi-part select → copy/paste is already native in Monaco — `Alt+Click` / `Ctrl+D`.)_

## ⬜ Phase 3.5 — Design polish pass (do AFTER Phase 3 surfaces land)

_Holistic "does it feel as premium as it can?" pass. Deliberately sequenced **after** the
Phase 3 structural features (folder tree, quick-open, export view) so every surface is
polished **once** — re-polishing after each new surface lands is exactly what the sequencing
logic above is meant to avoid. The token system already gives new surfaces the right
colours; this pass tunes what tokens don't fix — spacing, density, type scale, hierarchy,
micro-motion._

- ✅ **Appearance panel: interface font + landscape layout** (shipped v1.10.0) — a separate,
  opt-in **Interface font** for app chrome (default **System** = no change out of the box; the
  list includes sans + the mono coding fonts + Custom), distinct from the editor code font
  (now labeled "Editor font"); the panel re-laid **landscape** (theme list left, accent / font /
  editor / folder right) with a wrap fallback for narrow windows. _(The broader whole-app visual
  critique below remains ⬜.)_
- 🚧 **Whole-app visual critique + targeted upgrade** (**M**) — review the real surfaces
  (tabs, toolbar, status bar, file-history / appearance panels, overlays, empty states) for
  spacing, density, type scale, hierarchy, and micro-motion; apply refinements through the
  existing token system. Kicked off by a design-critique session on the running app.
  **P1 delivered + merged** (`feat/design-polish-p1` → `master`, eyeball PASS 2026-07-03):
  de-loudified status bar, command-palette stacked box + themed focus, and a reusable
  token-driven **micro-motion layer** (transitions + `overlayIn` overlay entry +
  `prefers-reduced-motion` kill-switch) that later polish inherits for free. **Version
  intentionally NOT bumped** — the whole 3.5 polish pass ships under one version bump when it's
  done, not per-slice. **P2 delivered + merged** (`feat/design-polish-p2` → `master`, eyeball PASS
  2026-07-04): accent borders on all floating chrome + one unified container-agnostic scrollbar
  (user notes 1+2 below) + snippet-manager theming. **P3 delivered + merged**
  (`feat/design-polish-p3` → `master`, 2026-07-04): shared `overlayManager` (reliable
  capture-phase Esc closes the **topmost** overlay — appearance + file-history gained Esc-close;
  12 overlays unified), darker + `blur(3px)` scrim depth, `accent-color` checkboxes, icon-only
  `◐` theme button, highlighter `crosshair`, and inline-SVG **empty-state glyphs** (File History /
  Snippets). **Still outstanding (Slice C / D):** theme-picker swatch previews, accent picker +
  auto-contrast + more presets, more bundled themes/fonts; highlighter **pen-tip SVG** deferred
  (needs a CSP `img-src data:` decision — crosshair shipped).
- **User polish notes (from the P1 eyeball, 2026-07-03)** — three directions:
  1. ✅ **Accent border on all toasts + pop-out menus** (delivered P2) — the notify toast (`.toast`),
     context menu (`#ctx-menu`), toolbar highlighter popup (`.tb-hl-pop`), and every picker/overlay
     box now carry a `1px solid var(--accent)` border, matching the Appearance card. Absorbed the
     "Toast polish" item. _(P2 also themed the snippet-manager fields/buttons — a stark-white default
     the eyeball caught.)_
  2. ✅ **Unify scrollbars** (delivered P2) — one global, container-agnostic `::-webkit-scrollbar`
     style (transparent 3px border + `background-clip:padding-box`) replaced the Help-only block;
     every native scrollbar now matches, Monaco's own scrollbars untouched.
  3. 🚧 **Use accent more boldly (but not over the top)** — "don't be scared of a little colour":
     applied via P2's borders + P3's accent surfaces; now **unblocked** by P4's accent-text
     auto-contrast (accent is safe on any surface — text stays legible). Ongoing direction for
     the rest of the pass, kept tasteful.
- ✅ Fold in the two deferred **Phase-2 token tweaks**: status-bar `--muted` dimming (P1) and
  accent-text auto-contrast (P4) — both delivered.
- ✅ **More accent colours** (**S**, delivered P4) — `ACCENT_SWATCHES` 6 → **18** curated accents
  spanning the wheel (+ a neutral Slate). A native `<input type=color>` picker was tried but
  **dropped per user preference** (fiddly / dismissed on click) — curated presets only. Pairs
  with accent-text auto-contrast so the light presets stay legible.
- ⬜ **More bundled themes + fonts** (**S**) — additional cohesive themes (near-free: just new
  token sets in `themes.ts`) and a few more font choices. **Watch installer bloat:** bundle
  fonts sparingly — prefer surfacing more system fonts over shipping new font files.
- ✅ **Toast polish** (**S**, delivered P2) — the notify toast (`.toast`) now carries the
  `1px solid var(--accent)` border (absorbed into user-note 1 above), reading as intentional chrome.
- ✅ **Highlighter cursor polish** (**S**, delivered P3) — paint mode now shows `crosshair`
  instead of the browser `cell` cursor. _Deferred: a pen-tip `cursor:url(...)` SVG matching the
  toolbar icon — a `data:` cursor is blocked by CSP (`img-src` → `default-src 'self'`), so it
  needs a deliberate `img-src 'self' data:` relaxation or a bundled cursor asset._

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
- ✅ **In-app Help / discoverability** (shipped v1.9.0) — searchable, categorized, read-only
  **keyboard-shortcut / command reference** overlay (File/Edit/View/Tools/Editor/Global) built
  from a curated static `helpContent` module; Help menu + palette entry points (no F1 — Monaco
  owns it). Real **About** dialog: live version, tagline, https links (README/repo/issues). Two
  new IPCs (`getAppVersion`, https-guarded `openExternal`). Unit + smoke tested; whole-branch
  reviewed on `feat/in-app-help` (2 bugs found + fixed: stale empty-state on repeat no-match,
  Esc not closing the About view). _Deferred: a dedicated hotkey (F1/Monaco conflict),
  clickable-to-run rows, auto-derived content, a shared shortcut-constants refactor._

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
