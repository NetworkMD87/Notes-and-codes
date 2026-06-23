# Notes & Codes — Roadmap

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

## 🔜 Phase 1 — Safety & basics (v1.0.1)

*Trust first. Mostly behavioral, little/no new UI, no dependency on later work — so it can't be invalidated by it.*

- ⬜ **Close-last-tab → hide to tray** (**S**) — *agreed.* Closing the only tab hides to tray + leaves a fresh **Untitled-1**; fixes the climbing-number bug.
- ⬜ **"Save changes?" prompt on quit/close** (**M**) — guard dirty *named* files before quit (tray Quit / Ctrl+Q / window close). The #1 trust gap today.
- ⬜ **Drag & drop files to open** (**S**) — drop onto the window → opens in a tab.
- ⬜ **Open Recent** (**S**) — recent-files list (persisted), in palette + a menu.
- ⬜ **Detect external file changes** (**M**) — watch open files; offer reload / warn on save-conflict so we never silently overwrite.
- ⬜ **Save All** (**S**) — save every dirty tab at once.
- ⬜ **Zoom** (**S**) — `Ctrl +/-` and `Ctrl+scroll` editor zoom.

## ⬜ Phase 2 — Look & Feel (v1.1)

*Build the styling SYSTEM, then polish every current surface once. Done before big features so those features inherit it instead of forcing a re-polish.*

- ⬜ **Theme/design-token system** (**M**) — CSS variables/tokens for color, spacing, elevation; all chrome + future panels read from it. The thing that prevents re-polishing later.
- ⬜ **More themes / colours** (**M**) — editor-theme picker with several presets (Monokai / Solarized / etc. via `monaco.editor.defineTheme`) + matching chrome palette; optional accent colour. *(note #4b)*
- ⬜ **Tab styling** (**S**) — hairline outline, clear active indicator (accent top-border), better hover. *(note #2)*
- ⬜ **Font options** (**S–M**) — editor `fontFamily` + `fontSize` + ligatures toggle via a "Change Font" picker; persisted. *(note #1)*
- ⬜ **UI polish** (**M**) — spacing/contrast/depth, toolbar + status-bar refinement; kill the "bland". *(note #4a)*

## ❓ Decision — Identity fork (before Phase 3)

*Answer this BEFORE building Phase 3 so we scope it right and don't build features twice.*

- ❓ **Stay a fast scratchpad, or grow a workspace?** — i.e. add **open-a-folder + file-tree sidebar + quick-open (`Ctrl+P`)**. Highest-impact next-level feature, but it shifts identity toward "lite editor" and risks the "fast & lightweight" promise. Decide on purpose. If **yes**, the folder/tree/Ctrl+P item activates in Phase 3.

## ⬜ Phase 3 — Power features (v1.2)

*The big, on-brand features — built on the Phase-2 styled base, so only their structural layout is new (colors/spacing inherited).*

- ⬜ **Local file history / timeline** (**L**) — timestamped local versions you can **diff & restore** (reuses the diff engine). Top pick; doubles down on "never lose work".
- ⬜ **Markdown export** (**M**) — export the rendered preview to HTML / PDF.
- ⬜ **Optional autosave-to-disk** (**S–M**) — debounced / on-focus-loss autosave for named files; off by default.
- ⬜ **Format Document** (**M**) — lightweight code prettify.
- ⬜ **Folder / workspace + file tree + quick-open** (**L**) — *only if the fork above = yes.*

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
