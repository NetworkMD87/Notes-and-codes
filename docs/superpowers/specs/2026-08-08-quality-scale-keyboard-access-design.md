# Quality, Scale & Keyboard Access Design

**Status:** Approved in conversation on 2026-08-08. This document records the approved design before implementation planning.

**Target:** One bundled v1.19.0 product-health release, implemented as independently testable and reviewable slices. The version is not bumped until the complete pass is release-ready.

## Context

Notes & Codes has a reliable Electron security boundary, mature save/persistence behavior, and a consistent visual system. The 2026-08-08 audit identified a related group of product-health improvements that should land before the next platform investment:

- custom renderer controls are visually keyboard-aware but many are still clickable `div`/`span` elements without complete semantics;
- overlays share robust topmost-first Escape handling, but not labelling, focus containment, or focus return;
- Quick Open and folder refresh do unnecessary repeated work at the existing 20,000-file cap;
- Find in Files invalidates stale renderer responses but cannot stop directory traversal when the overlay closes;
- session snapshots, Markdown preview, and startup reads have avoidable serialization or redundant work; and
- Find in Files has no explicit include/exclude scope.

The roadmap currently lists Safe Replace in Files inside Phase 4.6 while its top-level ordering places MSIX first. This design resolves that ambiguity: Phase 4.6 contains roadmap items 1-4 only. Safe Replace in Files remains a separate post-MSIX feature with its own destructive-write design.

## Goals

- Make Settings, tabs, custom menus, overlays, and compact file-format controls usable and understandable without a mouse or visual context.
- Preserve the existing visual language while adding correct semantic roles, names, state, focus containment, and focus restoration.
- Keep Quick Open and folder refresh responsive at the 20,000-file index cap.
- Give every folder traversal one shared, user-configurable exclusion model.
- Stop superseded or closed Find in Files work during traversal rather than merely discarding its final response.
- Add session-local include/exclude globs and an explicit scope summary to Find in Files.
- Coalesce session writes, debounce visible Markdown preview updates, and start independent persisted-state reads together.
- Measure before adding parallel file reads or lazy Monaco-pane creation.
- Ship the work as one coherent v1.19.0 release after full automated and installed-build validation.

## Non-goals

- A visual redesign, new theme system, or new chrome conventions.
- Safe Replace in Files, multi-file writes, or a bulk undo model.
- Regular-expression search or user-controlled expressions passed to `RegExp`.
- Full `.gitignore` parsing, negated globs, brace expansion, character classes, or a glob dependency.
- Unbounded filesystem parallelism, a worker-thread search pool, or streaming search results.
- Lazy creation of the second Monaco pane without profiling evidence and a separately approved design amendment.
- Changes to context isolation, renderer sandboxing, sender validation, atomic-write semantics, or the one-owner-per-keybinding rule.
- Version bumping, packaging, tagging, or publishing before all implementation slices are complete and approved.

## Approaches considered

### Chosen: foundation-first migration

Keep `overlayManager` as the single owner of topmost Escape dismissal, add a small dependency-free dialog/focus primitive beside it, and migrate Settings first. Once the primitive is proven, apply it to other modal overlays. Give menus, tabs, and comboboxes their own semantic state machines because their keyboard models differ from dialogs.

This preserves working lifecycle behavior, creates reusable boundaries for future surfaces, and avoids a framework migration.

### Rejected: surface-by-surface patches

Adding roles, `tabIndex`, focus return, and key handlers independently to every component would be quick for the first surface but would duplicate the hard lifecycle rules. Re-entrant opens, detached openers, nested overlays, and special Escape behavior would drift again.

### Rejected: third-party accessible component framework

The renderer uses lightweight imperative DOM modules. Introducing a component framework or headless-widget runtime would add dependencies, force broad rewrites, and create two UI architectures for behavior that can be expressed by small local primitives.

## Global constraints

- No `node:*`, Electron, filesystem, `Buffer`, or OS access enters `src/renderer/`.
- Any new IPC method is added consistently to `Api`, preload, and `registerIpc`, using the local guarded `handle`/`on` wrappers.
- `OverlayRegistration` remains the only overlay-stack registration mechanism.
- Existing literal search semantics, UTF-8/UTF-16 decoding, open-buffer precedence, case-folded Windows path comparison, and result caps remain load-bearing.
- Workspace persistence continues through typed settings updates; session persistence remains atomic in main.
- New command or shortcut entries update `helpContent.ts` in the same slice.
- No new runtime dependency is required by this design.
- Each implementation slice follows TDD, explicit falsification, focused review, and whole-branch review.

