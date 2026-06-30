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

> ▶ **STATUS (2026-06-30) — Phase 3 complete.** All power features shipped: file history,
> Markdown export, autosave-to-disk, Format Document, folder mode, and the **text highlighter**
> (code-complete + whole-branch reviewed on `feat/text-highlighter`; ships as **v1.7.0** at
> merge — version bump + installer + manual tray/hotkey + highlighter checklist + tag pending).
> **Next up:** the **Phase 3.5** design-polish pass (the accent/theme/toast items below).
> **Carried known issue (deferred):** the native `Shift+Alt+F` hotkey does nothing in the
> editor — Format works via palette + Edit menu, so it's a polish gap, not a blocker. Details
> under **Format Document** below.

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
