# Notes & Codes — Roadmap

Living backlog and ordering. Items are grouped into release waves with rough
effort (**S** small, **M** medium, **L** large). Each item still gets a full
design → plan → build pass when picked up; this file is the backlog and sequence.

**Shipped:** v1.0.0 (tabs, split panes, themes, session recovery, diffs, markdown
preview, paste history, encoding/EOL, snippets, tray + global hotkey,
always-on-top, context menu, icon, README).

---

## Next — v1.0.1 (quick fix)

- [ ] **Close-last-tab → hide to tray** (**S**) — *agreed (Option A).* Closing the
  only tab hides the window to the tray and leaves a fresh **Untitled-1** ready for
  the next summon (instead of spawning a visible empty tab). Also fixes the
  numbering bug where the lone untitled tab climbs (Untitled-2, -3, …) — a fresh
  solo tab is always **Untitled-1**.

## v1.1 — Look & Feel

A cohesive visual pass (needs a short design step first — "make it look good" is
subjective, so we'll agree on a direction).

- [ ] **Tab styling** (**S**) — hairline outline/separation, a clear active-tab
  indicator (accent top-border, VS Code style), better hover. *(note #2)*
- [ ] **Font options** (**S–M**) — editor `fontFamily` + `fontSize` (and ligatures
  toggle) via a "Change Font" picker; persisted in settings. *(note #1)*
- [ ] **UI polish** (**M**) — chrome spacing/contrast/depth, toolbar + status-bar
  refinement, reduce the "bland" feel. *(note #4a)*
- [ ] **More themes / colours** (**M–L**) — an editor-theme picker with several
  presets (e.g. Monokai / Solarized / etc. via `monaco.editor.defineTheme`) plus
  the matching app-chrome palette; optional accent colour. Beyond today's plain
  light/dark. *(note #4b)*

## Phase 4 — Platform & power (parked)

- [ ] **Code signing** (**M**, needs a purchased certificate) — removes the
  SmartScreen "Windows protected your PC" warning on install.
- [ ] **Native Win11 top-level "Open with"** (**L**) — `IExplorerCommand` COM
  handler / sparse package so the entry appears without "Show more options".
- [ ] **Configurable global hotkey** (**M**) — capture-the-keystroke UI (today the
  hotkey is editable only via `settings.json`).
- [ ] **Snippet placeholders / tabstops** (**M–L**) — VS Code-style `$1` tabstops
  and abbreviation expansion (type a keyword + Tab).
- [ ] **Launch on login** (**S**) — optional start-with-Windows setting.

## Someday / maybe (unscheduled)

- [ ] Large-file mode (lazy load / disable features over a size threshold).
- [ ] Cloud sync of session/snippets/settings.
- [ ] Plugin/extension hooks.
- [ ] Cross-platform builds (macOS / Linux — the stack already allows it).

---

*Conventions: check items off as they ship; move shipped waves into the "Shipped"
line. Effort is a rough planning aid, not a commitment.*