---

## A. Accessible interaction foundations

### A1. Dialog and focus primitive

Add one reusable renderer primitive whose responsibilities are deliberately narrower than a component framework:

- apply `role="dialog"`, `aria-modal="true"`, and `aria-labelledby`/`aria-describedby` to an existing panel;
- record the focused opener on the first transition from closed to open;
- move focus to an explicitly supplied initial target, or the first focusable control;
- contain Tab and Shift+Tab within the dialog while it is open;
- close through the existing `OverlayRegistration` slot;
- restore focus to the original opener if it is still connected and usable;
- otherwise focus the active editor through an injected fallback; and
- make close and re-entrant open idempotent.

The primitive does not render application content, own Escape globally, or decide which button closes a feature. Components retain their current open/close methods and special behavior.

Re-entrant `open()` while a dialog is already visible must not replace the original focus-return target. A deep-link may update content and initial focus, but closing still returns to the control that opened the dialog in the first place.

Settings' hotkey recorder remains a deliberate exception layered above the primitive: the first Escape cancels recording and leaves Settings open; the next Escape closes the dialog. The existing capture-phase ordering and `OverlayRegistration` leak guard remain covered.

### A2. Settings as the proving migration

Settings becomes a labelled modal dialog with a visible, named close button. Its category navigation becomes a vertical tablist:

- categories are `role="tab"` controls with `aria-selected` and roving `tabIndex`;
- Up/Down move and automatically activate the adjacent category;
- Home/End move and activate the first/last category;
- the detail region is the labelled `tabpanel`; and
- switching categories safely tears down hotkey recording before replacing the panel.

Controls inside every category use native semantics wherever possible:

- theme rows form one labelled radio group;
- accent swatches and binary toggles are buttons/checkboxes with explicit names and selected/pressed state;
- visible label text is connected with `label.htmlFor` or `aria-labelledby`;
- descriptions use `aria-describedby` rather than title-only help; and
- disabled controls expose native disabled state.

The layout, tokens, theme cards, swatch grid, hotkey behavior, and existing settings values remain visually and behaviorally consistent.

### A3. Other modal overlays

After Settings proves the primitive, migrate the modal overlay family: Command Palette, Quick Open, Find in Files, Help/About, input/confirm overlays, pickers, snippet manager, file history, diff picker, paste/snippet pickers, and personal dictionary.

Each migrated overlay provides a stable visible title or screen-reader-only label, an initial focus target, and an editor fallback. A surface that already has a correct native control keeps it. No migration may add a private Escape listener or bypass `OverlayRegistration`.

### A4. Custom menus

`showContextMenu` remains the single themed menu renderer and gains a small menu state machine:

- container `role="menu"`;
- action rows are real buttons with `role="menuitem"`;
- separators use `role="separator"`;
- one item participates in roving focus;
- Up/Down, Home/End, and Enter/Space operate the menu;
- disabled entries, if later introduced, are skipped; and
- dismissal restores focus to the invoking control when a keyboard-opened menu has one.

Escape reaches the menu only through its existing `OverlayRegistration` close callback; the menu state machine does not add a private Escape listener. Pointer-opened menus retain pointer positioning and outside-click/blur dismissal. Monaco keeps ownership of editor `Shift+F10`; `Ctrl+.` remains the keyboard route to spell corrections. Sidebar/folder controls may open their app-owned menu from Shift+F10 once those controls are focusable.

### A5. Semantic editor tabs

The tab strip becomes `role="tablist"`. Each visual tab is a non-interactive presentation wrapper containing two siblings: a `role="tab"` button for its badge/title and a real close button. Interactive controls are never nested. The tab button carries `aria-selected`, `aria-controls`, and roving `tabIndex`:

- Left/Right move and automatically activate the adjacent tab;
- Home/End move and activate the first/last tab;
- `Ctrl+PageUp` and `Ctrl+PageDown` switch tabs app-wide without moving focus out of the editor;
- each close glyph becomes a real sibling button named `Close <tab title>`; and
- selecting or closing a tab leaves exactly one valid roving-focus target.

Only the selected tab's close button is in the sequential Tab order; close buttons for inactive tabs remain programmatically focusable. Arrow navigation activates a tab, after which Tab reaches that tab's close button. Closing from the keyboard moves focus to the newly selected neighboring tab. Mouse selection, middle-click close, drag reorder, dirty indicators, file-type badges, split-view ownership, and the add-tab button remain unchanged. The app-wide shortcuts are registered once in the existing window-level key owner, never per Monaco pane.

