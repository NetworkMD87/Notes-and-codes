# Quality, Scale & Keyboard Access — Accessible Surfaces Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the accessible-interaction half of Phase 4.6: reusable dialog focus behavior, keyboard- and screen-reader-correct Settings and modal overlays, semantic custom menus and editor tabs, explicit file-format selectors, and deterministic fuzzy Command Palette search.

**Architecture:** Keep `OverlayRegistration` as the sole owner of topmost Escape dismissal and add a dependency-free `DialogController` that decorates existing panels, traps Tab, and restores focus through an injected editor fallback. Reuse one pure roving-index helper for Settings, menus, and tabs, but keep each widget's DOM semantics local; isolate Command Palette ranking in pure `commandSearch.ts` so the later Quick Open performance slice can evolve independently.

**Tech Stack:** Electron 31, TypeScript 5.5, imperative renderer DOM, Monaco Editor, Vitest 2 with jsdom for DOM units, and Playwright Electron smoke tests on Windows.

## Global Constraints

- This plan implements only approved design sections A and the accessibility-specific parts of E; workspace exclusions, Quick Open performance work, search cancellation, recovery/preview efficiency, and scoped Find in Files belong to later plans.
- No visual redesign, new theme system, or new chrome conventions.
- No `node:*`, Electron, filesystem, `Buffer`, or OS access enters `src/renderer/`.
- `OverlayRegistration` remains the only overlay-stack registration mechanism; no migrated surface adds a private Escape listener.
- Changes to context isolation, renderer sandboxing, sender validation, atomic-write semantics, and the one-owner-per-keybinding rule are out of scope.
- No new runtime dependency is required.
- Existing pointer behavior, middle-click tab close, tab dragging, topmost-first Escape, Settings hotkey capture, Monaco `Shift+F10`, and spell-check `Ctrl+.` behavior remain load-bearing.
- New command or shortcut entries update `src/renderer/helpContent.ts` in the same task.
- The version remains unchanged until every Phase 4.6 implementation slice is complete and approved; this plan does not package, tag, publish, or mark v1.19.0 released.
- Every task follows TDD, names the expected red failure, performs explicit falsification, passes a focused reviewer gate, and commits only its own coherent change.
- Smoke tests use an isolated `--user-data-dir`, launch the built app, clear `ELECTRON_RUN_AS_NODE`, and retain the configured retry policy except during deliberate falsification.
- Semantic smoke assertions target the role, accessible name, selected/pressed state, active descendant, or restored focus consumed by assistive technology; visibility alone is not sufficient.

---

## File and Responsibility Map

- Create `src/renderer/dialogController.ts`: dialog semantics, initial focus, Tab containment, re-entrant opener retention, idempotent close, and fallback focus.
- Create `src/renderer/rovingIndex.ts`: pure vertical/horizontal Home/End/arrow navigation with wrapping and disabled-item skipping.
- Create `src/renderer/commandSearch.ts`: pure deterministic Command Palette ranking across label, id, and shortcut hint.
- Create `tests/unit/dialogController.test.ts`, `tests/unit/rovingIndex.test.ts`, `tests/unit/commandSearch.test.ts`, `tests/unit/statusBar.test.ts`, and `tests/unit/tabBar.test.ts`: focused behavior contracts.
- Modify `src/renderer/overlayManager.ts` only if the dialog tests expose a missing read-only seam; do not move Escape ownership.
- Modify `src/renderer/editorPane.ts`: add the narrow public `focus(): void` fallback used by `main.ts`.
- Modify `src/renderer/settingsPanel.ts`: stable dialog shell, vertical tablist, labelled controls, theme radio semantics, named swatches/toggles, and recorder-safe category switching.
- Modify `src/renderer/quickOpen.ts`, `findInFiles.ts`, `helpOverlay.ts`, `inputOverlay.ts`, `diffPicker.ts`, `pasteHistoryPicker.ts`, `snippetPicker.ts`, `snippetManager.ts`, `fileHistoryPanel.ts`, and `personalDictionaryPanel.ts`: adopt `DialogController` and add stable titles/native controls without changing feature logic.
- Modify `src/renderer/contextMenu.ts`, `folderMode.ts`, and `sidebar.ts`: semantic menu, keyboard navigation/activation, and focus return for keyboard-opened app menus.
- Modify `src/renderer/tabBar.ts` and `main.ts`: semantic non-nested tab controls, close-button focus behavior, and one app-wide `Ctrl+PageUp`/`Ctrl+PageDown` owner.
- Modify `src/renderer/statusBar.ts`: native encoding and line-ending selectors.
- Modify `src/renderer/commandPalette.ts`: dialog/combobox/listbox semantics and pure ranked matching.
- Modify `src/renderer/index.html`: semantic-control-compatible styling and screen-reader-only utility, preserving current visual density.
- Modify `src/renderer/helpContent.ts`: document the two new app-wide tab shortcuts.
- Modify `tests/smoke/settingsHelper.ts`, `settings.spec.ts`, `overlay-dismiss.spec.ts`, `sidebar.spec.ts`, `tabs.spec.ts`, `app.spec.ts`, and `palette.spec.ts`: real-process accessibility and regression evidence.
- Create `tests/smoke/accessibility-overlays.spec.ts`: one matrix that proves every migrated modal exposes a name, initial focus, containment, and focus return through a real Electron window.

---

### Task 1: Dialog/focus and roving-index foundations

**Files:**
- Create: `src/renderer/dialogController.ts`
- Create: `src/renderer/rovingIndex.ts`
- Create: `tests/unit/dialogController.test.ts`
- Create: `tests/unit/rovingIndex.test.ts`
- Modify: `src/renderer/editorPane.ts`

**Interfaces:**
- Consumes: `OverlayRegistration.open(close: () => void): void` and `OverlayRegistration.release(): void` from `src/renderer/overlayManager.ts`.
- Produces: `DialogOpenOptions`, `DialogController.open(options): void`, `DialogController.close(): void`, `DialogController.isOpen(): boolean`, `focusableElements(panel): HTMLElement[]`, `RovingOrientation`, and `moveRovingIndex(current, enabled, key, orientation): number | null`.
- Produces: `EditorPane.focus(): void`, called only through the renderer-local `focusActiveEditor` closure introduced in Task 2.

- [ ] **Step 1: Add failing dialog lifecycle and focus tests**

Create `tests/unit/dialogController.test.ts` with the jsdom directive and concrete helpers:

```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DialogController } from '../../src/renderer/dialogController'
import { handleEscape, openCount } from '../../src/renderer/overlayManager'

const escape = () => handleEscape({ key: 'Escape', preventDefault: vi.fn(), stopPropagation: vi.fn() })
const key = (target: HTMLElement, value: string, shiftKey = false) =>
  target.dispatchEvent(new KeyboardEvent('keydown', { key: value, shiftKey, bubbles: true, cancelable: true }))

function fixture() {
  const opener = document.createElement('button'); opener.textContent = 'Open'
  const panel = document.createElement('section')
  const title = document.createElement('h2'); title.id = 'dialog-title'; title.textContent = 'Example'
  const first = document.createElement('button'); first.textContent = 'First'
  const last = document.createElement('button'); last.textContent = 'Last'
  panel.append(title, first, last); document.body.append(opener, panel); opener.focus()
  const fallback = vi.fn()
  const controller = new DialogController(fallback)
  return { opener, panel, first, last, fallback, controller }
}

describe('DialogController', () => {
  const baseline = openCount()
  afterEach(() => {
    while (openCount() > baseline) escape()
    document.body.replaceChildren()
  })

  it('applies dialog semantics, focuses the requested target, and wraps Tab both ways', () => {
    const h = fixture()
    h.controller.open({ panel: h.panel, labelledBy: 'dialog-title', initialFocus: h.first, requestClose: () => h.controller.close() })
    expect(h.panel.getAttribute('role')).toBe('dialog')
    expect(h.panel.getAttribute('aria-modal')).toBe('true')
    expect(h.panel.getAttribute('aria-labelledby')).toBe('dialog-title')
    expect(document.activeElement).toBe(h.first)
    h.last.focus(); key(h.last, 'Tab'); expect(document.activeElement).toBe(h.first)
    h.first.focus(); key(h.first, 'Tab', true); expect(document.activeElement).toBe(h.last)
  })

  it('handles one/no focusable controls without allowing focus to escape', () => {
    const h = fixture(); h.last.remove()
    h.controller.open({ panel: h.panel, labelledBy: 'dialog-title', requestClose: () => h.controller.close() })
    key(h.first, 'Tab'); expect(document.activeElement).toBe(h.first)
    h.first.remove(); key(h.panel, 'Tab'); expect(document.activeElement).toBe(h.panel)
  })

  it('restores a usable opener and falls back when it is detached or hidden', () => {
    const h = fixture()
    h.controller.open({ panel: h.panel, labelledBy: 'dialog-title', requestClose: () => h.controller.close() })
    h.controller.close(); expect(document.activeElement).toBe(h.opener); expect(h.fallback).not.toHaveBeenCalled()
    h.opener.focus(); h.controller.open({ panel: h.panel, labelledBy: 'dialog-title', requestClose: () => h.controller.close() })
    h.opener.remove(); h.controller.close(); expect(h.fallback).toHaveBeenCalledTimes(1)
    const hidden = fixture(); hidden.controller.open({ panel: hidden.panel, labelledBy: 'dialog-title', requestClose: () => hidden.controller.close() })
    const hiddenAncestor = document.createElement('div'); hidden.opener.before(hiddenAncestor); hiddenAncestor.append(hidden.opener)
    hiddenAncestor.setAttribute('aria-hidden', 'true')
    hidden.controller.close(); expect(hidden.fallback).toHaveBeenCalledTimes(1)
  })

  it('keeps the original opener across re-entrant open and closes idempotently', () => {
    const h = fixture(); const second = document.createElement('button'); document.body.appendChild(second)
    h.controller.open({ panel: h.panel, labelledBy: 'dialog-title', requestClose: () => h.controller.close() })
    second.focus()
    h.controller.open({ panel: h.panel, labelledBy: 'dialog-title', initialFocus: h.last, requestClose: () => h.controller.close() })
    expect(openCount()).toBe(baseline + 1)
    h.controller.close(); h.controller.close()
    expect(document.activeElement).toBe(h.opener)
    expect(openCount()).toBe(baseline)
  })

  it('lets a component veto the first Escape without corrupting its overlay slot', () => {
    const h = fixture(); let recording = true
    h.controller.open({
      panel: h.panel,
      labelledBy: 'dialog-title',
      requestClose: () => { if (recording) recording = false; else h.controller.close() },
    })
    escape(); expect(h.controller.isOpen()).toBe(true); expect(openCount()).toBe(baseline + 1)
    escape(); expect(h.controller.isOpen()).toBe(false); expect(openCount()).toBe(baseline)
  })
})
```

