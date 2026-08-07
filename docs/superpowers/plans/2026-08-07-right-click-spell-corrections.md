# Right-Click Spell Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a pointer right-click on a current red-underlined word show direct offline corrections, Ignore, Add to dictionary, and ordinary editor actions without requiring the caret to be positioned first.

**Architecture:** A pure `SpellContextMenuCoordinator` owns request epochs, stale revalidation, and menu composition while reusing `SpellCheckCore` for every spell action. `EditorPane` exposes a narrow capture-phase pointer-target seam plus public editor-action entries; the app-wide `SpellCheckController` connects both panes to the coordinator. Non-spelling and keyboard context menus remain entirely Monaco-owned.

**Tech Stack:** TypeScript 5.5, Electron 31, Monaco 0.50 public APIs, the existing renderer `contextMenu.ts`, Vitest 2, Playwright Electron.

**Spec:** `docs/superpowers/specs/2026-08-07-right-click-spell-corrections-design.md`

## Global Constraints

- Keep the renderer sandbox boundary intact: no `node:*`, `electron`, `fs`, `Buffer`, or new IPC in renderer code.
- Spell checking remains limited to Monaco language ids `plaintext` and `markdown`; code-aware spelling is separate.
- All checks and suggestions remain local in the existing worker. Add no `fetch`, URL, telemetry, Chromium dictionary, or download path.
- Intercept only pointer context-menu events whose clicked text offset overlaps a current spelling issue. Correct words, excluded Markdown, code buffers, widgets, scrollbars, and keyboard invocation remain Monaco-owned.
- Use Monaco public APIs only: `getTargetAtClientPoint`, `getAction`, model URI/version/offset methods, selection methods, and focus methods. Do not import Monaco internals or `MenuRegistry`.
- Keep one app-wide spell controller and one listener per pane; never register per model, buffer, or right-click.
- Keep `Ctrl+.` registered and working through the existing public code-action provider.
- Lazily request at most five suggestions only after an owned right-click.
- Revalidate URI, version, offsets, and word after suggestion resolution and again through existing core action methods before mutation.
- Replacements change one occurrence and remain one undoable edit; Ignore/Add keep their existing behavior and persistence semantics.
- Do not modify main, preload, shared IPC, worker protocol, dictionaries, settings schema, or personal-dictionary storage.
- `npm run build` is the primary production gate. Smoke tests require a fresh build and `ELECTRON_RUN_AS_NODE` cleared in the same command.
- Tests use isolated `--user-data-dir` profiles and remove temporary directories in `finally`.
- Code style remains no semicolons, single quotes, 2-space indentation.
- No version bump, CHANGELOG entry, package, tag, release, or Store work occurs in this feature branch.

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/renderer/contextMenu.ts` | Replace an open popup without orphaning its overlay registration | Modify |
| `src/renderer/editorContextMenu.ts` | Pure ordinary editor-action composition and shared pointer-target type | Create |
| `src/renderer/spellContextMenu.ts` | Testable ownership, request epochs, stale revalidation, and spell-menu composition | Create |
| `src/renderer/editorPane.ts` | Capture-phase Monaco hit testing, caret/focus behavior, and action lookup | Modify |
| `src/renderer/spellCheckController.ts` | Connect both panes and `SpellCheckCore` to the coordinator | Modify |
| `src/renderer/main.ts` | Pass the existing Command Palette callback | Modify |
| `tests/unit/contextMenu.test.ts` | Re-entrant popup replacement and Escape cleanup | Create |
| `tests/unit/editorContextMenu.test.ts` | Ordinary action order, omission, and callbacks | Create |
| `tests/unit/spellContextMenu.test.ts` | Ownership, order, stale requests, epochs, and routing | Create |
| `tests/smoke/spell-check.spec.ts` | Real pointer, persistence, split-pane, non-interception, and Quick Fix guards | Modify |
| `ROADMAP.md` | Record verified implementation without calling it released | Modify after all gates pass |

The generic context-menu entry contract remains unchanged. Its lifecycle must become re-entrant-safe because repeated spell right-clicks can replace an open popup; no spelling logic belongs in that module.

---

### Task 1: Make the reusable context menu re-entrant-safe

**Files:**
- Modify: `src/renderer/contextMenu.ts`
- Create: `tests/unit/contextMenu.test.ts`

**Interfaces:**
- Consumes existing `OverlayRegistration` and `openCount()` behavior.
- Preserves `showContextMenu(x, y, items): void` and `ContextMenuEntry` unchanged.

- [ ] **Step 1: Write a failing jsdom regression**

Create `tests/unit/contextMenu.test.ts`:

```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { showContextMenu } from '../../src/renderer/contextMenu'
import { handleEscape, openCount } from '../../src/renderer/overlayManager'