### A6. Explicit encoding and line-ending selectors

Replace the status bar's click-to-cycle spans with compact native `select` controls:

- `File encoding` offers UTF-8, UTF-8 BOM, UTF-16 LE, and UTF-16 BE;
- `Line endings` offers LF and CRLF;
- each selector has an accessible name and description stating that the selected format is written on the next save; and
- changing a selection preserves the current dirty-state, session-save, tab-refresh, and toast behavior.

Native selects avoid adding another custom popup keyboard model. Their styling stays within the status bar's existing density.

### A7. Command Palette semantics and matching

The palette becomes a labelled dialog containing a combobox/listbox relationship:

- the input exposes `aria-controls`, `aria-expanded`, and `aria-activedescendant`;
- result rows are options with stable ids and selected state;
- the live result count is announced without reading every row; and
- existing Arrow/Enter execution behavior remains.

Extract matching/ranking into pure renderer logic. A command is searchable by normalized label, command id, and shortcut hint. Ranking is deterministic:

1. exact label/id match;
2. label/id prefix match;
3. contiguous substring match;
4. ordered fuzzy subsequence match;
5. registration order as the final tie-break.

Shortcut hints participate in matching but do not outrank an equally strong label/id match.

---

## B. Shared workspace exclusions and large-workspace responsiveness

### B1. Exclusion model

Add `workspaceExcludes: string[]` to persisted `Settings`. The default list is:

```text
**/.git/**
**/node_modules/**
**/dist/**
**/out/**
**/build/**
**/coverage/**
```

Settings ▸ Folder exposes one labelled newline-separated editor plus **Restore defaults**. Blank lines are removed, path separators are normalized to `/`, and duplicate patterns are folded case-insensitively on Windows. Emptying the list is valid.

The supported syntax is intentionally limited:

- `*` matches zero or more non-separator characters;
- `?` matches exactly one non-separator character; and
- `**` matches zero or more complete path segments, so `src/**/*.ts` matches both `src/a.ts` and `src/lib/a.ts`.

Braces, character classes, leading negation, and escape syntax have no special meaning; they are matched literally. This rule is explained beside the field, so an unsupported construct never silently acquires broader meaning.

Patterns are anchored to normalized workspace-relative paths; a leading `/` is removed during normalization. For exclusion and traversal, a terminal `/**` matches both the directory node and every descendant. For example, `**/node_modules/**` rejects a `node_modules` directory at any depth before `walkFiles` enters it. The shared matcher exposes both file matching and directory-subtree pruning so callers cannot reinterpret this rule.

Paths are matched relative to the open workspace root. Existing Show All Files bypasses the complete workspace-exclusion list for the sidebar, indexing, and search. This preserves the toggle's established meaning.

The matcher is pure shared code used by `readDir`, `walkFiles`, Quick Open indexing, and Find in Files. No process implements a second interpretation.

### B2. Quick Open candidate cache and bounded ranking

Folder indexing produces immutable Quick Open candidates containing:

- original absolute path;
- display filename;
- normalized lower-case filename; and
- normalized lower-case relative path.

These values are computed once per index generation, not once per query. Ranking scans all candidates but retains only the best 50 in a bounded structure; it never collects and sorts every match. Existing filename-first behavior remains, while relative-path matching becomes a tie-break/search aid rather than changing the primary ordering.

The pure ranker must return identical deterministic results regardless of input enumeration timing.

### B3. One-active/one-dirty refresh scheduling

Watcher events continue to be debounced in main. Renderer refresh adds a generation-aware scheduler:

- at most one tree/index refresh is active;
- an event during active work sets one dirty flag;
- completion starts exactly one follow-up using the newest root/settings snapshot;
- repeated events while dirty do not queue additional work;
- changing or closing the root invalidates old results; and
- stale completion cannot repaint the new folder or replace its Quick Open cache.

Changing `workspaceExcludes` or Show All Files immediately cancels active Find in Files work and requests a tree/index refresh through this same scheduler. The current tree remains visible while refresh work runs. This is coalescing, not optimistic mutation.

### B4. Measurement fixture

Add a deterministic 20,000-file workspace generator and a local benchmark command. It records:

- cold walk/index time;
- watcher-style refresh time;
- empty, exact, prefix, and fuzzy Quick Open query latency; and
- result ordering/checksum so a faster wrong result cannot pass.