- [ ] **Step 2: Add failing pure roving-navigation tests**

Create `tests/unit/rovingIndex.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { moveRovingIndex } from '../../src/renderer/rovingIndex'

describe('moveRovingIndex', () => {
  const enabled = [true, false, true, true]
  it('moves and wraps vertically while skipping disabled entries', () => {
    expect(moveRovingIndex(0, enabled, 'ArrowDown', 'vertical')).toBe(2)
    expect(moveRovingIndex(3, enabled, 'ArrowDown', 'vertical')).toBe(0)
    expect(moveRovingIndex(0, enabled, 'ArrowUp', 'vertical')).toBe(3)
  })
  it('maps horizontal arrows and Home/End deterministically', () => {
    expect(moveRovingIndex(0, enabled, 'ArrowRight', 'horizontal')).toBe(2)
    expect(moveRovingIndex(2, enabled, 'ArrowLeft', 'horizontal')).toBe(0)
    expect(moveRovingIndex(2, enabled, 'Home', 'horizontal')).toBe(0)
    expect(moveRovingIndex(0, enabled, 'End', 'horizontal')).toBe(3)
  })
  it('ignores keys for the other orientation and returns null with no enabled item', () => {
    expect(moveRovingIndex(0, enabled, 'ArrowRight', 'vertical')).toBeNull()
    expect(moveRovingIndex(0, [false, false], 'End', 'vertical')).toBeNull()
  })
})
```

- [ ] **Step 3: Run the focused tests and observe the intended red state**

Run:

```powershell
npm test -- dialogController rovingIndex
```

Expected: FAIL because `src/renderer/dialogController.ts` and `src/renderer/rovingIndex.ts` do not exist.

- [ ] **Step 4: Implement the dialog controller**

Create `src/renderer/dialogController.ts` with this public shape and behavior:

```ts
import { OverlayRegistration } from './overlayManager'

export interface DialogOpenOptions {
  panel: HTMLElement
  labelledBy: string
  describedBy?: string
  initialFocus?: HTMLElement | null
  requestClose: () => void
}

const FOCUSABLE = [
  'button:not([disabled])', 'input:not([disabled])', 'select:not([disabled])',
  'textarea:not([disabled])', 'a[href]', '[tabindex]:not([tabindex="-1"])',
].join(',')

export function focusableElements(panel: HTMLElement): HTMLElement[] {
  return [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(el => (
    el.isConnected && !el.closest('[hidden],[aria-hidden="true"]')
  ))
}

export class DialogController {
  private readonly registration = new OverlayRegistration()
  private panel: HTMLElement | null = null
  private opener: HTMLElement | null = null
  private opened = false

  constructor(private readonly fallbackFocus: () => void) {}

  open(options: DialogOpenOptions): void {
    if (!this.opened) this.opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (this.panel !== options.panel) this.panel?.removeEventListener('keydown', this.onKeyDown)
    this.panel = options.panel
    this.panel.setAttribute('role', 'dialog')
    this.panel.setAttribute('aria-modal', 'true')
    this.panel.setAttribute('aria-labelledby', options.labelledBy)
    if (options.describedBy) this.panel.setAttribute('aria-describedby', options.describedBy)
    else this.panel.removeAttribute('aria-describedby')
    this.panel.tabIndex = -1
    this.panel.removeEventListener('keydown', this.onKeyDown)
    this.panel.addEventListener('keydown', this.onKeyDown)
    this.opened = true
    this.registration.open(options.requestClose)
    const target = this.usable(options.initialFocus) ? options.initialFocus! : focusableElements(this.panel)[0] ?? this.panel
    target.focus()
  }

  close(): void {
    if (!this.opened) return
    this.opened = false
    this.registration.release()
    this.panel?.removeEventListener('keydown', this.onKeyDown)
    const opener = this.opener
    this.panel = null; this.opener = null
    if (this.usable(opener)) opener.focus()
    else this.fallbackFocus()
  }

  isOpen(): boolean { return this.opened }

  private usable(el: HTMLElement | null | undefined): el is HTMLElement {
    if (!el?.isConnected || el.matches(':disabled') || el.closest('[hidden],[aria-hidden="true"],[inert]')) return false
    for (let current: HTMLElement | null = el; current; current = current.parentElement) {
      const style = getComputedStyle(current)
      if (style.display === 'none' || style.visibility === 'hidden') return false
    }
    return true
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Tab' || !this.panel) return
    const items = focusableElements(this.panel)
    if (!items.length) { event.preventDefault(); this.panel.focus(); return }
    const active = document.activeElement
    const edge = event.shiftKey ? items[0] : items[items.length - 1]
    if (!this.panel.contains(active) || active === edge) {
      event.preventDefault()
      ;(event.shiftKey ? items[items.length - 1] : items[0]).focus()
    }
  }
}
```

Do not listen for Escape here. Components pass their existing close callback through `requestClose`, which is what preserves Settings' recorder veto and `OverlayRegistration`'s topmost-first order.

- [ ] **Step 5: Implement the pure roving-index helper**

Create `src/renderer/rovingIndex.ts`:

```ts
export type RovingOrientation = 'vertical' | 'horizontal'

export function moveRovingIndex(
  current: number,
  enabled: readonly boolean[],
  key: string,
  orientation: RovingOrientation,
): number | null {
  const first = enabled.findIndex(Boolean)
  if (first < 0) return null
  if (key === 'Home') return first
  if (key === 'End') {
    for (let i = enabled.length - 1; i >= 0; i--) if (enabled[i]) return i
  }
  const forward = orientation === 'vertical' ? key === 'ArrowDown' : key === 'ArrowRight'
  const backward = orientation === 'vertical' ? key === 'ArrowUp' : key === 'ArrowLeft'
  if (!forward && !backward) return null
  const direction = forward ? 1 : -1
  for (let step = 1; step <= enabled.length; step++) {
    const index = (current + direction * step + enabled.length) % enabled.length
    if (enabled[index]) return index
  }
  return first
}
```

- [ ] **Step 6: Add the narrow Monaco focus fallback**

Add to the public methods in `src/renderer/editorPane.ts`:

```ts
focus(): void { this.editor.focus() }
```

Do not expose the Monaco editor object and do not register a keybinding here.

- [ ] **Step 7: Verify, falsify, review, and commit the foundation**

Run:

```powershell
npm test -- dialogController rovingIndex overlayManager
npm run typecheck
```

Expected: PASS.

Falsification: temporarily remove the Shift+Tab edge branch from `DialogController.onKeyDown`; rerun `npm test -- dialogController`; confirm the backward-wrap assertion fails with focus still on the first button. Restore the branch and rerun green.

Reviewer gate: inspect the task diff and reject it if `dialogController.ts` owns Escape, mutates visibility/content, retains a detached opener after close, or permits more than one overlay stack entry during re-entrant `open()`.

```powershell
git add src/renderer/dialogController.ts src/renderer/rovingIndex.ts src/renderer/editorPane.ts tests/unit/dialogController.test.ts tests/unit/rovingIndex.test.ts
git commit -m "feat(accessibility): add dialog focus foundation"
```

---

### Task 2: Migrate Settings as the proving dialog

**Files:**
- Modify: `src/renderer/settingsPanel.ts`
- Modify: `src/renderer/main.ts`
- Modify: `src/renderer/index.html`
- Modify: `tests/smoke/settingsHelper.ts`
- Modify: `tests/smoke/settings.spec.ts`
- Modify: `tests/smoke/overlay-dismiss.spec.ts`

**Interfaces:**
- Consumes: `new DialogController(fallbackFocus)`, `DialogController.open(DialogOpenOptions)`, `DialogController.close()`, and `moveRovingIndex(...)` from Task 1.
- Produces: `SettingsDeps.focusEditor(): void`; stable ids `settings-title`, `settings-close`, `settings-tab-<category>`, and `settings-panel-<category>`; native or ARIA state on every Settings control.
- Preserves: `SettingsPanel.open(category?: SettingsCategory): void`, `windowLostFocus(): void`, and the first-Escape-cancels-recorder/second-Escape-closes-dialog contract.

- [ ] **Step 1: Add the failing Settings accessibility smoke contract**

Change `tests/smoke/settingsHelper.ts` to open from the real toolbar button, then select a category by role:

```ts
export async function openSettings(win: Page, category = 'Appearance') {
  await win.getByRole('button', { name: 'Settings' }).click()
  const dialog = win.getByRole('dialog', { name: 'Settings' })
  await expect(dialog).toBeVisible()
  if (category !== 'Appearance') await dialog.getByRole('tab', { name: category }).click()
  await expect(dialog.getByRole('tab', { name: category })).toHaveAttribute('aria-selected', 'true')
}
```

Add this test near the start of `tests/smoke/settings.spec.ts`:

```ts
test('Settings: dialog semantics, vertical tabs, focus trap, labels, and focus return', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-settings-a11y-')
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  const win = await app.firstWindow()
  await expect(win.locator('body')).toHaveAttribute('data-booted', 'true')
  const opener = win.getByRole('button', { name: 'Settings' })
  await opener.focus(); await opener.press('Enter')
  const dialog = win.getByRole('dialog', { name: 'Settings' })
  const appearance = dialog.getByRole('tab', { name: 'Appearance' })
  await expect(appearance).toBeFocused()
  await win.keyboard.press('ArrowDown')
  await expect(dialog.getByRole('tab', { name: 'Font' })).toBeFocused()
  await expect(dialog.getByRole('tab', { name: 'Font' })).toHaveAttribute('aria-selected', 'true')
  await win.keyboard.press('End')
  await expect(dialog.getByRole('tab', { name: 'Integration' })).toHaveAttribute('aria-selected', 'true')
  await win.keyboard.press('Home')
  await expect(appearance).toHaveAttribute('aria-selected', 'true')
  await expect(dialog.getByRole('radiogroup', { name: 'Theme' })).toBeVisible()
  await expect(dialog.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', /true|false/)
  await expect(dialog.getByRole('button', { name: /accent/i }).first()).toHaveAttribute('aria-pressed', /true|false/)
  const close = dialog.getByRole('button', { name: 'Close Settings' })
  await close.focus(); await win.keyboard.press('Tab')
  await expect(appearance).toBeFocused()
  await win.keyboard.press('Shift+Tab')
  await expect(close).toBeFocused()
  await close.click()
  await expect(opener).toBeFocused()
})
```