const esc = () => handleEscape({ key: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() })

describe('showContextMenu', () => {
  const start = openCount()
  afterEach(() => {
    while (openCount() > start) esc()
    document.body.replaceChildren()
  })

  it('replaces an open menu without orphaning an overlay registration', () => {
    showContextMenu(10, 20, [{ label: 'First', run: vi.fn() }])
    showContextMenu(30, 40, [{ label: 'Second', run: vi.fn() }])
    expect(document.querySelectorAll('#ctx-menu')).toHaveLength(1)
    expect(document.querySelector('#ctx-menu')?.textContent).toBe('Second')
    expect(openCount()).toBe(start + 1)
    esc()
    expect(document.querySelector('#ctx-menu')).toBeNull()
    expect(openCount()).toBe(start)
  })
})
```

- [ ] **Step 2: Run red**

Run `npm test -- contextMenu`.

Expected: FAIL because the second `showContextMenu()` removes only the old DOM node and leaves two overlay registrations.

- [ ] **Step 3: Close the live menu before replacing it**

Replace the `pushOverlay` import with `OverlayRegistration`, then add one module-scope registration and `let closeCurrent: (() => void) | null = null`. At the start of `showContextMenu()`, call `closeCurrent?.()` instead of removing the old node. Track and cancel the deferred outside-click timer so replacing a menu before the timer fires cannot install a stale listener. Make `close()` idempotent and identity-safe:

```ts
const overlay = new OverlayRegistration()
let closeCurrent: (() => void) | null = null

// Inside showContextMenu:
let closed = false
let outsideClickTimer: number | null = null
function close(): void {
  if (closed) return
  closed = true
  if (outsideClickTimer !== null) window.clearTimeout(outsideClickTimer)
  if (closeCurrent === close) {
    closeCurrent = null
    overlay.release()
  }
  menu.remove()
  window.removeEventListener('mousedown', onDown, true)
  window.removeEventListener('blur', close)
}
```

After appending the menu, assign `closeCurrent = close`, call `overlay.open(close)`, and store the `window.setTimeout(...)` handle in `outsideClickTimer`. Preserve row-click, outside-click, blur, and Escape behavior.

- [ ] **Step 4: Verify, falsify, and commit**

Run `npm test -- contextMenu overlayManager` and expect PASS.

Falsification: restore the raw DOM removal temporarily. The new test must fail on `openCount()`. Restore and rerun green.

```powershell
git add src/renderer/contextMenu.ts tests/unit/contextMenu.test.ts
git commit -m "fix(ui): replace context menus without stale overlays"
```

---

### Task 2: Pure ordinary editor-menu entries

**Files:**
- Create: `src/renderer/editorContextMenu.ts`
- Create: `tests/unit/editorContextMenu.test.ts`

**Interfaces:**
- Consumes: `ContextMenuEntry` from `src/renderer/contextMenu.ts`.
- Produces `EditorContextMenuTarget`, `EditorMenuAction`, `EditorActionLookup`, and `buildEditorContextEntries(getAction, openCommandPalette)`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/editorContextMenu.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { buildEditorContextEntries, type EditorMenuAction } from '../../src/renderer/editorContextMenu'

const fake = (supported = true, run = vi.fn(async () => undefined)): EditorMenuAction => ({
  isSupported: () => supported,
  run,
})

describe('buildEditorContextEntries', () => {
  it('orders supported actions in stable groups', () => {
    const actions = new Map<string, EditorMenuAction>([
      ['undo', fake()], ['redo', fake()],
      ['editor.action.clipboardCutAction', fake()],
      ['editor.action.clipboardCopyAction', fake()],
      ['editor.action.clipboardPasteAction', fake()],
      ['editor.action.selectAll', fake()],
    ])
    const entries = buildEditorContextEntries(id => actions.get(id) ?? null, vi.fn())
    expect(entries.map(entry => 'separator' in entry ? '---' : entry.label)).toEqual([
      'Undo', 'Redo', '---', 'Cut', 'Copy', 'Paste', 'Select All', '---', 'Command Palette',
    ])
  })

  it('omits unsupported actions without edge or doubled separators', () => {
    const entries = buildEditorContextEntries(
      id => id === 'editor.action.clipboardCopyAction' ? fake() : null,
      vi.fn(),
    )
    expect(entries.map(entry => 'separator' in entry ? '---' : entry.label)).toEqual([
      'Copy', '---', 'Command Palette',
    ])
  })

  it('runs Monaco and app callbacks', async () => {
    const copy = vi.fn(async () => undefined)
    const palette = vi.fn()
    const entries = buildEditorContextEntries(
      id => id === 'editor.action.clipboardCopyAction' ? fake(true, copy) : null,
      palette,
    )
    const rows = entries.filter(entry => !('separator' in entry))
    rows.find(row => row.label === 'Copy')!.run()
    rows.find(row => row.label === 'Command Palette')!.run()
    await Promise.resolve()
    expect(copy).toHaveBeenCalledOnce()
    expect(palette).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run red**

Run `npm test -- editorContextMenu`.

Expected: FAIL because `src/renderer/editorContextMenu.ts` does not exist.

- [ ] **Step 3: Implement the pure module**

Create `src/renderer/editorContextMenu.ts`:

```ts
import type { ContextMenuEntry } from './contextMenu'