On the release Windows machine, Quick Open must achieve p95 query latency below 50 ms across the representative query set. Filesystem timings are recorded before/after but are not hard-coded into CI because host disk and antivirus variance make that gate brittle.

---

## C. Search cancellation, recovery, and preview efficiency

### C1. End-to-end cancellation

Add a typed one-way `cancelSearch(searchId)` bridge method registered through the guarded IPC wrapper. Renderer Find in Files calls it when:

- a newer qualifying query begins;
- the query becomes shorter than the minimum;
- the workspace/scope changes; or
- the overlay closes.

Main tracks the newest request/cancellation generation. The cancellation predicate is passed into `walkFiles` and checked before descending, after each directory read, and between file stat/read/match operations. Cancellation returns the existing empty response shape for the request id and never produces a toast.

Renderer response-id validation remains in place as a second boundary. Cancellation saves work; the renderer guard still prevents stale paint if an I/O operation completes after cancellation.

### C2. Incremental text matching

Refactor the shared literal matcher around an iterator/callback that scans line boundaries without `text.split(...)`. The existing collecting `searchText` API may remain as a compatibility wrapper. Open-buffer search consumes matches incrementally and stops at the per-file cap plus one, preserving the exact line/column/preview semantics and truncation detection used by disk search.

The main search service uses the same matcher. Regex escaping, whole-word rules, UTF-16 offsets, and caps do not fork.

### C3. Latest session snapshot wins

Add a small pure latest-write scheduler used by renderer session persistence:

- the 500 ms edit debounce remains;
- only one `saveSession` call may be active;
- while active, new snapshots replace one pending snapshot;
- after success or failure, the newest pending snapshot runs;
- repeated failures retain the existing one-time toast policy; and
- quit flush cancels the timer, captures current manager state, and resolves only after the active write and newest pending write settle.

This prevents an older slow atomic write from landing after a newer snapshot. Main retains atomic-write ownership and its current storage format.

A failed quit-time snapshot is attempted once, logged, and surfaced through the existing one-time session error. After that attempt settles, quit proceeds; session persistence never traps the user in an unquittable app and does not retry indefinitely. Unsaved-buffer Save/Don't Save/Cancel handling remains the separate content-loss boundary. Unit coverage includes this failure path as well as successful newest-state flushing.

### C4. Markdown preview debounce

`MarkdownPreview` gains an injected/testable scheduler:

- toggling from hidden to visible renders the current buffer immediately;
- edits while visible debounce rendering by 150 ms;
- a newer edit replaces the pending content;
- hiding, switching buffers, or disposing invalidates pending work; and
- stale work cannot replace a newer buffer's preview.

Preview sanitization and link behavior remain unchanged.

### C5. Parallel independent startup reads

At boot, start these independent read-only calls together:

- settings;
- system locale;
- personal dictionary words;
- clipboard history;
- snippets; and
- session.

Each read degrades independently instead of allowing one rejected IPC promise to reject the whole batch: default settings, `en-GB` locale, empty personal words, empty clipboard history, empty snippets, or an empty session respectively. Failures are logged and produce at most one startup warning after the UI becomes usable. After all reads settle, apply them in the current deterministic order: settings and visual state, histories/snippets, session buffers, startup-file queue, spell controller, folder restore, then `data-booted`. `setAlwaysOnTop` and folder restoration remain ordered side effects, not part of the read batch. A focused smoke test rejects one read and proves the other persisted state still applies and boot completes.

### C6. Evidence-gated exclusions from implementation

The 20,000-file fixture also profiles serial file reads, and startup profiling records the cost of eagerly constructing pane B. Neither bounded read parallelism nor lazy pane-B creation is implemented in v1.19.0 unless measurements show it remains a dominant bottleneck and the owner approves a design amendment. This avoids speculative concurrency and lifecycle risk.

---

## D. Scoped Find in Files

### D1. User experience

Find in Files adds an expandable scope region beneath the query row:

- **Files to include** — empty means every otherwise eligible file;
- **Files to exclude** — additional per-search exclusions; and
- an always-visible summary such as `All files · excluding 6 workspace patterns` or `src/**/*.ts · excluding workspace patterns + 1 search pattern`.

Scope fields are session-local and retain their values while the app runs. Persistent workspace exclusions belong only to Settings. The scope summary and expansion control have explicit accessible names/state.

Patterns are comma-separated and use the same `*`, `?`, `**` syntax as workspace exclusions. Include patterns select a union. Search-specific excludes are added to workspace exclusions; they do not replace them. Show All Files bypasses workspace exclusions but does not bypass explicit search-specific excludes or includes.

