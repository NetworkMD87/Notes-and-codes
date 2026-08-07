# Right-Click Spell Corrections Design

**Status:** Approved in conversation on 2026-08-07. This document records the approved design before implementation planning.

## Context

Notes & Codes v1.17.0 marks misspellings in plain-text and Markdown prose and exposes replacement,
session-ignore, and personal-dictionary actions through Monaco's `Ctrl+.` Quick Fix UI. Owner testing
found the feature technically functional but inconvenient: hovering a red underline does not move the
text caret, and right-clicking the underline offers no correction. A user must first place the caret
inside the word and know the Monaco shortcut.

Right-click spelling suggestions are the conventional interaction and must become the primary
discoverable path. The existing Quick Fix path remains supported.

The original offline spell-check design deliberately avoided replacing Monaco's context menu. This
follow-up narrows that rule based on owner testing: pointer right-clicks on a current spelling issue may
be intercepted, but every other editor context-menu path stays owned by Monaco.

## Goals

- A pointer right-click directly on a current red-underlined word opens correction suggestions without
  requiring the caret to be positioned first.
- The menu offers up to five replacements, **Ignore for this session**, and **Add to personal
  dictionary**.
- Familiar editor actions remain available beneath the spelling actions.
- The clicked pane, model, and word own the action even if another pane or position previously held the
  caret.
- `Ctrl+.` continues to expose the same spell actions.
- All checking and suggestion work remains fully offline and reuses the v1.17.0 worker and dictionaries.
- Stale or delayed menu work cannot modify text that changed after the right-click.

## Non-goals

- Code-aware spell checking or enabling spelling in source-code language modes.
- New dictionaries, languages, settings, persistence formats, IPC, or network capabilities.
- Chromium/Electron native spell checking.
- Replacing Monaco's context menu for correct words, ineligible ranges, code buffers, keyboard
  invocation, scrollbars, widgets, or editor chrome.
- Reproducing language-service navigation actions that are irrelevant to eligible plain-text and
  Markdown prose.
- Version bumping, packaging, tagging, releasing, or Store work inside the implementation branch.

## Approaches considered

### Chosen: narrowly intercepted spelling menu

Install a capture-phase pointer context-menu hook on each `EditorPane`. Resolve the clicked Monaco text
position with the public `getTargetAtClientPoint()` API. If the position overlaps a current spelling
issue, stop that one event, obtain suggestions from the existing controller, and show the app's themed
context menu. If it does not overlap a current issue, do nothing and let Monaco render its standard menu.

This provides direct suggestions, stays on public Monaco APIs, preserves the normal editor everywhere
outside a flagged word, and is straightforward to test.

### Rejected: static “Spelling…” item in Monaco's menu

A public `editor.addAction()` entry could preserve Monaco's menu exactly and then open Quick Fix. It
still requires a second click and does not meet the goal of presenting corrections directly.

### Rejected: dynamically inject actions into Monaco's menu

Suggestions are asynchronous and labels vary by word. Registering actions during a context-menu event,
then reopening Monaco's menu, depends on listener timing, transient registrations, and an action id that
is not designed as a dynamic submenu API. Private `MenuRegistry` imports would be still more fragile.
This complexity is not justified for a small usability improvement.

## User experience

### Right-click on a current misspelling

The menu opens at the pointer and contains these groups in order:

1. Up to five replacement suggestions, in the deterministic order returned by the current dictionary.
2. A separator, then **Ignore for this session** and **Add to personal dictionary**.
3. A separator, then the ordinary editing actions used in this spell-aware menu: **Undo**, **Redo**,
   **Cut**, **Copy**, **Paste**, **Select All**, and **Command Palette**. Items that cannot run in the
   current editor state are omitted rather than presented as false affordances.

If the dictionary returns no replacements, the menu starts with the Ignore and Add actions; it does not
show an empty suggestion group. Replacement changes one occurrence and remains one undoable edit.
Ignore and Add retain their existing all-matching-word behavior.

The right-click positions the editor caret at the clicked word when the click is outside the current
selection, matching Monaco's normal pointer-context behavior. The user never has to left-click first.

### Other context-menu paths

- Right-click on a correct word, whitespace, an excluded Markdown range, or a code buffer: Monaco's
  existing menu opens unchanged.
- Right-click on scrollbars, widgets, or editor chrome: Monaco retains control.
- Keyboard context-menu invocation such as `Shift+F10`: Monaco retains control.
- `Ctrl+.`: the existing Quick Fix provider remains registered and unchanged.

## Architecture

### `EditorPane`: public pointer target and ordinary actions

`EditorPane` owns the Monaco instance and must not expose that instance to the rest of the renderer. It
will expose a narrow context-menu registration seam that:

- listens in the DOM capture phase so a handled spelling click can stop Monaco's menu before it opens;
- ignores non-pointer or non-text targets;
- resolves client coordinates to a Monaco position using `getTargetAtClientPoint()`;
- reports the model URI, model version, UTF-16 offset, client coordinates, and pane identity;
- prevents the browser/Monaco event only when the callback synchronously confirms that it owns the
  click; and
- disposes the listener with the pane.

`EditorPane` also exposes narrow callbacks for the agreed ordinary menu actions. They route through
public Monaco editor actions/commands and the existing app command-palette callback; renderer callers do
not receive the raw editor object.

### `SpellCheckController`: issue lookup and menu orchestration

The app-wide `SpellCheckController` remains the single owner of spell UI behavior. It registers the
context-menu callback on both panes and uses `SpellCheckCore.currentIssue()` for the synchronous ownership
decision. This preserves the existing registry rules: URI and model version must match, and the clicked
offset must overlap an issue.