Extend the existing recorder regression in `tests/smoke/overlay-dismiss.spec.ts` so it asserts the dialog remains visible after the first Escape, closes on the second, and the toolbar opener regains focus.

- [ ] **Step 2: Build and run the new smoke test to prove it is red**

Run:

```powershell
npm run build
Remove-Item env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npx playwright test tests/smoke/settings.spec.ts --grep "dialog semantics" --retries=0
```

Expected: FAIL because Settings has no dialog role, tabs, named close button, or focus restoration.

- [ ] **Step 3: Build a stable Settings shell and use the dialog controller**

Add `focusEditor: () => void` to `SettingsDeps`. Replace `reg` with `private readonly dialog: DialogController`, and create stable `box`, `nav`, `detail`, title, and close-button fields in the constructor. The shell must follow this structure:

```ts
const box = document.createElement('section'); box.className = 'settings-box'
const heading = document.createElement('h2'); heading.id = 'settings-title'; heading.className = 'sr-only'; heading.textContent = 'Settings'
const close = document.createElement('button'); close.id = 'settings-close'; close.className = 'settings-close'
close.type = 'button'; close.setAttribute('aria-label', 'Close Settings'); close.textContent = '✕'
close.onclick = () => this.requestClose()
this.nav = document.createElement('div'); this.nav.className = 'settings-nav'; this.nav.setAttribute('role', 'tablist')
this.nav.setAttribute('aria-orientation', 'vertical'); this.nav.setAttribute('aria-label', 'Settings categories')
this.detail = document.createElement('div'); this.detail.className = 'settings-detail'
box.append(heading, close, this.nav, this.detail); this.host.appendChild(box)
this.dialog = new DialogController(this.d.focusEditor)
```

`open()` updates the category and contents, removes `hidden`, then calls:

```ts
this.dialog.open({
  panel: this.box,
  labelledBy: 'settings-title',
  initialFocus: this.nav.querySelector<HTMLElement>(`#settings-tab-${this.active}`),
  requestClose: () => this.requestClose(),
})
```

Implement `requestClose()` so a live recorder calls `cancelRecording()` and returns; otherwise hide the host and call `this.dialog.close()`. Do not call `dialog.close()` during the recorder veto.

- [ ] **Step 4: Render vertical tabs and a labelled tabpanel**

Render category controls as real sibling buttons, not clickable divs:

```ts
const tab = document.createElement('button')
tab.type = 'button'; tab.className = 'settings-cat'; tab.id = `settings-tab-${category.id}`
tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', `settings-panel-${category.id}`)
tab.setAttribute('aria-selected', String(category.id === this.active))
tab.tabIndex = category.id === this.active ? 0 : -1
tab.textContent = category.label
tab.onclick = () => this.activateCategory(category.id, true)
tab.onkeydown = event => {
  const tabs = [...this.nav.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
  const next = moveRovingIndex(tabs.indexOf(tab), tabs.map(() => true), event.key, 'vertical')
  if (next === null) return
  event.preventDefault(); this.activateCategory(CATEGORIES[next].id, true)
}
```

`activateCategory()` must call `stopRecording()` before replacing detail, update every tab's `aria-selected` and `tabIndex`, render one `role="tabpanel"` with the matching `aria-labelledby`, and focus the newly active tab only for keyboard/click activation—not during background re-render after a setting changes.

- [ ] **Step 5: Connect every Settings control to a real accessible name/state**

Give `row()` an id-producing control binder rather than leaving `<label>` unattached:

```ts
private labelledRow(labelText: string, control: HTMLInputElement | HTMLSelectElement): HTMLDivElement {
  const row = document.createElement('div'); row.className = 'appearance-row'
  const label = document.createElement('label'); const id = `setting-${this.controlId++}`
  control.id = id; label.htmlFor = id; label.textContent = labelText
  row.append(label, control); return row
}
```

Apply these exact semantics while preserving callbacks and values:

- Theme container: `role="radiogroup"`, `aria-labelledby` pointing to the Theme heading; each theme row becomes `button type="button" role="radio" aria-checked="true|false"`.
- Accent swatches: real `button` elements named `Accent <colour name>` with `aria-pressed`; Default is named `Use theme default accent` and exposes pressed state.
- Existing binary settings: native labelled checkboxes with native `disabled` where applicable.
- Font, size, spell language, and custom-font inputs: `<label for>` connections; the spelling note becomes the controls' `aria-describedby` target.
- Hotkey Record: `aria-pressed` while armed and `aria-describedby` pointing to concise recorder instructions.
- Decorative theme dots and accent-current preview: `aria-hidden="true"`.

- [ ] **Step 6: Inject the editor fallback and preserve styling**

In `src/renderer/main.ts`, add once after `paneFor`:

```ts
function focusActiveEditor(): void { paneFor(view.focusedPane()).focus() }
```

Pass `focusEditor: focusActiveEditor` in `settingsDeps`. In `src/renderer/index.html`, add `.sr-only`, `.settings-close`, native button resets for `.settings-cat`, `.appearance-theme`, and `.swatch`, and `:focus-visible` rules using `var(--accent)`. Preserve `.settings-box` dimensions, flex layout, theme cards, swatch grid, and motion tokens.

- [ ] **Step 7: Verify Settings, perform falsification, and pass the reviewer gate**

Run:

```powershell
npm run build
npm test -- dialogController rovingIndex overlayManager
Remove-Item env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npx playwright test tests/smoke/settings.spec.ts tests/smoke/overlay-dismiss.spec.ts
```

Expected: PASS.

Falsification: temporarily remove `aria-selected` updates from `activateCategory`; run the focused Settings test with `--retries=0`; confirm it fails after ArrowDown on the Font tab's selected state. Restore and rerun green. Then temporarily replace `requestClose` with an unconditional close and confirm the existing recorder two-Escape test fails on the first Escape; restore and rerun green.

Reviewer gate: inspect the rendered structure and task diff. Reject nested interactive controls, title-only labels, focus movement during a normal setting re-render, a recorder listener surviving category replacement, or visual changes outside semantic-control resets/focus rings.

```powershell
git add src/renderer/settingsPanel.ts src/renderer/main.ts src/renderer/index.html tests/smoke/settingsHelper.ts tests/smoke/settings.spec.ts tests/smoke/overlay-dismiss.spec.ts
git commit -m "feat(accessibility): make Settings keyboard complete"
```

---

### Task 3: Migrate search, Help/About, and input/confirm dialogs

**Files:**
- Modify: `src/renderer/quickOpen.ts`
- Modify: `src/renderer/findInFiles.ts`
- Modify: `src/renderer/helpOverlay.ts`
- Modify: `src/renderer/inputOverlay.ts`
- Modify: `src/renderer/folderMode.ts`
- Modify: `src/renderer/main.ts`
- Modify: `src/renderer/index.html`
- Create: `tests/smoke/accessibility-overlays.spec.ts`
- Modify: `tests/smoke/overlay-dismiss.spec.ts`

**Interfaces:**
- Consumes: `DialogController` and `focusActiveEditor()` from Tasks 1-2.
- Produces: `QuickOpenDeps.focusEditor`, `FindInFilesDeps.focusEditor`, `new HelpOverlay(focusEditor)`, and `InputOverlayOptions { initial?: string; confirmLabel?: string; focusFallback: () => void }`.
- Preserves: current `open()`, query retention, Arrow/Enter selection, search result caps, input trimming, delayed Enter arming for confirm dialogs, and all topmost Escape behavior.

- [ ] **Step 1: Add a real modal semantics/containment smoke matrix**

Create `tests/smoke/accessibility-overlays.spec.ts` with a shared assertion:

```ts
import { test, expect } from './smokeTest'
import type { Locator, Page } from '@playwright/test'

async function expectDialog(win: Page, name: string, initial: Locator, last: Locator) {
  const dialog = win.getByRole('dialog', { name })
  await expect(dialog).toBeVisible(); await expect(initial).toBeFocused()
  await last.focus(); await win.keyboard.press('Tab'); await expect(initial).toBeFocused()
  await initial.focus(); await win.keyboard.press('Shift+Tab'); await expect(last).toBeFocused()
  return dialog
}

test('Quick Open, Find in Files, and Help are named modal dialogs with trapped focus', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-overlay-a11y-')
  const root = smoke.tempDir('notes-overlay-root-')
  const app = await smoke.launch({ args: ['out/main/index.js', root, `--user-data-dir=${userDataDir}`] })
  const win = await app.firstWindow(); await expect(win.locator('body')).toHaveAttribute('data-booted', 'true')

  await win.keyboard.press('Control+P')
  await expectDialog(win, 'Quick Open', win.getByRole('combobox', { name: 'Quick Open' }), win.getByRole('combobox', { name: 'Quick Open' }))
  await win.keyboard.press('Escape')

  await win.keyboard.press('Control+Shift+F')
  await expectDialog(win, 'Find in Files', win.getByRole('searchbox', { name: 'Find in Files' }), win.getByRole('button', { name: 'Whole word' }))
  await win.keyboard.press('Escape')

  await win.keyboard.press('Control+Shift+P'); await win.locator('#palette input').fill('Help: Shortcuts'); await win.keyboard.press('Enter')
  await expectDialog(win, 'Shortcuts & Commands', win.getByRole('searchbox', { name: 'Search commands' }), win.getByRole('button', { name: 'Close Shortcuts & Commands' }))
})
```

Add a second test that creates a dirty tab, invokes Close Tab, and asserts the confirm surface is `role=dialog` named by its visible message, initially focuses `Discard`, traps to `Cancel`, resolves false on Escape, and restores focus to the invoking tab close button while it remains connected.

- [ ] **Step 2: Build and verify the new matrix fails for semantics**

Run:

```powershell
npm run build
Remove-Item env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npx playwright test tests/smoke/accessibility-overlays.spec.ts --retries=0
```

Expected: FAIL on the first `getByRole('dialog', { name: 'Quick Open' })` assertion.

- [ ] **Step 3: Migrate Quick Open and Find in Files without touching their search algorithms**

Add `focusEditor: () => void` to both dependency interfaces. Give each generated box a stable screen-reader-only `<h2>` and instantiate one `DialogController`. Quick Open's input becomes:

```ts
title.id = 'quick-open-title'; title.textContent = 'Quick Open'; title.className = 'sr-only'
this.input.type = 'search'; this.input.setAttribute('role', 'combobox')
this.input.setAttribute('aria-label', 'Quick Open')
this.input.setAttribute('aria-controls', 'quick-open-results')
this.input.setAttribute('aria-expanded', 'true')
this.listEl.id = 'quick-open-results'; this.listEl.setAttribute('role', 'listbox')
```

Find in Files' visible/hidden title is `Find in Files`; its query input is `type="search"` with accessible name `Find in Files`; case and whole-word buttons expose `aria-pressed`, not title-only state. In each `open()`, remove the direct `reg.open(...)` and call `dialog.open(...)` after the host is visible. In each `close()`, keep query/search invalidation exactly where it is, hide the host, then call `dialog.close()`.

Do not change `rankFiles`, `searchBuffers`, IPC, debouncing, or cancellation in this task.

- [ ] **Step 4: Migrate Help/About with mode-specific names and initial focus**

Change the constructor to `constructor(private readonly focusEditor: () => void)`. Give each rebuilt title a stable id. `openShortcuts()` opens a dialog named `Shortcuts & Commands` with the search input as initial focus; `openAbout()` opens a dialog named `About Notes & Codes` with the first external-link button, or its close button when no link is available, as initial focus. Name the close button `Close <current title>`. `show()` delegates to `DialogController.open`; `close()` hides first and then delegates to `DialogController.close()`.

- [ ] **Step 5: Replace raw `pushOverlay` input dialogs with `DialogController`**

Use one options object while retaining compatibility at call sites:

```ts
export interface InputOverlayOptions {
  initial?: string
  confirmLabel?: string
  focusFallback: () => void
}