Changing scope cancels the active search, resets the active row, and reruns after the existing debounce. Query matching remains literal: scope globs select files, never interpret document content.

### D2. Data flow and IPC

Extend `SearchRequest` with normalized include and exclude arrays. The renderer passes:

- the workspace root;
- literal query and case/whole-word options;
- open-buffer skip paths;
- effective workspace excludes unless Show All Files is enabled;
- session-local include/exclude patterns; and
- the search generation id.

Main compiles the scope once per request and applies it during traversal so excluded subtrees are never walked. Open buffers use a deterministic scope path before their live contents are searched:

- a file inside the active workspace uses its normalized workspace-relative path;
- a file outside the active workspace, or any file-backed tab when no workspace is open, uses its basename only; and
- an untitled buffer has no scope path.

The basename fallback lets patterns such as `*.md` or `**/*.md` scope loose open tabs without pretending they belong to a workspace; a root-relative pattern such as `src/**` cannot match them. Untitled buffers remain searchable only when the include list is empty, and exclude globs do not invent a path for them.

Existing result caps, truncation explanation, encoding detection, dirty-buffer precedence, and merge order remain unchanged.

### D3. Error and edge behavior

- Empty include/exclude fields are valid.
- Unsupported glob features are literal, as documented in Settings and the scope help.
- Unreadable directories/files continue to be skipped without failing the search.
- Cancellation and supersession are silent expected outcomes.
- A root change invalidates the old relative-path scope application and reruns against the new root.
- A search with no folder still searches eligible open buffers using the basename/untitled rules above.

---

## E. Testing and falsification

### E1. Pure unit coverage

**Dialog/focus primitive**

- initial focus, forward/backward wrap, single-focusable and no-focusable cases;
- focus return to a connected opener and editor fallback for a detached opener;
- re-entrant open preserves the original return target;
- idempotent close and release; and
- a component veto/special Escape path does not corrupt the overlay slot.

**Interaction state machines**

- Settings vertical tab navigation and selected state;
- menu navigation, activation, separator/disabled skipping, and dismissal;
- tab roving focus across select, close, reorder, Home/End, and wrap boundaries;
- command matching across label/id/hint with deterministic rank order; and
- status selectors emit the exact encoding/EOL values.

**Workspace/performance logic**

- glob separator normalization, `*`, `?`, zero-segment/deep `**`, directory-node pruning for terminal `/**`, literal unsupported syntax, default exclusions, Show All bypass, and Windows case folding;
- candidate caching inputs and bounded top-50 equivalence to a full reference sort;
- one-active/one-dirty refresh behavior, root/settings invalidation, success, and failure completion;
- traversal cancellation before descent and after a directory read; and
- 20,000-candidate correctness/checksum.

**Search/recovery/preview logic**

- incremental matcher equivalence for LF/CRLF, UTF-16 offsets, long previews, whole words, literals, and caps;
- include/exclude scope consistency between disk paths and open buffers;
- latest-write coalescing, newest-state ordering, failure recovery, successful flush, and quit-after-failed-flush policy;
- preview immediate-open, debounce, replacement, hide/switch cancellation; and
- cancellation generations cannot publish stale results;
- basename/out-of-root/untitled scope-path rules; and
- one rejected startup read still applies the other results and reaches booted state.

### E2. Electron smoke coverage

Use isolated `--user-data-dir` profiles and the built app:

1. Open Settings from a real control, assert dialog/name semantics, keyboard through categories and controls, close, and assert focus returns to the opener.
2. Re-open Settings while visible and exercise hotkey-recording Escape twice; assert the panel and Monaco Escape paths still behave independently.
3. Navigate tabs with Left/Right/Home/End and app-wide `Ctrl+PageUp`/`Ctrl+PageDown`; assert activation, editor focus retention, and named close-button behavior.
4. Open an app-owned custom menu by keyboard, navigate and activate it, and assert focus return. Keep Monaco's `Shift+F10` ownership test green.
5. Change encoding/EOL through labelled selects, save a fixture, and verify actual bytes/newlines plus the next-save explanation.
6. Search the Command Palette by a command id and by a shortcut hint; assert combobox/listbox state and command execution.
7. Open the generated 20,000-file workspace, query Quick Open, and assert bounded result order and an interactive response.
8. Start a slow Find in Files traversal, close the overlay, and assert the main cancellation seam observes termination without later repaint.
9. Apply include/exclude scopes across disk files, a dirty open buffer, a clean open buffer, and an untitled buffer; assert the scope summary and live-content precedence.
10. Force overlapping session saves through a guarded test delay, close/relaunch, and assert only the newest snapshot is restored.
11. Type multiple Markdown edits inside the debounce window and assert the visible preview renders the newest content, never an intermediate or prior buffer.

