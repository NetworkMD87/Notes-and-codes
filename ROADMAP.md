# Notes & Codes — Roadmap

---

Living checklist. Glance the emoji to see status; phases are ordered for flow with
**minimal backtracking**. Each item still gets a full design → plan → build pass
when picked up.

**Legend:** ✅ done · 🚧 in progress · ⬜ to do · 🔜 next up · ❓ decision needed ·
🧊 parked · 💡 maybe  ·  effort: **S** small · **M** medium · **L** large

**Sequencing logic:** ① make it *trustworthy* (safety/basics) → ② build a reusable
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
- ✅ **"Save changes?" prompt on quit** — native Save / Don't Save / Cancel for **any** unsaved tab (named + untitled); single-fire on Ctrl+Q; resilient (always quittable). *(untitled coverage + double-fire fixed in v1.0.2)*
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
- ⬜ Status-bar secondary-text dimming via `--muted` (spec §7; status bar currently uses the accent background).
- ⬜ Accent-text auto-contrast (derive from accent luminance instead of fixed white) if light accents are added later.

## ✅ Decision — Identity fork (resolved: **Hybrid**)

- ✅ **Hybrid (Option C).** Stay a fast scratchpad **by default**; add an **optional, toggleable** folder sidebar (file tree) + `Ctrl+P` quick-open for project work. Lightweight by default, powerful on demand — the folder mode never gets in the way and can be toggled off. The folder/tree/quick-open item is **activated** in Phase 3 (built as an opt-in mode, not always-on chrome).

## ✅ Phase 3 — Power features (shipped v1.2–v1.7)

*The big, on-brand features — built on the Phase-2 styled base, so only their structural layout is new (colors/spacing inherited).*

> ▶ **STATUS (2026-07-02) — v1.10.0 shipped (Appearance: interface font + landscape, accent-styled); Phase 3 complete, audit triaged, brand identity in.**
> All power features shipped (file history, Markdown export, autosave-to-disk, Format Document,
> folder mode, text highlighter).
> • **Robustness (v1.7.1):** the external `AUDIT.md` bug audit is triaged — all 19 findings
> verified, **16 fixed**, 2 defensive, **1 rejected (I5)**. Headline: atomic writes
> (`atomicWrite` tmp+rename across `fileService` + all 7 stores), surfaced save-failure toasts,
> dirty-tab-close + quit flush. See `AUDIT.md` ▸ *Triage outcome*.
> • **Identity (v1.8.0):** app logo + **theme-aware small icons** — the tray and live
> window/taskbar button use the `{&}` glyph and swap bright/dark with the Windows taskbar
> theme; static exe/installer icon is the dark `{N&C}` tile. Brand pack in `assets/branding/`.
> Manually eyeballed + released (GitHub release v1.8.0, installer attached).
> **Next up:** finish the **Phase 3.5** design-polish pass (whole-app visual critique; sweeps in
> the Help surface + highlighter-cursor fix); **Phase 3.6 drag-to-reorder tabs shipped** — only
> its deferred live-shift/FLIP animation follow-up remains. *(v1.9.0 shipped in-app Help; v1.10.0
> shipped the Appearance-panel polish — separate interface font + landscape + accent styling —
> the first 3.5 surface. Both eyeballed, merged, tagged.)*
> **Carried known issues (deferred):** ① native `Shift+Alt+F` Format hotkey does nothing
> (works via palette + Edit menu — details under **Format Document**); ② audit I8 residual —
> a *clean* quit (no unsaved tabs) bypasses the clipboard/session flush; ③ static exe/installer
> icon can't theme-swap (uses the contrast-safe dark tile).