export function promptInput(title: string, options: InputOverlayOptions): Promise<string | null>
export function confirmDialog(message: string, options: InputOverlayOptions): Promise<boolean>
```

Build each box as `section`, assign the visible label an id, connect the text field with `label.htmlFor`, and open with `new DialogController(options.focusFallback)`. `done()` must be settlement-idempotent, remove the DOM, then call `dialog.close()` exactly once. Keep Enter on prompt, and keep `requestAnimationFrame` before arming/focusing the destructive confirmation so the opening Enter cannot confirm it.

Update every call in `main.ts` and `folderMode.ts` to use named options, for example:

```ts
await confirmDialog(`"${b.title}" has unsaved changes. Discard and close?`, {
  confirmLabel: 'Discard', focusFallback: focusActiveEditor,
})
await promptInput('Snippet name', { focusFallback: focusActiveEditor })
```

Add `focusEditor` to `FolderModeDeps` and pass it to its New File/New Folder/Rename/Delete input/confirm calls. Do not put a module-global fallback in `inputOverlay.ts`.

- [ ] **Step 6: Wire fallbacks in `main.ts` and retain overlay regressions**

Pass `focusActiveEditor` to `new HelpOverlay`, `FindInFilesDeps`, and `FolderModeDeps`; have `FolderMode` pass it into `QuickOpenDeps`. Extend `tests/smoke/overlay-dismiss.spec.ts` to confirm re-opening Quick Open and Help while visible still leaves exactly one effective Escape close and the next Escape reaches Monaco.

- [ ] **Step 7: Verify, falsify, review, and commit core dialog migrations**

Run:

```powershell
npm run build
npm test -- dialogController overlayManager fuzzy findInFilesModel
Remove-Item env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npx playwright test tests/smoke/accessibility-overlays.spec.ts tests/smoke/overlay-dismiss.spec.ts tests/smoke/help.spec.ts tests/smoke/find-in-files.spec.ts
```

Expected: PASS.

Falsification: temporarily remove `this.dialog.close()` from Quick Open's close path; run the named accessibility smoke with `--retries=0`; confirm focus does not return to the editor/opener and a later Tab remains trapped or the overlay count regression fails. Restore and rerun green. Separately move confirm's key listener before `requestAnimationFrame` and confirm the existing Enter-open confirmation regression goes red; restore.

Reviewer gate: reject search/performance changes, direct `pushOverlay`, private Escape listeners, input API calls without a real fallback, or a dialog title that exists only as an inaccessible placeholder/title attribute.

```powershell
git add src/renderer/quickOpen.ts src/renderer/findInFiles.ts src/renderer/helpOverlay.ts src/renderer/inputOverlay.ts src/renderer/folderMode.ts src/renderer/main.ts src/renderer/index.html tests/smoke/accessibility-overlays.spec.ts tests/smoke/overlay-dismiss.spec.ts
git commit -m "feat(accessibility): migrate core modal dialogs"
```

---

### Task 4: Migrate pickers, managers, history, and personal dictionary

**Files:**
- Modify: `src/renderer/diffPicker.ts`
- Modify: `src/renderer/pasteHistoryPicker.ts`
- Modify: `src/renderer/snippetPicker.ts`
- Modify: `src/renderer/snippetManager.ts`
- Modify: `src/renderer/fileHistoryPanel.ts`
- Modify: `src/renderer/personalDictionaryPanel.ts`
- Modify: `src/renderer/main.ts`
- Modify: `src/renderer/index.html`
- Modify: `tests/unit/personalDictionaryPanel.test.ts`
- Modify: `tests/smoke/accessibility-overlays.spec.ts`

**Interfaces:**
- Consumes: `DialogController` and `focusActiveEditor()` from Tasks 1-2.
- Produces constructor signatures `new DiffPicker(host, focusEditor)`, `new PasteHistoryPicker(host, focusEditor)`, `new SnippetPicker(host, focusEditor)`, `new SnippetManager(host, deps, focusEditor)`, `new FileHistoryPanel(host, deps, focusEditor)`, and `new PersonalDictionaryPanel(host, deps, focusEditor)`.
- Preserves all existing `open(...)` signatures, async stale-result guards, picker callbacks, history restore/diff behavior, snippet persistence, and dictionary failure behavior.

- [ ] **Step 1: Extend the failing modal matrix to every remaining surface**

Add a second test to `tests/smoke/accessibility-overlays.spec.ts`. Open surfaces through real palette/Settings commands and assert these exact role/name/initial-focus contracts one at a time, closing each with Escape before opening the next:

```ts
const openCommand = async (win: Page, query: string) => {
  await win.keyboard.press('Control+Shift+P')
  await win.locator('#palette input').fill(query)
  await win.keyboard.press('Enter')
}

await openCommand(win, 'Paste from History')
await expectDialog(win, 'Paste from History', win.getByRole('button', { name: 'Close Paste from History' }), win.getByRole('button', { name: 'Close Paste from History' }))
await win.keyboard.press('Escape')

await openCommand(win, 'Insert Snippet')
await expectDialog(win, 'Insert Snippet', win.getByRole('button', { name: 'Close Insert Snippet' }), win.getByRole('button', { name: 'Close Insert Snippet' }))
await win.keyboard.press('Escape')

await openCommand(win, 'Manage Snippets')
await expectDialog(win, 'Snippets', win.getByRole('button', { name: 'Add snippet' }), win.getByRole('button', { name: 'Close Snippets' }))
await win.keyboard.press('Escape')

await openCommand(win, 'File History')
await expectDialog(win, 'File History', win.getByRole('button', { name: 'Close File History' }), win.getByRole('button', { name: 'Close File History' }))
await win.keyboard.press('Escape')
```

Create a second tab with `Control+N`, invoke `diff`, and assert `Compare tabs` initially focuses the labelled Left select and traps through Cancel. Open Settings ▸ Editor, activate `Personal dictionary…`, and assert the nested `Personal dictionary` dialog owns focus and one Escape returns to the still-open Settings dialog rather than closing both.

- [ ] **Step 2: Build and observe the matrix fail at the first unmigrated picker**

Run:

```powershell
npm run build
Remove-Item env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npx playwright test tests/smoke/accessibility-overlays.spec.ts --grep "remaining modal" --retries=0
```

Expected: FAIL because Paste History has no named dialog or close button.

- [ ] **Step 3: Migrate Diff Picker with native labels intact**

Accept the fallback in the constructor, add a stable `h2#diff-picker-title` with text `Compare tabs`, and connect `label.htmlFor` to stable `diff-left`/`diff-right` select ids. Replace the local registration with:

```ts
this.dialog.open({
  panel: this.box,
  labelledBy: 'diff-picker-title',
  initialFocus: this.leftSel,
  requestClose: () => this.close(),
})
```

Hide before `dialog.close()`. Preserve option order, default left/right indices, Compare, Cancel, and callback timing.

- [ ] **Step 4: Make Paste History and Snippet pickers keyboard-operable dialogs**

Give each picker a stable box/header/title and named Close button. Render non-empty rows as real buttons:

```ts
const row = document.createElement('button')
row.type = 'button'; row.className = 'ph-row'
row.textContent = preview
row.setAttribute('aria-label', `Paste ${preview}`)
row.onclick = () => { const pick = this.onPick; this.close(); pick?.(text) }
```

Use the equivalent `Insert snippet <name>` name for snippet rows. Empty states remain non-interactive text, so initial focus falls back to the named Close button. Non-empty dialogs initially focus their first row. Preserve truncated visual previews and the full `title` tooltip, and invoke the pick callback only after the dialog has closed/restored focus.

- [ ] **Step 5: Migrate Snippet Manager and Personal Dictionary**

For both stable boxes, promote the visible title to a heading with an id and open via `DialogController`. Name the manager buttons `Add snippet` and `Close Snippets`; each snippet name input gets `aria-label="Snippet name: <current name>"`, each body gets `aria-label="Snippet body: <current name>"`, and Delete becomes `Delete snippet <name>`.

Personal Dictionary initially focuses its Close button while loading. Name removal buttons `Remove <word> from personal dictionary`; keep native `disabled` during removal. Preserve `openEpoch`: a close increments it before hiding and calling `dialog.close()`, so an old `list()` resolution cannot render into a later open.

Extend `tests/unit/personalDictionaryPanel.test.ts` with:

```ts
it('names word removal controls without changing sorted order', async () => {
  const panel = new PersonalDictionaryPanel(document.body, depsWithWords(['Zulu', 'alpha']), vi.fn())
  await panel.open()
  const buttons = [...document.querySelectorAll<HTMLButtonElement>('.personal-word button')]
  expect(buttons.map(button => button.getAttribute('aria-label'))).toEqual([
    'Remove alpha from personal dictionary', 'Remove Zulu from personal dictionary',
  ])
})
```