export interface EditorContextMenuTarget {
  clientX: number
  clientY: number
  modelUri: string
  modelVersion: number
  startOffset: number
  endOffset: number
}

export interface EditorMenuAction {
  isSupported(): boolean
  run(): Promise<void>
}

export type EditorActionLookup = (id: string) => EditorMenuAction | null

const GROUPS: ReadonlyArray<ReadonlyArray<{ label: string; id: string }>> = [
  [{ label: 'Undo', id: 'undo' }, { label: 'Redo', id: 'redo' }],
  [
    { label: 'Cut', id: 'editor.action.clipboardCutAction' },
    { label: 'Copy', id: 'editor.action.clipboardCopyAction' },
    { label: 'Paste', id: 'editor.action.clipboardPasteAction' },
    { label: 'Select All', id: 'editor.action.selectAll' },
  ],
]

export function buildEditorContextEntries(
  getAction: EditorActionLookup,
  openCommandPalette: () => void,
): ContextMenuEntry[] {
  const groups: ContextMenuEntry[][] = GROUPS.map(group => group.flatMap(({ label, id }) => {
    const action = getAction(id)
    return action?.isSupported() ? [{ label, run: () => { void action.run() } }] : []
  }))
  groups.push([{ label: 'Command Palette', run: openCommandPalette }])
  const entries: ContextMenuEntry[] = []
  for (const group of groups.filter(group => group.length)) {
    if (entries.length) entries.push({ separator: true })
    entries.push(...group)
  }
  return entries
}
```

- [ ] **Step 4: Verify and commit**

```powershell
npm test -- editorContextMenu
npm run build
git add src/renderer/editorContextMenu.ts tests/unit/editorContextMenu.test.ts
git commit -m "feat(editor): compose spell-aware context actions"
```

Expected: tests and build PASS before the commit.

---

### Task 3: Stale-safe spell context-menu coordinator

**Files:**
- Create: `src/renderer/spellContextMenu.ts`
- Create: `tests/unit/spellContextMenu.test.ts`

**Interfaces:**
- Consumes `EditorContextMenuTarget`, `ContextMenuEntry`, `SpellIssue`, `SpellIssueLookup`, and `SpellActionArgs`.
- Produces `SpellContextMenuTarget`, `SpellContextMenuDeps`, `SpellContextMenuCoordinator.tryOpen(target | null): boolean`, and `dispose(): void`.

- [ ] **Step 1: Write failing ownership and order tests**

Create `tests/unit/spellContextMenu.test.ts` with this harness:

```ts
import { describe, expect, it, vi } from 'vitest'
import type { ContextMenuEntry } from '../../src/renderer/contextMenu'
import type { SpellIssue } from '../../src/shared/spell'
import type { SpellIssueLookup } from '../../src/renderer/spellCheckCore'
import {
  SpellContextMenuCoordinator,
  type SpellContextMenuDeps,
  type SpellContextMenuTarget,
} from '../../src/renderer/spellContextMenu'