### E3. Required falsification

Every guard names the break that must make it red before the implementation is trusted:

| Guard | Deliberate break | Required failure |
|---|---|---|
| Focus return | discard the recorded opener | Settings smoke fails on opener focus |
| Focus trap | remove Shift+Tab wrap | dialog unit fails at the first control |
| Tab shortcut owner | register per Monaco pane | split-view tab-switch smoke targets the wrong pane |
| Menu keyboard model | remove ArrowDown handling | keyboard menu smoke cannot activate the intended row |
| Fuzzy palette | search label substring only | id/hint smoke finds no command |
| Bounded Quick Open | return the first 50 matches | reference-equivalence unit fails ordering |
| Refresh coalescing | start work for every event | scheduler unit observes overlapping runs |
| Traversal cancellation | check only after `walkFiles` | slow-walk unit/smoke continues enumerating |
| Live buffer scope | scope only main-process results | dirty-buffer scope test returns the wrong result |
| Latest session write | queue every snapshot independently | delayed-write relaunch restores stale content |
| Preview freshness | let an old timer render | latest-content smoke shows the intermediate edit |

Semantic assertions must target the actual role/name/state that a screen reader consumes. Merely proving an element is visible is not accessibility coverage.

### E4. Full gates

- `npm run typecheck`
- `npm run build`
- `npm test`
- focused smoke files after build
- full normally configured `npm run test:smoke`, with `ELECTRON_RUN_AS_NODE` cleared
- 20,000-file benchmark with before/after results recorded
- `npm run package`
- `git diff --check`
- independent per-slice review and whole-branch review
- manual keyboard-only pass on the packaged build
- manual Windows Narrator pass covering Settings, tabs, palette, a custom menu, status selectors, and Find in Files scope
- installed-build validation of session restore, folder/Quick Open, search cancellation, scoped search, Markdown preview, tray/hotkey, launch-on-login, and existing file save/encoding behavior

CI status is reported per exact commit/run. Local smoke and installed-build evidence are not represented as hosted CI coverage.

---

## F. Delivery slices

The release is one product pass, but implementation remains reviewable:

1. **Dialog/focus primitive + Settings migration**
2. **Remaining accessible surfaces** — overlays, menus, tabs, status selectors, and Command Palette
3. **Workspace foundations** — exclusion settings/matcher, Quick Open cache/ranking, refresh coalescing, benchmark fixture
4. **Search/recovery efficiency** — traversal cancellation, incremental matching, latest session write, preview debounce, startup read batching, profiling
5. **Scoped Find in Files** — include/exclude UI, summary, shared scope application
6. **Whole-pass release preparation** — integration review, roadmap/changelog/help updates, v1.19.0 bump, full gates, tag-before-package ordering, installed validation, and GitHub release

Each slice must leave build and relevant tests green. No slice is released independently, and no release bookkeeping is finalized until the whole pass passes review.

## Expected file impact

Exact task-level paths are fixed in the implementation plan, but the design expects changes in these areas:

- `src/renderer/overlayManager.ts` plus a focused dialog/focus module;
- `src/renderer/settingsPanel.ts`, `tabBar.ts`, `contextMenu.ts`, `statusBar.ts`, `commandPalette.ts`, and other migrated overlays;
- `src/renderer/index.html` for semantic-control-compatible styling without visual redesign;
- `src/renderer/fuzzy.ts`, `quickOpen.ts`, `folderMode.ts`, `findInFiles.ts`, `findInFilesModel.ts`, `markdownPreview.ts`, and `main.ts`;
- `src/main/fsService.ts`, `searchService.ts`, and `ipc.ts`;
- `src/preload/index.ts` and shared settings/search/API types;
- new pure modules for glob matching and latest-write/refresh scheduling where responsibilities would otherwise be tangled;
- focused unit and smoke tests, benchmark fixture/script, `helpContent.ts`, `ROADMAP.md`, and `CHANGELOG.md`.

## Delivery boundary

Implementation begins only after this approved spec is committed, reviewed by the owner, and followed by a separate detailed implementation plan. Execution uses the repository's feature-branch, TDD, subagent review, whole-branch review, and release-checklist workflow.