- [ ] **Step 6: Make File History display immediately and remain stale-safe**

Build a stable named box with a Close button in the constructor. On `open()`, increment an epoch, render `Loading history…`, show/open the dialog immediately, then await `listHistory`. Render only when the epoch is still current and the host is visible:

```ts
const epoch = ++this.openEpoch
this.body.textContent = 'Loading history…'
this.host.classList.remove('hidden')
this.dialog.open({ panel: this.box, labelledBy: 'file-history-title', initialFocus: this.closeButton, requestClose: () => this.close() })
const list = cur ? await window.api.listHistory(cur.path) : []
if (epoch !== this.openEpoch || this.host.classList.contains('hidden')) return
this.renderHistory(cur, list)
```

Name actions `Diff version from <relative time>` and `Restore version from <relative time>`. Preserve the exact empty states, version fetch, current-buffer snapshot behavior, and close-before-openDiff/restore order.

- [ ] **Step 7: Wire constructors and semantic-control CSS**

Pass `focusActiveEditor` to all six constructors in `main.ts`. Update CSS selectors so button rows keep the current full-width, left-aligned, border, overflow, hover, motion, and density behavior. Add their close buttons to the existing `:focus-visible` outline group. Do not change widths, result limits, sorting, persistence, or editor behavior.

- [ ] **Step 8: Verify, falsify, review, and commit the modal family**

Run:

```powershell
npm run build
npm test -- personalDictionaryPanel dialogController overlayManager snippets pasteHistory
Remove-Item env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npx playwright test tests/smoke/accessibility-overlays.spec.ts tests/smoke/overlay-dismiss.spec.ts
```

Expected: PASS.

Falsification: temporarily omit `openEpoch++` from Personal Dictionary close; run its focused unit plus the nested-dialog smoke and confirm a stale list can repaint after close/reopen. Restore and rerun. Then change a Paste History result back to a `div`; confirm the role-based row assertion fails before restoring.

Reviewer gate: compare all classes importing `OverlayRegistration` against the approved modal list. The only intentional non-dialog exception is `DiffView`, which is a full editor work surface with its existing close button/Escape contract; every listed modal must use `DialogController`, expose a stable name, and have a keyboard path to every action.

```powershell
git add src/renderer/diffPicker.ts src/renderer/pasteHistoryPicker.ts src/renderer/snippetPicker.ts src/renderer/snippetManager.ts src/renderer/fileHistoryPanel.ts src/renderer/personalDictionaryPanel.ts src/renderer/main.ts src/renderer/index.html tests/unit/personalDictionaryPanel.test.ts tests/smoke/accessibility-overlays.spec.ts
git commit -m "feat(accessibility): migrate picker and manager dialogs"
```

---

### Task 5: Add semantic custom-menu keyboard behavior

**Files:**
- Modify: `src/renderer/contextMenu.ts`
- Modify: `src/renderer/folderMode.ts`
- Modify: `src/renderer/sidebar.ts`
- Modify: `src/renderer/index.html`
- Modify: `tests/unit/rendererContextMenu.test.ts`
- Modify: `tests/smoke/sidebar.spec.ts`
- Modify: `tests/smoke/spell-check.spec.ts`

**Interfaces:**
- Consumes: `moveRovingIndex(...)` from Task 1 and existing `OverlayRegistration` Escape ownership.
- Produces: `ContextMenuItem { label: string; run: () => void; disabled?: boolean }`, `ContextMenuOptions { opener?: HTMLElement | null; focusFirst?: boolean }`, and `showContextMenu(x, y, items, options?): void`.
- Preserves: existing three-argument callers, pointer coordinates, outside click/blur dismissal, menu replacement, spell-action stale validation, Monaco `Shift+F10`, and `Ctrl+.`.

- [ ] **Step 1: Add failing jsdom semantics/navigation tests**

Extend `tests/unit/rendererContextMenu.test.ts`:

```ts
it('renders menu semantics and skips disabled rows during wrapped navigation', () => {
  const run = vi.fn()
  showContextMenu(10, 20, [
    { label: 'First', run }, { separator: true },
    { label: 'Disabled', disabled: true, run: vi.fn() },
    { label: 'Last', run },
  ], { focusFirst: true })
  const menu = document.querySelector<HTMLElement>('#ctx-menu')!
  expect(menu.getAttribute('role')).toBe('menu')
  const items = [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
  expect(document.activeElement).toBe(items[0])
  menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
  expect(document.activeElement).toBe(items[2])
  menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
  expect(document.activeElement).toBe(items[0])
  expect(menu.querySelector('[role="separator"]')).not.toBeNull()
})

it('activates with Enter/Space and restores a connected keyboard opener', () => {
  const opener = document.createElement('button'); document.body.appendChild(opener); opener.focus()
  const run = vi.fn()
  showContextMenu(0, 0, [{ label: 'Open', run }], { opener, focusFirst: true })
  const item = document.querySelector<HTMLButtonElement>('[role="menuitem"]')!
  item.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  expect(run).toHaveBeenCalledTimes(1); expect(document.activeElement).toBe(opener)
})
```

Retain the existing replacement/overlay-count test and add Home/End plus idempotent close assertions.

- [ ] **Step 2: Run the unit file and observe semantic failure**

Run `npm test -- rendererContextMenu`.

Expected: FAIL because `ContextMenuOptions`, roles, buttons, focus, and arrow navigation do not exist.

- [ ] **Step 3: Implement the menu state machine without claiming Escape**

In `showContextMenu`, set `role="menu"`, render separators with `role="separator"`, and actions as native buttons with `role="menuitem"`, native `disabled`, and roving `tabIndex`. Add one menu-local keydown handler for Up/Down/Home/End/Enter/Space only:

```ts
function move(key: string): void {
  const rows = [...menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
  const next = moveRovingIndex(
    Math.max(0, rows.indexOf(document.activeElement as HTMLButtonElement)),
    rows.map(row => !row.disabled), key, 'vertical',
  )
  if (next !== null) rows[next].focus()
}

function onMenuKeyDown(event: KeyboardEvent): void {
  if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
    event.preventDefault(); move(event.key); return
  }
  if ((event.key === 'Enter' || event.key === ' ') && document.activeElement instanceof HTMLButtonElement) {
    event.preventDefault(); document.activeElement.click()
  }
}
```

Do not add an Escape branch. `close()` removes the menu listener, releases its one registration, removes the DOM, then restores `options.opener` only when `focusFirst` was requested and the opener remains connected/enabled. Pointer callers omit the options and therefore retain pointer focus/positioning.

- [ ] **Step 4: Provide one real keyboard-owned app menu opener**

Change `SidebarDeps.onHeaderClick` to `(x, y, keyboardOpener?: HTMLElement) => void`. In the existing native header button:

```ts
header.setAttribute('aria-label', 'Switch folder')
header.onclick = event => {
  const rect = header.getBoundingClientRect()
  this.d.onHeaderClick(rect.left, rect.bottom, event.detail === 0 ? header : undefined)
}
```

Thread the optional opener through `FolderMode.folderMenu(...)` and call:

```ts
showContextMenu(x, y, items, keyboardOpener ? { opener: keyboardOpener, focusFirst: true } : undefined)
```

Do not make Monaco or its rendered text own the app menu. Existing spell right-click calls remain three-argument pointer calls.

- [ ] **Step 5: Add the real keyboard smoke and retain Monaco ownership**

In `tests/smoke/sidebar.spec.ts`, open a folder, focus the `Switch folder` header button, press Enter, and assert menu semantics/navigation/focus return:

```ts
const opener = win.getByRole('button', { name: /switch folder/i })
await opener.focus(); await opener.press('Enter')
const menu = win.getByRole('menu')
await expect(menu).toBeVisible()
await expect(menu.getByRole('menuitem').first()).toBeFocused()
await win.keyboard.press('End')
await expect(menu.getByRole('menuitem', { name: 'Close Folder' })).toBeFocused()
await win.keyboard.press('Escape')
await expect(opener).toBeFocused()
await opener.press('Enter'); await win.keyboard.press('End'); await win.keyboard.press('Enter')
await expect(win.getByRole('button', { name: 'Open Folder…' })).toBeVisible()
```

Keep the existing `tests/smoke/spell-check.spec.ts` keyboard `Shift+F10` assertion green: it must still open Monaco's menu on editor text, with no `#ctx-menu`. Keep `Ctrl+.` Quick Fix coverage green.

- [ ] **Step 6: Verify, falsify, review, and commit menu behavior**

Run:

```powershell
npm test -- rendererContextMenu spellContextMenu editorContextMenu
npm run build
Remove-Item env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npx playwright test tests/smoke/sidebar.spec.ts tests/smoke/spell-check.spec.ts
```

Expected: PASS.

Falsification: remove the `ArrowDown` path and run the sidebar test with `--retries=0`; confirm the intended item cannot receive focus/activation. Restore. Then add Escape handling to the menu-local handler and stop propagation; confirm the overlay-manager regression or LIFO test fails, then remove the private branch and rerun green.

Reviewer gate: reject non-button action rows, nested menuitem controls, focus restoration for ordinary pointer opens, or any change that routes editor `Shift+F10` away from Monaco.

```powershell
git add src/renderer/contextMenu.ts src/renderer/folderMode.ts src/renderer/sidebar.ts src/renderer/index.html tests/unit/rendererContextMenu.test.ts tests/smoke/sidebar.spec.ts tests/smoke/spell-check.spec.ts
git commit -m "feat(accessibility): add keyboard custom menus"
```

---

### Task 6: Make editor tabs semantic and add app-wide cycling shortcuts

**Files:**
- Modify: `src/renderer/tabBar.ts`
- Modify: `src/renderer/main.ts`
- Modify: `src/renderer/index.html`
- Modify: `src/renderer/helpContent.ts`
- Create: `tests/unit/tabBar.test.ts`
- Modify: `tests/smoke/tabs.spec.ts`
- Modify: `tests/unit/helpContent.test.ts`

**Interfaces:**
- Consumes: `moveRovingIndex(...)` and `EditorPane.focus()` from Task 1.
- Produces: `TabBar.focusTab(id: string): boolean`; `TabHandlers.onClose(id): void | Promise<void>` remains awaitable by the tab bar; wrapper `.tab[role=presentation]`, selection button `.tab-select[role=tab]`, and sibling `.tab-close` button.
- Produces: one `main.ts` window-level handler for `Ctrl+PageUp`/`Ctrl+PageDown`; no menu accelerator and no per-pane Monaco command.