const issue: SpellIssue = { text: 'speling', start: 0, end: 7 }
const target = (overrides: Partial<SpellContextMenuTarget> = {}): SpellContextMenuTarget => ({
  clientX: 40,
  clientY: 60,
  modelUri: 'file:///note.txt',
  modelVersion: 3,
  startOffset: 2,
  endOffset: 2,
  editorEntries: () => [{ label: 'Copy', run: vi.fn() }],
  ...overrides,
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(pass => { resolve = pass })
  return { promise, resolve }
}

function harness(current: (lookup: SpellIssueLookup) => SpellIssue | null = () => issue) {
  const pending = deferred<string[]>()
  const shown: Array<{ x: number; y: number; entries: ContextMenuEntry[] }> = []
  const deps: SpellContextMenuDeps = {
    currentIssue: current,
    suggestions: vi.fn(() => pending.promise),
    replace: vi.fn(() => true),
    ignore: vi.fn(async () => undefined),
    add: vi.fn(async () => undefined),
    show: (x, y, entries) => { shown.push({ x, y, entries }) },
  }
  return { coordinator: new SpellContextMenuCoordinator(deps), deps, pending, shown }
}

async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}
```

Add tests with these exact expectations:

```ts
it('does not own a click with no current issue', () => {
  const h = harness(() => null)
  expect(h.coordinator.tryOpen(target())).toBe(false)
  expect(h.deps.suggestions).not.toHaveBeenCalled()
})

it('owns a current issue and orders all groups', async () => {
  const h = harness()
  expect(h.coordinator.tryOpen(target())).toBe(true)
  h.pending.resolve(['spelling', 'spieling'])
  await flush()
  expect(h.shown).toHaveLength(1)
  expect(h.shown[0].entries.map(entry => 'separator' in entry ? '---' : entry.label)).toEqual([
    'spelling', 'spieling', '---',
    'Ignore for this session', 'Add to personal dictionary', '---', 'Copy',
  ])
})

it('omits an empty suggestion group', async () => {
  const h = harness()
  h.coordinator.tryOpen(target())
  h.pending.resolve([])
  await flush()
  expect(h.shown[0].entries.map(entry => 'separator' in entry ? '---' : entry.label)).toEqual([
    'Ignore for this session', 'Add to personal dictionary', '---', 'Copy',
  ])
})
```

Run `npm test -- spellContextMenu`.

Expected: FAIL because the coordinator module does not exist.

- [ ] **Step 2: Add stale, epoch, cap, routing, and disposal tests**

Add tests that prove:

```ts
it('drops suggestions when the issue becomes stale', async () => {
  let current: SpellIssue | null = issue
  const h = harness(() => current)
  h.coordinator.tryOpen(target())
  current = null
  h.pending.resolve(['spelling'])
  await flush()
  expect(h.shown).toEqual([])
})

it('a newer non-issue click invalidates an older request', async () => {
  let current: SpellIssue | null = issue
  const h = harness(() => current)
  h.coordinator.tryOpen(target())
  current = null
  expect(h.coordinator.tryOpen(null)).toBe(false)
  h.pending.resolve(['spelling'])
  await flush()
  expect(h.shown).toEqual([])
})

it('deduplicates and caps suggestions at five', async () => {
  const h = harness()
  h.coordinator.tryOpen(target())
  h.pending.resolve(['one', 'two', 'one', 'three', 'four', 'five', 'six'])
  await flush()
  const labels = h.shown[0].entries.flatMap(entry => 'separator' in entry ? [] : [entry.label])
  expect(labels.slice(0, 5)).toEqual(['one', 'two', 'three', 'four', 'five'])
  expect(labels).not.toContain('six')
})