For an owned click, the controller creates the same `SpellActionArgs` used by Quick Fix, requests up to
five suggestions from the existing worker, and composes `ContextMenuEntry` values. Replacement, Ignore,
and Add call the same core methods as `Ctrl+.`; no spell behavior is forked.

The existing `contextMenu.ts` popup remains the renderer. Only small generic capability needed by this
menu may be added there; spelling logic must not move into the generic component.

### Data flow

1. The user right-clicks editor text.
2. `EditorPane` resolves the pointer to a model offset and calls the controller synchronously.
3. The controller checks the current issue registry. No issue means `false`, so Monaco continues normally.
4. A current issue means `true`, so `EditorPane` prevents the original context menu.
5. The controller requests suggestions from the already-loaded local worker.
6. Before opening the menu, the controller rechecks URI, version, range, and word text.
7. The themed menu opens at the recorded pointer coordinates.
8. The selected action revalidates the issue again through the existing core before mutating anything.

No document text, suggestions, or clicked words cross IPC or leave the renderer/worker boundary.

## Concurrency and stale-state rules

- Each context-menu request receives a monotonically increasing request epoch.
- A later context-menu request, model replacement, controller disposal, or spell disable invalidates an
  earlier unresolved request.
- Suggestion results open a menu only if the same issue still exists at the same URI, version, offsets,
  and text.
- Choosing an action performs the existing final `currentAction()` validation. A stale action becomes a
  safe no-op.
- A worker suggestion failure produces no replacement rows. Ignore/Add may remain available only while
  the issue is still current; the worker's existing fatal path clears issues and disables spelling for
  the session.
- A slow suggestion request never blocks typing, saving, opening, or closing. It delays only that popup.

## Lifecycle and failure behavior

- Both pane listeners are registered once by the app-wide controller, never per model or buffer.
- Switching buffers does not add listeners; model data is read at the moment of right-click.
- Controller disposal removes both listeners, invalidates pending menu requests, disposes the existing
  Quick Fix registrations, and terminates the existing spell core/worker as it does today.
- Escape, outside click, and window blur close the themed menu through the existing overlay mechanism.
- Persistence failures for **Add to personal dictionary** retain the current marks and use the existing
  error toast. The context-menu route must not invent a second error policy.

## Testing strategy

### Focused unit coverage

- A clicked offset resolves the exact current issue independently of the caret position.
- The composed spell group preserves suggestion order and caps replacements at five.
- No-suggestion output still contains Ignore/Add and has no empty leading group.
- Stale URI, model version, offsets, or word text produce no menu or mutation.
- A newer context-menu epoch invalidates an older suggestion response.
- Replacement, Ignore, and Add use the existing core action paths rather than parallel implementations.
- Ordinary action entries are appended after spelling entries and separators without changing the
  generic folder context menu behavior.

### Electron smoke coverage

Use isolated `--user-data-dir` profiles and the built app:

1. Open `speling and speling`, deliberately move the caret into the second word, pointer-right-click the
   first underline, assert **spelling** and the ordinary editing actions are visible, select
   **spelling**, and assert only the first occurrence changes. `Ctrl+Z` must restore it.
2. Right-click a correct word and assert the custom spell menu is absent while Monaco's normal context
   menu opens.
3. Use right-click **Ignore for this session** and assert every current matching underline disappears,
   then relaunch and assert the misspelling returns.
4. Use right-click **Add to personal dictionary** and assert matching underlines disappear and remain
   absent after relaunch; remove it through Settings cleanup.
5. In split view, keep pane A focused, right-click an issue in pane B, apply a suggestion, and assert only
   pane B changes.
6. Assert a TypeScript buffer and an excluded Markdown code range never receive the spell-aware menu.
7. Keep the existing `Ctrl+.` replacement smoke test green.

Assertions must anchor on the menu row text and the resulting buffer/decorations. Merely opening some
context menu is not coverage.

### Falsification

- Change the target lookup to use the caret instead of the clicked offset: the first smoke test must fail
  on the wrong occurrence.
- Allow all editor right-clicks to be intercepted: the correct-word/TypeScript assertions must fail.
- Remove the final model-version revalidation: a focused stale-response unit test must fail.
- Remove the ordinary editing entries: the first smoke test must fail on their presence assertions.

### Full gates

- `npm run build`
- `npm test`
- `npm run test:smoke` after a successful build, with `ELECTRON_RUN_AS_NODE` cleared as documented
- `git diff --check`
- Manual packaged-build check before any later release: right-click a misspelling in `.txt` and `.md`,
  exercise replacement/Ignore/Add, confirm ordinary editor actions remain usable, and confirm a correct
  word still receives Monaco's normal menu.

## Expected file impact

- `src/renderer/editorPane.ts`: pointer target seam, ordinary editor-action callbacks, listener disposal.
- `src/renderer/spellCheckController.ts`: right-click ownership, suggestion request epoch, menu composition,
  and reuse of existing spell actions.
- `src/renderer/contextMenu.ts`: only generic menu behavior proven necessary by the final plan.
- `src/renderer/main.ts`: supply the app Command Palette callback and both panes to the controller if the
  existing dependency object cannot express them cleanly.
- `tests/unit/`: focused menu/stale-request coverage, preferably in a new small pure test module if keeping
  it inside `SpellCheckController` would require a DOM-heavy unit harness.
- `tests/smoke/spell-check.spec.ts`: end-to-end pointer-right-click regressions.
- `ROADMAP.md`: already marks this feature next; change it to shipped only after verified implementation.

No main-process, preload, shared IPC, worker protocol, dictionary asset, settings schema, or persistence
file should change.

## Delivery boundary

Implementation will start from this approved spec on the feature branch and follow a separate detailed
implementation plan. The branch will use test-driven slices and review before merge. Release bookkeeping
is a later explicit decision and must follow the repository release checklist.