- [ ] **Step 1: Add failing jsdom tests for structure and roving focus**

Create `tests/unit/tabBar.test.ts` with a `BufferState` factory and re-rendering handlers:

```ts
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { TabBar } from '../../src/renderer/tabBar'
import type { BufferState } from '../../src/shared/types'

const buffer = (id: string): BufferState => ({
  id, title: `${id}.txt`, filePath: null, content: '', language: 'plaintext',
  eol: 'LF', encoding: 'utf8', dirty: false,
})

it('renders a tablist with sibling tab/close buttons and one roving target', () => {
  const host = document.createElement('div'); const onSelect = vi.fn()
  const bar = new TabBar(host, { onSelect, onClose: vi.fn(), onNew: vi.fn(), onReorder: vi.fn() })
  bar.render([buffer('a'), buffer('b')], 'a')
  expect(host.getAttribute('role')).toBe('tablist')
  const wrappers = [...host.querySelectorAll<HTMLElement>('.tab')]
  expect(wrappers.every(row => row.getAttribute('role') === 'presentation')).toBe(true)
  expect(wrappers[0].children[0].getAttribute('role')).toBe('tab')
  expect(wrappers[0].querySelector('.tab-select')?.contains(wrappers[0].querySelector('.tab-close'))).toBe(false)
  expect([...host.querySelectorAll('[role="tab"]')].filter(tab => (tab as HTMLElement).tabIndex === 0)).toHaveLength(1)
  expect(host.querySelector('.tab-close')?.getAttribute('aria-label')).toBe('Close a.txt')
})

it('Left/Right/Home/End wrap, activate, and focus the destination tab', () => {
  const host = document.createElement('div'); let active = 'a'; const items = ['a', 'b', 'c'].map(buffer)
  let bar!: TabBar
  const render = (id: string) => { active = id; bar.render(items, active); bar.focusTab(id) }
  bar = new TabBar(host, { onSelect: render, onClose: vi.fn(), onNew: vi.fn(), onReorder: vi.fn() })
  render('a')
  host.querySelector<HTMLElement>('#tab-a')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
  expect(document.activeElement?.id).toBe('tab-c')
  ;(document.activeElement as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }))
  expect(document.activeElement?.id).toBe('tab-a')
})
```

Add cases proving only the selected close button has `tabIndex=0`, keyboard close focuses the newly selected neighbor after an async re-render, cancelled close leaves a valid roving target, and reorder keeps the selected tab as the sole `tabIndex=0` target.

- [ ] **Step 2: Run the unit file and observe red**

Run `npm test -- tabBar`.

Expected: FAIL because `.tab` is the interactive div, the close glyph is a span, and no tab roles/key model exist.

- [ ] **Step 3: Render non-nested semantic tab controls**

Set the container to `role="tablist"` and `aria-label="Open files"`. For every buffer, retain a draggable `.tab` presentation wrapper and render two sibling buttons:

```ts
wrapper.setAttribute('role', 'presentation')
const select = document.createElement('button')
select.type = 'button'; select.className = 'tab-select'; select.id = `tab-${b.id}`
select.setAttribute('role', 'tab'); select.setAttribute('aria-selected', String(b.id === activeId))
select.setAttribute('aria-controls', 'panes'); select.tabIndex = b.id === activeId ? 0 : -1
select.onclick = () => this.handlers.onSelect(b.id)

const close = document.createElement('button')
close.type = 'button'; close.className = 'tab-close'; close.textContent = '×'
close.setAttribute('aria-label', `Close ${b.title}`)
close.tabIndex = b.id === activeId ? 0 : -1
```

Keep badge/title inside the select button; keep close as its sibling. Preserve middle-click on the wrapper and drag data/index calculations on wrappers.

- [ ] **Step 4: Add arrow activation and keyboard-close focus transfer**

Handle keys only on `.tab-select`. Use `moveRovingIndex` horizontally, prevent default for Left/Right/Home/End, call `onSelect(destinationId)`, then `queueMicrotask(() => focusTab(destinationId))` so the caller's synchronous render has completed.

For close-button activation, capture the current wrapper index, await `handlers.onClose(id)`, inspect the newly rendered tabs, and focus the selected neighboring tab only when the closed id is absent:

```ts
private async closeFromKeyboard(id: string, oldIndex: number): Promise<void> {
  await this.handlers.onClose(id)
  if ([...this.container.querySelectorAll<HTMLElement>('.tab')].some(row => row.dataset.id === id)) return
  const selected = this.container.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')
  const tabs = [...this.container.querySelectorAll<HTMLElement>('[role="tab"]')]
  ;(selected ?? tabs[Math.min(oldIndex, tabs.length - 1)])?.focus()
}
```

Set `close.onclick` to call `closeFromKeyboard` only when `event.detail === 0`; pointer and middle-click close call the existing handler without forcing focus. Ensure an active tab always exists after the last close because `main.ts` already creates a replacement buffer.

- [ ] **Step 5: Register one app-wide cycling owner and document it**

Add a pure local `switchRelativeTab(direction: -1 | 1)` in `main.ts`:

```ts
function switchRelativeTab(direction: -1 | 1): void {
  const buffers = manager.list(); if (buffers.length < 2) return
  const current = Math.max(0, buffers.findIndex(buffer => buffer.id === manager.activeId))
  const next = (current + direction + buffers.length) % buffers.length
  manager.setActive(buffers[next].id); showActive(); scheduleSessionSave(); focusActiveEditor()
}
```

Extend the existing single `window.addEventListener('keydown', ...)` owner:

```ts
if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 'PageUp' || e.key === 'PageDown')) {
  e.preventDefault(); switchRelativeTab(e.key === 'PageUp' ? -1 : 1)
}
```

Add `Previous tab — Ctrl+PageUp` and `Next tab — Ctrl+PageDown` to `helpContent.ts`. Update `helpContent.test.ts` to assert both unique entries. Do not add Electron menu accelerators or `editor.addCommand` calls.

- [ ] **Step 6: Preserve visual chrome and add visible focus**

Update `index.html` so `.tab` retains layout/background/drag/drop styling, `.tab-select` is a transparent flex button that owns the badge/title area, and `.tab-close` is a real transparent button with the same glyph size/opacity. Add focus-visible outlines without changing tab height, padding, active border, dirty marker, badge, drag reorder, or add-tab behavior.

- [ ] **Step 7: Add real keyboard and split-view smoke coverage**

Extend `tests/smoke/tabs.spec.ts` to create three tabs and assert:

```ts
const tablist = win.getByRole('tablist', { name: 'Open files' })
const first = tablist.getByRole('tab').nth(0)
await first.focus(); await win.keyboard.press('ArrowLeft')
await expect(tablist.getByRole('tab').nth(2)).toBeFocused()
await expect(tablist.getByRole('tab').nth(2)).toHaveAttribute('aria-selected', 'true')
await win.keyboard.press('Home'); await expect(tablist.getByRole('tab').nth(0)).toBeFocused()
await win.keyboard.press('Tab'); await expect(tablist.getByRole('button', { name: /^Close / })).toBeFocused()
```

Focus pane A's Monaco textarea, press `Control+PageDown`, assert the next tab becomes selected and the textarea remains focused. Enable split view, focus pane A, press the shortcut, and assert pane A—not hidden/unfocused pane B—receives the new buffer. Close the selected tab through its named close button and assert focus lands on the newly selected neighboring tab. Retain existing mouse select, middle-click, close confirmation, and drag reorder tests.

- [ ] **Step 8: Verify, falsify, review, and commit tabs**

Run:

```powershell
npm test -- tabBar helpContent bufferManager
npm run build
Remove-Item env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npx playwright test tests/smoke/tabs.spec.ts tests/smoke/focus.spec.ts
```

Expected: PASS.

Falsification: temporarily register `Ctrl+PageDown` in `EditorPane` instead of `main.ts`; run the split-view test with `--retries=0` and confirm the hidden/last-created pane wins or the app-wide path fails. Restore the single window owner. Then nest `.tab-close` inside `.tab-select` and confirm the role/focus unit fails.

Reviewer gate: reject nested buttons, more than one `tabIndex=0` tab, inactive close buttons in sequential Tab order, a shortcut owner inside a pane constructor, or a regression in mouse/middle-click/drag behavior.

```powershell
git add src/renderer/tabBar.ts src/renderer/main.ts src/renderer/index.html src/renderer/helpContent.ts tests/unit/tabBar.test.ts tests/unit/helpContent.test.ts tests/smoke/tabs.spec.ts
git commit -m "feat(accessibility): add semantic keyboard tabs"
```

---

### Task 7: Replace click-to-cycle status text with explicit native selectors

**Files:**
- Modify: `src/renderer/statusBar.ts`
- Modify: `src/renderer/index.html`
- Create: `tests/unit/statusBar.test.ts`
- Modify: `tests/smoke/app.spec.ts`

**Interfaces:**
- Consumes: existing `StatusHandlers.onEol(eol: EolMode): void` and `onEncoding(enc: Encoding): void` callbacks; no main/IPC contract changes.
- Produces: `select[aria-label="File encoding"]` values `utf8 | utf8bom | utf16le | utf16be` and `select[aria-label="Line endings"]` values `LF | CRLF`.
- Preserves: dirty-state mutation, session-save scheduling, tab/status refresh, toast text, encoding bytes, and newline conversion on the next save.

- [ ] **Step 1: Add failing DOM unit tests for exact emitted values**

Create `tests/unit/statusBar.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { StatusBar } from '../../src/renderer/statusBar'

it('renders labelled encoding/EOL selects and emits exact values', () => {
  const host = document.createElement('div'); const onEncoding = vi.fn(); const onEol = vi.fn()
  new StatusBar(host, { onEncoding, onEol }).update({
    language: 'plaintext', encoding: 'utf8', eol: 'LF', cursor: { line: 1, col: 1 }, dirty: false,
  })
  const encoding = host.querySelector<HTMLSelectElement>('select[aria-label="File encoding"]')!
  const eol = host.querySelector<HTMLSelectElement>('select[aria-label="Line endings"]')!
  expect([...encoding.options].map(o => [o.value, o.textContent])).toEqual([
    ['utf8', 'UTF-8'], ['utf8bom', 'UTF-8 BOM'], ['utf16le', 'UTF-16 LE'], ['utf16be', 'UTF-16 BE'],
  ])
  encoding.value = 'utf16le'; encoding.dispatchEvent(new Event('change'))
  eol.value = 'CRLF'; eol.dispatchEvent(new Event('change'))
  expect(onEncoding).toHaveBeenCalledWith('utf16le'); expect(onEol).toHaveBeenCalledWith('CRLF')
  expect(encoding.getAttribute('aria-describedby')).toBe(eol.getAttribute('aria-describedby'))
  expect(document.getElementById(encoding.getAttribute('aria-describedby')!)?.textContent).toMatch(/next save/i)
})
```