it('drops unresolved work after dispose', async () => {
  const h = harness()
  h.coordinator.tryOpen(target())
  h.coordinator.dispose()
  h.pending.resolve(['spelling'])
  await flush()
  expect(h.shown).toEqual([])
})
```

Add this routing test:

```ts
it('routes Replace, Ignore, and Add through supplied core callbacks', async () => {
  const h = harness()
  h.coordinator.tryOpen(target())
  h.pending.resolve(['spelling'])
  await flush()
  const rows = h.shown[0].entries.filter(entry => !('separator' in entry))
  rows.find(row => row.label === 'spelling')!.run()
  rows.find(row => row.label === 'Ignore for this session')!.run()
  rows.find(row => row.label === 'Add to personal dictionary')!.run()
  expect(h.deps.replace).toHaveBeenCalledWith(expect.objectContaining({
    modelUri: 'file:///note.txt', modelVersion: 3, start: 0, end: 7,
    word: 'speling', replacement: 'spelling',
  }))
  expect(h.deps.ignore).toHaveBeenCalledWith(expect.objectContaining({ word: 'speling' }))
  expect(h.deps.add).toHaveBeenCalledWith(expect.objectContaining({ word: 'speling' }))
})
```

- [ ] **Step 3: Implement the coordinator**

Create `src/renderer/spellContextMenu.ts`:

```ts
import type { SpellIssue } from '../shared/spell'
import type { ContextMenuEntry } from './contextMenu'
import type { EditorContextMenuTarget } from './editorContextMenu'
import type { SpellActionArgs, SpellIssueLookup } from './spellCheckCore'

export interface SpellContextMenuTarget extends EditorContextMenuTarget {
  editorEntries: () => ContextMenuEntry[]
}

export interface SpellContextMenuDeps {
  currentIssue: (target: SpellIssueLookup) => SpellIssue | null
  suggestions: (target: SpellActionArgs) => Promise<string[]>
  replace: (target: SpellActionArgs) => boolean
  ignore: (target: SpellActionArgs) => Promise<void>
  add: (target: SpellActionArgs) => Promise<void>
  show: (x: number, y: number, entries: ContextMenuEntry[]) => void
}

const sameIssue = (issue: SpellIssue | null, action: SpellActionArgs): boolean =>
  issue?.start === action.start && issue.end === action.end && issue.text === action.word

export class SpellContextMenuCoordinator {
  private epoch = 0
  private disposed = false

  constructor(private readonly deps: SpellContextMenuDeps) {}

  tryOpen(target: SpellContextMenuTarget | null): boolean {
    const epoch = ++this.epoch
    if (this.disposed || !target) return false
    const current = this.deps.currentIssue(target)
    if (!current) return false
    const action: SpellActionArgs = {
      modelUri: target.modelUri,
      modelVersion: target.modelVersion,
      start: current.start,
      end: current.end,
      word: current.text,
    }
    void this.open(epoch, target, action)
    return true
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.epoch++
  }

  private async open(epoch: number, target: SpellContextMenuTarget, action: SpellActionArgs): Promise<void> {
    const requested = await this.deps.suggestions(action)
    if (this.disposed || epoch !== this.epoch) return
    if (!sameIssue(this.deps.currentIssue(target), action)) return
    const suggestions = [...new Set(requested)].slice(0, 5)
    const entries: ContextMenuEntry[] = suggestions.map(replacement => ({
      label: replacement,
      run: () => { this.deps.replace({ ...action, replacement }) },
    }))
    if (entries.length) entries.push({ separator: true })
    entries.push(
      { label: 'Ignore for this session', run: () => { void this.deps.ignore(action) } },
      { label: 'Add to personal dictionary', run: () => { void this.deps.add(action) } },
    )
    const editorEntries = target.editorEntries()
    if (editorEntries.length) entries.push({ separator: true }, ...editorEntries)
    this.deps.show(target.clientX, target.clientY, entries)
  }
}
```

The current `SpellCheckCore.suggestions()` already converts worker rejection to `[]`. Do not add logging that could expose the clicked word.

- [ ] **Step 4: Verify, falsify, and commit**

```powershell
npm test -- spellContextMenu editorContextMenu spellCheckCore
npm run build
```

Expected: PASS.

Falsification: temporarily remove the `sameIssue(...)` check, rerun `npm test -- spellContextMenu`, and confirm the stale test fails because a menu is shown. Restore and rerun green.

```powershell
git add src/renderer/spellContextMenu.ts tests/unit/spellContextMenu.test.ts
git commit -m "feat(spell): coordinate stale-safe context menus"
```

---

### Task 4: Capture right-click targets and wire both panes

**Files:**
- Modify: `src/renderer/editorPane.ts:1-87,235-360`
- Modify: `src/renderer/spellCheckController.ts:1-118`
- Modify: `src/renderer/main.ts:339-348`

**Interfaces:**
- Consumes the pure modules from Tasks 2-3, existing `SpellCheckCore`, and the re-entrant-safe `showContextMenu()` from Task 1.
- Produces `EditorPane.onPointerContextMenu(handler)`, `EditorPane.editorContextEntries(openCommandPalette)`, and renderer-local `SpellCheckControllerDeps`.

- [ ] **Step 1: Add the narrow `EditorPane` capture seam**

Import `ContextMenuEntry`, `EditorContextMenuTarget`, and `buildEditorContextEntries`. Add:

```ts
onPointerContextMenu(handler: (target: EditorContextMenuTarget | null) => boolean): monaco.IDisposable {
  const listener = (event: MouseEvent): void => {
    if (event.button !== 2) {
      handler(null)
      return
    }
    const target = this.editor.getTargetAtClientPoint(event.clientX, event.clientY)
    const model = this.editor.getModel()
    if (!model || target?.type !== monaco.editor.MouseTargetType.CONTENT_TEXT || !target.position) {
      handler(null)
      return
    }
    const offset = model.getOffsetAt(target.position)
    if (!handler({
      clientX: event.clientX,
      clientY: event.clientY,
      modelUri: model.uri.toString(),
      modelVersion: model.getVersionId(),
      startOffset: offset,
      endOffset: offset,
    })) return

    event.preventDefault()
    event.stopPropagation()
    const selection = this.editor.getSelection()
    if (!selection?.containsPosition(target.position)) this.editor.setPosition(target.position)
    this.editor.focus()
  }
  this.container.addEventListener('contextmenu', listener, true)
  let active = true
  return {
    dispose: () => {
      if (!active) return
      active = false
      this.container.removeEventListener('contextmenu', listener, true)
    },
  }
}

