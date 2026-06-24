# Notes & Codes — Roadmap

---

## ▶ RESUME HERE — test v1.2.0, then merge + tag

**File history / timeline is BUILT but NOT merged or tagged.** It's on branch
`feat/file-history` (version already bumped to **1.2.0**), waiting on a manual test.
All automated checks pass (66 unit + 10 smoke, build clean, opus whole-branch review = merge-ready).

**Step 1 — install & test** `dist/Notes & Codes Setup 1.2.0.exe` (or portable `dist/Notes & Codes 1.2.0.exe`):
- Open a real file, edit + **Save** (Ctrl+S) 2–3× with different changes.
- **Tools ▸ File History** (or palette → "File History") → versions listed newest-first ("just now", "5 min ago"…).
- **Diff** a row → opens the diff view (that version vs current).
- **Restore** an older row → editor rolls back (tab goes dirty; Save to keep). Pre-restore content is itself snapshotted, so you can roll forward.
- On an **Untitled/unsaved** tab → shows "Save this file first…".
- *(optional, patience)* leave an edited-unsaved file ~5 min → an auto-snapshot appears.

**Step 2 — if it works, merge + tag** (the master push needs the user's go-ahead):
```
git checkout master
git merge --no-ff feat/file-history -m "Merge feat/file-history: per-file version history (v1.2.0)"
git push origin master
git tag -a v1.2.0 -m "v1.2.0 — file history / timeline"
git push origin v1.2.0
git branch -d feat/file-history
```
Then **delete this RESUME block** and the matching note at the top of `CLAUDE.md`.

**If anything's off** → fix on `feat/file-history` first, rebuild the installer (`npm run package`), re-verify.

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

## ⬜ Phase 3 — Power features (v1.2)

*The big, on-brand features — built on the Phase-2 styled base, so only their structural layout is new (colors/spacing inherited).*

- ✅ **Local file history / timeline** (shipped v1.2) — per saved file: snapshots on save + every 5 min (deduped, 50/file), browse/**diff/restore** in a File History panel (palette + Tools menu). *Deferred: prune orphaned history for deleted/renamed files; a status-bar entry; restore confirmation.*
- ⬜ **Markdown export** (**M**) — export the rendered preview to HTML / PDF.
- ⬜ **Optional autosave-to-disk** (**S–M**) — debounced / on-focus-loss autosave for named files; off by default.
- ⬜ **Format Document** (**M**) — lightweight code prettify.
- ⬜ **Optional folder mode: sidebar file-tree + quick-open** (**L**) — *activated (Hybrid).* Opt-in "Open Folder" → toggleable left sidebar tree + `Ctrl+P` quick-open; scratchpad stays the default with no folder open.

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