- [ ] **Step 2: Run the unit and observe red**

Run `npm test -- statusBar`.

Expected: FAIL because the current controls are clickable spans and `StatusBar` cycles values itself.

- [ ] **Step 3: Render compact native selects**

Replace `ENCODINGS`, `cycleEncoding`, and the `.sb-click` spans with select factories:

```ts
const note = document.createElement('span')
note.id = 'status-format-note'; note.className = 'sr-only'
note.textContent = 'The selected format is written the next time you save this file.'

const encoding = document.createElement('select')
encoding.className = 'sb-select'; encoding.setAttribute('aria-label', 'File encoding')
encoding.setAttribute('aria-describedby', note.id)
for (const [value, label] of ENCODING_OPTIONS) encoding.add(new Option(label, value))
encoding.value = info.encoding
encoding.onchange = () => this.handlers.onEncoding(encoding.value as Encoding)

const eol = document.createElement('select')
eol.className = 'sb-select'; eol.setAttribute('aria-label', 'Line endings')
eol.setAttribute('aria-describedby', note.id)
for (const value of ['LF', 'CRLF'] as const) eol.add(new Option(value, value))
eol.value = info.eol
eol.onchange = () => this.handlers.onEol(eol.value as EolMode)
```

Append the shared note once per `update()`. Style `.sb-select` as a compact native control using inherited font/color and transparent background; retain visible native focus and a minimum hit target that fits the 22px status bar. Remove `.sb-click` from motion selectors only after no status element uses it.

- [ ] **Step 4: Add a real save-byte smoke test**

Extend `tests/smoke/app.spec.ts`: create an LF UTF-8 fixture containing `a\nb`, launch it, select `utf16le` and `CRLF`, assert the tab becomes dirty and the toast/status values update, save with `Control+S`, then inspect bytes from the Playwright test process:

```ts
await win.getByLabel('File encoding').selectOption('utf16le')
await win.getByLabel('Line endings').selectOption('CRLF')
await expect(win.getByLabel('File encoding')).toHaveAttribute('aria-describedby', 'status-format-note')
await expect(win.locator('#status-format-note')).toContainText('next time you save')
await win.keyboard.press('Control+S')
await expect.poll(() => [...readFileSync(file).subarray(0, 2)]).toEqual([0xff, 0xfe])
expect(readFileSync(file).subarray(2).toString('utf16le')).toBe('a\r\nb')
```

This assertion proves conversion occurs on save rather than merely proving the selectors changed.

- [ ] **Step 5: Verify, falsify, review, and commit status selectors**

Run:

```powershell
npm test -- statusBar encoding fileService
npm run build
Remove-Item env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npx playwright test tests/smoke/app.spec.ts --grep "encoding.*line endings|file format selectors"
```

Expected: PASS.

Falsification: temporarily send `info.encoding` instead of `encoding.value` in `onchange`; confirm the unit fails on `utf16le` and the smoke file remains UTF-8. Restore and rerun green.

Reviewer gate: reject a custom popup, a selector without the next-save description, changed callbacks in `main.ts`, or a smoke assertion that checks only DOM state without checking the saved bytes/newlines.

```powershell
git add src/renderer/statusBar.ts src/renderer/index.html tests/unit/statusBar.test.ts tests/smoke/app.spec.ts
git commit -m "feat(accessibility): add explicit file format selectors"
```

---

### Task 8: Add semantic Command Palette and deterministic fuzzy ranking

**Files:**
- Create: `src/renderer/commandSearch.ts`
- Create: `tests/unit/commandSearch.test.ts`
- Modify: `src/renderer/commandPalette.ts`
- Modify: `src/renderer/main.ts`
- Modify: `src/renderer/index.html`
- Modify: `tests/smoke/palette.spec.ts`
- Modify: `tests/smoke/accessibility-overlays.spec.ts`

**Interfaces:**
- Consumes: existing `Command { id: string; label: string; run: () => void | Promise<void>; hint?: string }`, `DialogController`, and `focusActiveEditor()`.
- Produces: `RankedCommand { command: Command; registrationIndex: number }` and `rankCommands(query: string, commands: readonly Command[]): RankedCommand[]`.
- Produces: `new CommandPalette(focusEditor: () => void)`; stable `palette-list`, `palette-option-<command-id>`, `palette-count`, and `palette-title` ids.
- Preserves: command registration order, ArrowUp/ArrowDown/Enter execution, visible hint chips, command failure logging, and `Ctrl+Shift+P` as the sole palette shortcut owner.

- [ ] **Step 1: Add failing ranking tests with exact expected order**

Create `tests/unit/commandSearch.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { rankCommands } from '../../src/renderer/commandSearch'
import type { Command } from '../../src/renderer/commandPalette'

const command = (id: string, label: string, hint?: string): Command => ({ id, label, hint, run: vi.fn() })

describe('rankCommands', () => {
  const commands = [
    command('settings', 'Preferences'),
    command('set-language', 'Set Language'),
    command('save-all', 'Save All', 'Ctrl+Shift+S'),
    command('toggle-sidebar', 'Toggle Sidebar'),
  ]
  it('orders exact, prefix, contiguous, then subsequence matches', () => {
    const ranked = rankCommands('settings', [
      command('settings', 'Preferences'), command('settings-extra', 'Settings Extra'),
      command('open-settings', 'Open Settings'), command('s-e-t-t-i-n-g-s', 'Scattered Entry To Toggle In New Global State'),
    ])
    expect(ranked.map(r => r.command.id)).toEqual(['settings', 'settings-extra', 'open-settings', 's-e-t-t-i-n-g-s'])
  })
  it('searches id and shortcut hint, with label/id winning an equal-strength tie', () => {
    expect(rankCommands('toggle-sidebar', commands)[0].command.label).toBe('Toggle Sidebar')
    expect(rankCommands('Ctrl+Shift+S', commands)[0].command.id).toBe('save-all')
    const tied = rankCommands('save', [command('x', 'Save'), command('save', 'Other', 'Save')])
    expect(tied.map(r => r.command.label)).toEqual(['Save', 'Other'])
  })
  it('uses registration order as the final tie-break', () => {
    const tied = [command('first', 'Alpha One'), command('second', 'Alpha Two')]
    expect(rankCommands('Alpha', tied).map(r => r.registrationIndex)).toEqual([0, 1])
  })
})
```

- [ ] **Step 2: Run the unit and observe red**

Run `npm test -- commandSearch`.

Expected: FAIL because `src/renderer/commandSearch.ts` does not exist.

- [ ] **Step 3: Implement tuple-based deterministic ranking**

Create `src/renderer/commandSearch.ts` with explicit tuples `[kind, source, gap, registrationIndex]`, where kind is exact `0`, prefix `1`, contiguous substring `2`, subsequence `3`; source is label/id `0`, hint `1`; and lower gap is better for fuzzy ties:

```ts
import type { Command } from './commandPalette'

export interface RankedCommand { command: Command; registrationIndex: number }
type Rank = readonly [kind: number, source: number, gap: number, registrationIndex: number]

const normalize = (value: string): string => value.trim().toLowerCase()

function fieldRank(query: string, value: string, source: number, index: number): Rank | null {
  const text = normalize(value)
  if (text === query) return [0, source, 0, index]
  if (text.startsWith(query)) return [1, source, text.length - query.length, index]
  const contiguous = text.indexOf(query)
  if (contiguous >= 0) return [2, source, contiguous, index]
  let at = -1; let gap = 0
  for (const char of query) {
    const next = text.indexOf(char, at + 1); if (next < 0) return null
    if (at >= 0) gap += next - at - 1
    at = next
  }
  return [3, source, gap, index]
}

export function rankCommands(query: string, commands: readonly Command[]): RankedCommand[] {
  const normalized = normalize(query)
  return commands.map((command, registrationIndex) => {
    const fields = [
      fieldRank(normalized, command.label, 0, registrationIndex),
      fieldRank(normalized, command.id, 0, registrationIndex),
      command.hint ? fieldRank(normalized, command.hint, 1, registrationIndex) : null,
    ].filter((rank): rank is Rank => rank !== null)
    fields.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3])
    return fields[0] ? { command, registrationIndex, rank: fields[0] } : null
  }).filter((entry): entry is RankedCommand & { rank: Rank } => entry !== null)
    .sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] || a.rank[2] - b.rank[2] || a.registrationIndex - b.registrationIndex)
    .map(({ command, registrationIndex }) => ({ command, registrationIndex }))
}
```

Special-case an empty normalized query to return registration order directly; do not rely on the empty-string prefix rule implicitly.

- [ ] **Step 4: Apply dialog/combobox/listbox semantics**

Construct the palette with a screen-reader-only `h2#palette-title`, `div#palette-list[role=listbox]`, and `div#palette-count[role=status][aria-live=polite]`. Configure the input:

```ts
this.input.type = 'search'; this.input.setAttribute('role', 'combobox')
this.input.setAttribute('aria-label', 'Command Palette')
this.input.setAttribute('aria-autocomplete', 'list')
this.input.setAttribute('aria-controls', 'palette-list')
this.input.setAttribute('aria-expanded', 'true')
```

Use `rankCommands(this.input.value, this.commands)` in `refresh()`. Each row gets stable id `palette-option-${command.id}`, `role="option"`, `aria-selected`, and `onclick`. `paint()` updates class, every `aria-selected`, `aria-activedescendant`, and scrolls the active option into view. When there are no results, remove `aria-activedescendant` and announce `0 commands`; otherwise announce the exact count without injecting the whole result text into the live region.

- [ ] **Step 5: Close the palette before executing commands**

This ordering is load-bearing once both the palette and destination are focus-restoring dialogs:

```ts
private exec(command: Command): void {
  this.close()
  void Promise.resolve(command.run()).catch(error => console.error('command failed:', error))
}
```