editorContextEntries(openCommandPalette: () => void): ContextMenuEntry[] {
  return buildEditorContextEntries(id => this.editor.getAction(id), openCommandPalette)
}
```

Do not set Monaco's `contextmenu` option to `false`. The capture listener stops only an owned spelling click; Monaco must still receive all other pointer and keyboard paths.

- [ ] **Step 2: Define controller-specific pane dependencies**

In `spellCheckController.ts`, import `SpellPane`, `ContextMenuEntry`, `EditorContextMenuTarget`, `showContextMenu`, and `SpellContextMenuCoordinator`. Add:

```ts
interface SpellContextPane extends SpellPane {
  onPointerContextMenu(handler: (target: EditorContextMenuTarget | null) => boolean): monaco.IDisposable
  editorContextEntries(openCommandPalette: () => void): ContextMenuEntry[]
}

interface SpellCheckControllerDeps extends Omit<SpellCheckCoreDeps, 'panes' | 'allPanes'> {
  panes: () => SpellContextPane[]
  allPanes: () => SpellContextPane[]
  openCommandPalette: () => void
}
```

Keep these types renderer-local; they are not IPC contracts.

- [ ] **Step 3: Construct one coordinator and register one listener per pane**

Add `private readonly contextMenu: SpellContextMenuCoordinator`. Change the constructor to accept `SpellCheckControllerDeps`, create `SpellCheckCore`, then create:

```ts
this.contextMenu = new SpellContextMenuCoordinator({
  currentIssue: target => this.core.currentIssue(target),
  suggestions: target => this.core.suggestions(target),
  replace: target => this.core.replace(target),
  ignore: target => this.core.ignore(target),
  add: target => this.core.add(target),
  show: showContextMenu,
})
```

Append these registrations to the existing provider/command registrations:

```ts
...deps.allPanes().map(pane => pane.onPointerContextMenu(target => this.contextMenu.tryOpen(target ? {
  ...target,
  editorEntries: () => pane.editorContextEntries(deps.openCommandPalette),
} : null))),
```

Call `this.contextMenu.dispose()` at the start of controller `dispose()`. Leave the Quick Fix provider and three Monaco spell commands unchanged.

- [ ] **Step 4: Pass the existing palette callback from `main.ts`**

Add to `new SpellCheckController({...})`:

```ts
openCommandPalette: () => palette.open(),
```

`palette` is constructed before the bottom-of-module `boot()` call. Do not create another palette or move spell initialization.

- [ ] **Step 5: Verify and commit**

```powershell
npm run build
npm test -- editorContextMenu spellContextMenu spellCheckCore
git add src/renderer/editorPane.ts src/renderer/spellCheckController.ts src/renderer/main.ts
git commit -m "feat(spell): open corrections from right click"
```

Expected: build and focused tests PASS before commit.

---

### Task 5: End-to-end pointer and regression coverage

**Files:**
- Modify: `tests/smoke/spell-check.spec.ts`

**Interfaces:**
- Consumes the real built Electron app, `.spell-error`, `#ctx-menu`, Monaco's `.monaco-menu-container`, and existing isolated launch helpers.
- Produces `openSpellContextMenu()` and `useRightClickSpellAction()` smoke helpers plus outcome-based regressions.