- ✅ **Local file history / timeline** (shipped v1.2) — per saved file: snapshots on save + every 5 min (deduped, 50/file), browse/**diff/restore** in a File History panel (palette + Tools menu). *Deferred: prune orphaned history for deleted/renamed files; a status-bar entry; restore confirmation.*
- ✅ **Markdown export** (shipped v1.4) — export the active tab (rendered as Markdown) to a standalone **HTML** file or **PDF** via File ▸ Export or the palette; clean light document style, self-contained (no CDN). *Deferred: relative-image embedding, custom page size/margins, batch export, code syntax highlighting.*
- ✅ **Optional autosave-to-disk** (shipped v1.5) — opt-in autosave for **named** files: debounced after you stop typing (~1.5s) + flushed on focus loss (window blur / hide / tab switch); off by default (toggle in Appearance ▸ Editor or the palette). Skips untitled buffers and unresolved external-change conflicts; no history snapshot per autosave. Whole-branch reviewed; manual focus-loss / cursor-jump checklist passed on the 1.5.0 installer. *Deferred: autosaving untitled buffers, per-file opt-out, configurable delay.*
- ✅ **Format Document** (shipped v1.6) — prettify the active buffer (prettier standalone, lazy-loaded) for JS/TS, JSON, CSS/SCSS/LESS, HTML, Markdown, YAML; palette + Edit menu + Format Selection; optional manual-save-only format-on-save. Code-complete + whole-branch reviewed on `feat/format-document` (1 Important found + fixed: stale-text overwrite guard). Smoke-verified: palette reformat, Format Selection, format-on-save + toggle persist, unsupported-language no-op + toast, syntax-error buffer-untouched + toast, Edit-menu items + `Shift+Alt+F` accelerator registered. Manual test passed: Edit-menu reformat, no cursor/scroll jump.
    - ⬜ **Known issue (deferred): native `Shift+Alt+F` hotkey does nothing in the editor.** Command works via palette + Edit menu, so it's a polish gap, not a blocker. One fix attempt (remove Monaco's no-op built-in `editor.action.formatDocument` binding via `addKeybindingRules`) did not work and was reverted — hypothesis insufficient. Revisit: confirm the `editorPane.ts` `addCommand` handler fires at all; check whether Electron suppresses `Alt`-combo menu accelerators on Windows while the Monaco webview is focused; or register a real Monaco formatting provider. (OS keypress can't be smoke-tested, same as Ctrl+S.)
    *Deferred: configurable options UI, more languages, `.prettierrc` discovery.*
- ✅ **Folder mode: sidebar file-tree + quick-open** (shipped v1.3) — opt-in "Open Folder" → toggleable, resizable left sidebar tree (lazy-loaded) + basic file ops (New File/Folder, Rename, Delete→Recycle Bin) + `Ctrl+P` quick-open; `.git`/`node_modules` hidden by default (Show-all toggle); startup-restore of the last folder. Scratchpad stays the default with no folder open. *Deferred: drag-to-move, cut/copy/paste, multi-root, content search in quick-open, `.gitignore` awareness.*
- ✅ **Text highlighter / pen** (shipped v1.7) — toolbar toggle + **7-colour** swatch dropdown (yellow/green/blue/pink/orange/purple/red) with a **Clear highlights** action in the dropdown; the button underline shows the active colour. With the mode on, drag-select paints a persistent semi-transparent highlight (Monaco decorations), re-stroking the same colour erases, dragging a different colour recolours; also a **Clear Highlights** palette command. Persists **per file on disk** (path-keyed store in `userData`), untitled buffers via the session (migrated on Save-As); highlights ride edits (decoration read-back), clamp on reload, and flush on tab close / quit. Pure interval engine + store are unit-tested; paint / clear / persistence are smoke-tested (incl. relaunch). Code-complete + whole-branch reviewed on `feat/text-highlighter`. *Deferred: external-edit re-anchoring, highlights list panel, carrying highlights into HTML/PDF export, a free custom colour picker, an Edit-menu item, keyboard-only painting. (Multi-part select → copy/paste is already native in Monaco — `Alt+Click` / `Ctrl+D`.)*

## ⬜ Phase 3.5 — Design polish pass (do AFTER Phase 3 surfaces land)

*Holistic "does it feel as premium as it can?" pass. Deliberately sequenced **after** the
Phase 3 structural features (folder tree, quick-open, export view) so every surface is
polished **once** — re-polishing after each new surface lands is exactly what the sequencing
logic above is meant to avoid. The token system already gives new surfaces the right
colours; this pass tunes what tokens don't fix — spacing, density, type scale, hierarchy,
micro-motion.*

- ✅ **Appearance panel: interface font + landscape layout** (shipped v1.10.0) — a separate,
  opt-in **Interface font** for app chrome (default **System** = no change out of the box; the
  list includes sans + the mono coding fonts + Custom), distinct from the editor code font
  (now labeled "Editor font"); the panel re-laid **landscape** (theme list left, accent / font /
  editor / folder right) with a wrap fallback for narrow windows. *(The broader whole-app visual
  critique below remains ⬜.)*
- ⬜ **Whole-app visual critique + targeted upgrade** (**M**) — review the real surfaces
  (tabs, toolbar, status bar, file-history / appearance panels, overlays, empty states) for
  spacing, density, type scale, hierarchy, and micro-motion; apply refinements through the
  existing token system. Kicked off by a design-critique session on the running app.
- ⬜ Fold in the two deferred **Phase-2 token tweaks**: status-bar `--muted` dimming, and
  accent-text auto-contrast (both listed under Phase 2 follow-ups above).
- ⬜ **More accent colours + a real picker** (**S–M**) — expand the curated accent presets
  (**S**) and replace the swatch-only override with a proper colour picker (hue/sat/value or
  hex input) (**M**). Pairs with the accent-text auto-contrast tweak above so light accents
  stay legible.
- ⬜ **More bundled themes + fonts** (**S**) — additional cohesive themes (near-free: just new
  token sets in `themes.ts`) and a few more font choices. **Watch installer bloat:** bundle
  fonts sparingly — prefer surfacing more system fonts over shipping new font files.
- ⬜ **Toast polish** (**S**) — give the theme/notify toast (`notify.ts`) an outline/border,
  refined shadow + spacing so it reads as intentional chrome, not a bare label. Part of the
  overlays/micro-motion sweep.
- ⬜ **Highlighter cursor polish** (**S**) — paint mode currently shows the browser `cell`
  cursor (`.hl-mode .view-lines{cursor:cell}` in `index.html`); swap it for a pen-tip cursor
  that matches the toolbar highlighter icon (custom `cursor:url(...)` SVG, or at least
  `crosshair`) so it reads intentionally.

## ⬜ Phase 3.6 — Quality-of-life & UX (independent of 3.5 — can interleave)

*Small functional niceties, not visual polish, so they sit outside the 3.5 design pass.
Neither depends on 3.5 — they can land before, during, or after it.*

- ✅ **Drag-to-reorder tabs** (shipped) — HTML5 native drag in `tabBar.ts` with an accent
  insertion mark; `BufferManager.move()` reorders the buffer array; new order persists via the
  existing session serialization (survives restart). Unit-tested (`move`) + smoke-tested (drag +
  relaunch). *Deferred: live-shift/FLIP animation of neighbouring tabs (Phase 3.5 polish).*
- ✅ **In-app Help / discoverability** (shipped v1.9.0) — searchable, categorized, read-only
  **keyboard-shortcut / command reference** overlay (File/Edit/View/Tools/Editor/Global) built
  from a curated static `helpContent` module; Help menu + palette entry points (no F1 — Monaco
  owns it). Real **About** dialog: live version, tagline, https links (README/repo/issues). Two
  new IPCs (`getAppVersion`, https-guarded `openExternal`). Unit + smoke tested; whole-branch
  reviewed on `feat/in-app-help` (2 bugs found + fixed: stale empty-state on repeat no-match,
  Esc not closing the About view). *Deferred: a dedicated hotkey (F1/Monaco conflict),
  clickable-to-run rows, auto-derived content, a shared shortcut-constants refactor.*

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

*Check items off as they ship; roll finished phases up into the "Shipped" section. Effort tags are planning aids, not commitments.*