Closing first restores the palette's opener before a command opens Settings/Help/etc.; the destination then records that real opener and keeps its initial focus. Running first would open the destination and then let palette close steal focus back. Migrate palette open/close to `DialogController` and pass `focusActiveEditor` from `main.ts`.

- [ ] **Step 6: Add role, id-search, hint-search, and nested-dialog smoke coverage**

Extend `tests/smoke/palette.spec.ts`:

```ts
await win.keyboard.press('Control+Shift+P')
const palette = win.getByRole('dialog', { name: 'Command Palette' })
const input = palette.getByRole('combobox', { name: 'Command Palette' })
await expect(input).toHaveAttribute('aria-controls', 'palette-list')
await input.fill('snip-manage')
const activeId = await input.getAttribute('aria-activedescendant')
await expect(win.locator(`#${activeId}`)).toHaveAttribute('role', 'option')
await expect(win.locator(`#${activeId}`)).toHaveAttribute('aria-selected', 'true')
await win.keyboard.press('Enter')
await expect(win.getByRole('dialog', { name: 'Snippets' })).toBeVisible()
await expect(win.getByRole('dialog', { name: 'Snippets' }).getByRole('button', { name: 'Add snippet' })).toBeFocused()
```

Close Snippets, reopen Palette, fill `Ctrl+Shift+F`, assert the active option is `Find in Files`, press Enter, and assert the named Find in Files dialog receives focus. This proves hint matching and the close-before-run focus ordering.

- [ ] **Step 7: Verify, falsify, review, and commit the palette**

Run:

```powershell
npm test -- commandSearch
npm run build
Remove-Item env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npx playwright test tests/smoke/palette.spec.ts tests/smoke/accessibility-overlays.spec.ts
```

Expected: PASS.

Falsification: temporarily replace `rankCommands` with the old label-only `includes` filter; run `palette.spec.ts --retries=0` and confirm both `snip-manage` and shortcut-hint searches fail. Restore. Then move `this.close()` after `command.run()` and confirm the nested Snippets/Find dialog initial-focus assertion fails; restore.

Reviewer gate: reject locale- or timing-dependent tie breaks, hint priority above an equally strong label/id match, unstable option ids, an active CSS class without matching `aria-selected`, or run-before-close ordering.

```powershell
git add src/renderer/commandSearch.ts src/renderer/commandPalette.ts src/renderer/main.ts src/renderer/index.html tests/unit/commandSearch.test.ts tests/smoke/palette.spec.ts tests/smoke/accessibility-overlays.spec.ts
git commit -m "feat(accessibility): add fuzzy semantic command palette"
```

---

### Task 9: Accessibility slice falsification, full verification, and review handoff

**Files:**
- Modify only if a valid review finding requires a correction: accessibility files and tests listed in Tasks 1-8.
- Do not modify: `package.json`, `CHANGELOG.md`, release tags, packaging configuration, workspace/search-performance modules, or release artifacts.

**Interfaces:**
- Consumes all committed task interfaces and smoke guards from Tasks 1-8.
- Produces a fully reviewed accessibility slice with recorded red/green evidence, ready to combine with the remaining Phase 4.6 plans; it does not produce a release.

- [ ] **Step 1: Run the focused unit gate from the slice tip**

```powershell
npm test -- dialogController rovingIndex overlayManager personalDictionaryPanel rendererContextMenu spellContextMenu editorContextMenu tabBar helpContent statusBar encoding fileService commandSearch
```

Expected: PASS with no skipped focused guard.

- [ ] **Step 2: Build once, then run every focused smoke surface**

```powershell
npm run build
Remove-Item env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npx playwright test tests/smoke/settings.spec.ts tests/smoke/overlay-dismiss.spec.ts tests/smoke/accessibility-overlays.spec.ts tests/smoke/help.spec.ts tests/smoke/find-in-files.spec.ts tests/smoke/sidebar.spec.ts tests/smoke/spell-check.spec.ts tests/smoke/tabs.spec.ts tests/smoke/focus.spec.ts tests/smoke/app.spec.ts tests/smoke/palette.spec.ts
```

Expected: PASS under the normal configured retries. Record each attempt separately; a later green retry does not erase an earlier failure.

- [ ] **Step 3: Repeat every load-bearing falsification against the branch tip**

Apply one temporary break at a time, use `--retries=0`, observe the named assertion red, restore, and rerun green:

1. Remove Shift+Tab wrap: `dialogController.test.ts` fails on the first-control assertion.
2. Discard the recorded opener: Settings smoke fails on toolbar focus return.
3. Unconditionally close during hotkey recording: overlay-dismiss smoke fails after the first Escape.
4. Remove menu ArrowDown: sidebar smoke cannot focus/activate the intended menuitem.
5. Register tab cycling per pane: split-view tabs smoke targets the wrong pane or loses the app-wide path.
6. Nest the close button inside the tab button: tab DOM unit fails the sibling/non-nesting assertion.
7. Emit the old status value: status unit and saved-byte smoke fail.
8. Restore label-only palette matching: id/hint smoke finds no command.
9. Execute a palette command before closing: nested-dialog initial-focus smoke fails.

After each restoration, run the smallest named test green before applying the next break. Do not commit any falsification mutation.

- [ ] **Step 4: Run repository-wide automated gates**

```powershell
npm run typecheck
npm run build
npm test
Remove-Item env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npm run test:smoke
git diff --check master...HEAD
git status --short --branch
```

Expected: typecheck/build, every unit file, and the full normally configured smoke suite PASS. The worktree contains no generated `out/`, temporary profiles, or test fixtures. Report any retry's original assertion independently.

- [ ] **Step 5: Perform a keyboard-only manual pass on the built app**

Starting with hands off the mouse, verify and record:

- toolbar Settings opener → category arrows/Home/End → every control → recorder Escape twice → focus return;
- every modal named in Task 4 opens, traps Tab/Shift+Tab, closes with one Escape, and returns focus or uses the active-editor fallback;
- folder header menu opens from keyboard, arrows/Home/End/Enter/Space work, Escape returns focus;
- tab arrows, selected close button, close-neighbor focus, and `Ctrl+PageUp`/`Ctrl+PageDown` work in both panes;
- encoding/EOL selectors announce their labels and next-save behavior and remain compact;
- Command Palette announces result count and selection while id/hint fuzzy queries remain deterministic;
- Monaco `Shift+F10`, `Ctrl+.`, find widget Escape, pointer tab selection, middle-click close, and drag reorder remain intact.

- [ ] **Step 6: Perform a Windows Narrator pass**

With Narrator enabled, record the spoken role/name/state for Settings dialog/categories/theme/accent, one nested dialog, editor tabs and selected state, one custom menu/menuitem, both status selectors and next-save description, and Command Palette combobox/option/result count. A visually correct but unnamed or state-less control is a release-blocking finding for this slice.

- [ ] **Step 7: Review the complete accessibility diff against scope and boundaries**

```powershell
git diff --stat master...HEAD
git diff master...HEAD -- src/renderer tests/unit tests/smoke
rg -n "pushOverlay|addEventListener\('keydown'.*Escape|editor\.addCommand" src/renderer
```

Confirm:

- only `overlayManager.ts` directly calls `pushOverlay`;
- no migrated widget owns Escape privately;
- no Node/Electron/filesystem import entered the renderer;
- `DialogController` owns focus only, not content or visibility;
- every listed modal uses the primitive, with `DiffView` documented as the intentional non-modal exception;
- one shortcut owner exists for tab cycling;
- every interactive visual row is a native button/input/select or has the correct role/state;
- no workspace/search-performance, IPC, persistence, release, or packaging changes entered this slice.

- [ ] **Step 8: Fix valid review findings, rerun affected tests, and commit corrections separately**

For each valid finding, first add or strengthen the assertion that exposes it, run that assertion red, make the minimal correction, and rerun green. Then use the exact staging command for the owning area below; never use `git add -A` in a shared/dirty worktree:

```powershell
# Dialog/focus or Settings correction
git add src/renderer/dialogController.ts src/renderer/rovingIndex.ts src/renderer/settingsPanel.ts tests/unit/dialogController.test.ts tests/unit/rovingIndex.test.ts tests/smoke/settings.spec.ts

# Modal-family correction
git add src/renderer/quickOpen.ts src/renderer/findInFiles.ts src/renderer/helpOverlay.ts src/renderer/inputOverlay.ts src/renderer/diffPicker.ts src/renderer/pasteHistoryPicker.ts src/renderer/snippetPicker.ts src/renderer/snippetManager.ts src/renderer/fileHistoryPanel.ts src/renderer/personalDictionaryPanel.ts tests/smoke/accessibility-overlays.spec.ts

# Menu, tabs, status, or palette correction
git add src/renderer/contextMenu.ts src/renderer/tabBar.ts src/renderer/statusBar.ts src/renderer/commandSearch.ts src/renderer/commandPalette.ts tests/unit/rendererContextMenu.test.ts tests/unit/tabBar.test.ts tests/unit/statusBar.test.ts tests/unit/commandSearch.test.ts tests/smoke/sidebar.spec.ts tests/smoke/tabs.spec.ts tests/smoke/app.spec.ts tests/smoke/palette.spec.ts

git commit -m "fix(accessibility): address review findings"
```

Omit unaffected paths from the matching command after checking `git diff --name-only`; if review finds nothing, make no correction commit.

- [ ] **Step 9: Run the final cheap gate and hand off to the next Phase 4.6 plan**

```powershell
npm run typecheck
git diff --check master...HEAD
git status --short --branch
```

Expected: PASS and clean tracked worktree. Hand off the exact commit SHA, focused/full test results, falsification evidence, manual keyboard/Narrator notes, and any retries. Do not bump the version or update release bookkeeping until all Phase 4.6 slices have passed whole-branch review.

## Final Review Checklist

- [ ] Every approved A1-A7 requirement maps to a task and an automated or manual assertion.
- [ ] Every modal named in A3 appears in the migration inventory; `DiffView` is the sole documented non-modal `OverlayRegistration` user.
- [ ] Settings' special recorder Escape path and nested Personal Dictionary LIFO behavior are both covered.
- [ ] Menu, tab, status, and palette tests assert outcome plus assistive semantics, not visibility alone.
- [ ] Every new shortcut appears once in `helpContent.ts` and once in the app-wide key owner.
- [ ] All deliberate breaks were restored and their named tests reran green.
- [ ] The accessibility slice is ready for integration, but no release/version/package claim has been made.