- [ ] **Step 1: Add a real pointer helper**

Add beside the current Quick Fix helpers:

```ts
async function openSpellContextMenu(win: Page, occurrence = 0, pane = '#paneA') {
  const underline = spellErrors(win, pane).nth(occurrence)
  await expect(underline).toBeVisible()
  await underline.click({ button: 'right' })
  const menu = win.locator('#ctx-menu')
  await expect(menu).toBeVisible()
  return menu
}

async function useRightClickSpellAction(
  win: Page,
  label: string,
  occurrence = 0,
  pane = '#paneA',
): Promise<void> {
  const menu = await openSpellContextMenu(win, occurrence, pane)
  await menu.locator('.ctx-item', { hasText: label }).click()
}
```

If Monaco's overlay prevents `locator.click({ button: 'right' })`, use the underline's bounding box and `win.mouse.click(x, y, { button: 'right' })`. Do not call renderer internals or dispatch an app-specific synthetic event.

- [ ] **Step 2: Add clicked-occurrence replacement coverage while retaining `Ctrl+.`**

Keep the existing `Ctrl+.` replacement/Undo test. Add a second test that:

1. opens `speling and speling` and waits for two decorations;
2. focuses the editor and presses `Control+End`, placing the caret away from the first word;
3. right-clicks the first `.spell-error`;
4. asserts rows for `spelling`, Ignore, Add, Copy, Paste, and Command Palette;
5. chooses `spelling`;
6. asserts `spelling and speling` and exactly one remaining decoration;
7. presses `Control+Z` and asserts both misspellings and decorations return.

The first-occurrence content assertion is the guard that proves pointer targeting rather than caret targeting.

- [ ] **Step 3: Route existing Ignore/Add persistence tests through right-click**

Replace the existing helper calls with:

```ts
await useRightClickSpellAction(win, 'Add to personal dictionary')
await useRightClickSpellAction(win, 'Ignore for this session')
```

Keep all existing underline and relaunch assertions. Remove `useSpellAction` only after it has no callers. The retained replacement test continues to cover `Ctrl+.`.

- [ ] **Step 4: Add non-interception assertions**

Add a rendered-text helper:

```ts
async function rightClickRenderedText(win: Page, text: string, occurrence = 0, pane = '#paneA'): Promise<void> {
  const node = win.locator(`${pane} .view-line span`, { hasText: text }).nth(occurrence)
  await expect(node).toBeVisible()
  const box = await node.boundingBox()
  if (!box) throw new Error('rendered text has no bounding box')
  await win.mouse.click(box.x + Math.min(4, box.width / 2), box.y + box.height / 2, { button: 'right' })
}

async function expectMonacoContextMenu(win: Page): Promise<void> {
  await expect(win.locator('#ctx-menu')).toHaveCount(0)
  await expect(win.locator('.monaco-menu-container')).toBeVisible()
  await win.keyboard.press('Escape')
  await expect(win.locator('.monaco-menu-container')).toHaveCount(0)
}
```

Use those helpers in each case below:

- a correct word in an eligible `.txt` buffer;
- text in a TypeScript buffer;
- the excluded fenced-code occurrence in the existing Markdown fixture.
- a keyboard invocation (`Shift+F10`) while the caret is on a correct word.

For example, the correct-word case must execute:

```ts
await rightClickRenderedText(win, 'ordinary')
await expectMonacoContextMenu(win)
```

For the keyboard case, focus the editor, position the caret within `ordinary`, press `Shift+F10`, and call `expectMonacoContextMenu(win)`. This proves the capture listener observes but does not claim a keyboard-generated `contextmenu` event.

Select the fenced-code line by its `.view-line` occurrence rather than the prose decoration. A zero-decoration assertion alone is insufficient because it does not prove the event was left to Monaco.

- [ ] **Step 5: Add split-pane targeting**

Extend the split fixture so pane A contains `speling one` and pane B contains `speling two`. Focus pane A, right-click pane B's underline, choose `spelling`, then assert:

```ts
await expect(win.locator('#paneA .view-lines')).toContainText('speling one')
await expect(win.locator('#paneB .view-lines')).toContainText('spelling two')
await expect(spellErrors(win, '#paneA')).toHaveCount(1)
await expect(spellErrors(win, '#paneB')).toHaveCount(0)
```

- [ ] **Step 6: Build and run the focused smoke suite**

```powershell
npm run build
Remove-Item env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue; npx playwright test tests/smoke/spell-check.spec.ts
```

Expected: PASS. If a retry turns green, inspect and record the original failure separately.

- [ ] **Step 7: Falsify the four load-bearing guards**

Break one guard at a time, run the named test with `--retries=0`, observe red, restore, and rerun green:

1. In `EditorPane.onPointerContextMenu`, use `editor.getPosition()` instead of the pointer hit target: clicked-occurrence test fails.
2. Claim every content right-click: correct-word/TypeScript Monaco-menu test fails.
3. Remove post-suggestion `sameIssue`: stale coordinator unit test fails.
4. Return no ordinary entries: Copy/Paste/Command Palette presence assertion fails.

After restoring all breaks:

```powershell
npm test -- editorContextMenu spellContextMenu spellCheckCore
npm run build
Remove-Item env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue; npx playwright test tests/smoke/spell-check.spec.ts --retries=0
```

Expected: all PASS.

- [ ] **Step 8: Commit the smoke guards**

```powershell
git add tests/smoke/spell-check.spec.ts
git commit -m "test(spell): guard right-click corrections"
```

---

### Task 6: Whole-branch verification and roadmap state

**Files:**
- Modify: `ROADMAP.md`

**Interfaces:**
- Consumes verified implementation and test evidence from Tasks 1-5.
- Produces an accurate “implemented, pending release” roadmap state without performing release bookkeeping.

- [ ] **Step 1: Run every repository gate from the branch tip**

```powershell
npm run build
npm test
Remove-Item env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue; npm run test:smoke
git diff --check master...HEAD
```

Expected: every gate PASS. Record each smoke attempt separately; a later green retry does not erase an earlier failure.

- [ ] **Step 2: Review the whole diff against scope and security boundaries**

```powershell
git diff --stat master...HEAD
git diff master...HEAD -- src/renderer tests ROADMAP.md
```

Confirm from the diff:

- no main/preload/shared IPC, worker, dictionary, setting, or persistence changes;
- no renderer Node/Electron or Monaco-private imports;
- one disposed listener per pane, not per model;
- non-issue clicks synchronously return false;
- request epoch and post-suggestion issue revalidation both exist;
- all spell actions route through `SpellCheckCore`;
- `Ctrl+.` provider and commands remain registered;
- tests assert changed content, decoration counts, persistence, and Monaco ownership.

- [ ] **Step 3: Update `ROADMAP.md` only after green verification**

- Change the Phase 4.4 item from `🔜 ... next up` to `✅ ... implemented, pending release`.
- Record direct suggestions, ordinary actions, clicked-word targeting, `Ctrl+.` retention, smoke coverage, and falsification.
- Change the top NEXT ACTION paragraph to say implementation is complete and the next release decision is pending.
- Do not call it shipped, assign a version, add a release date, or start MSIX work.

- [ ] **Step 4: Validate and commit the roadmap update**

```powershell
git diff --check
git add ROADMAP.md
git commit -m "docs: record right-click spell corrections"
```

- [ ] **Step 5: Run final cheap gates**

```powershell
npm run typecheck
git diff --check master...HEAD
git status --short --branch
```

Expected: typecheck and diff check PASS. Only the repository's pre-existing untracked `.agents/` and `AGENTS.md` remain, untouched.

## Final Review and Handoff

1. Run a fresh whole-branch review against `master`.
2. Fix and reverify every valid finding on the feature branch.
3. Push and open a pull request when continuing the approved build workflow.
4. Inspect every required CI job. If any required check is not green, do not merge.
5. Merge and delete the stale feature branch only after green CI and explicit lifecycle approval.
6. Use the repository `release-checklist` skill for any later version bump, package, tag, or GitHub release.
