import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openSettings } from './settingsHelper'

test('Settings: nav lists categories, detail shows the active one', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-settings-nav-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    await openSettings(win)

    await expect(win.locator('.settings-nav')).toBeVisible()
    await expect(win.locator('.settings-detail')).toBeVisible()
    // Appearance is the default category and owns the theme grid
    await expect(win.locator('.settings-detail .appearance-themes')).toBeVisible()
    await expect(win.locator('.settings-detail .appearance-sw')).toBeVisible()
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('Settings: Interface font sets --ui-font; Editor font is relabeled', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-appear-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    await openSettings(win, 'Font')

    // editor font control is relabeled
    await expect(win.locator('.appearance-row', { hasText: 'Editor font' })).toBeVisible()

    // interface font control is present and changes --ui-font on the body
    const uiRow = win.locator('.appearance-row', { hasText: 'Interface font' })
    await expect(uiRow).toBeVisible()
    await uiRow.locator('select').selectOption('Fira Code')
    await expect
      .poll(() => win.evaluate(() => getComputedStyle(document.body).getPropertyValue('--ui-font')), { timeout: 3000 })
      .toContain('Fira Code')
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('Settings: renders landscape — category nav left, detail right', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-settings-cols-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    await openSettings(win, 'Appearance')

    await expect(win.locator('.settings-nav')).toBeVisible()
    await expect(win.locator('.settings-detail')).toBeVisible()
    await expect(win.locator('.settings-nav .settings-cat')).toHaveCount(6)
    await expect(win.locator('.settings-detail .appearance-themes')).toBeVisible()
    await expect(win.locator('.settings-detail .appearance-sw')).toBeVisible()

    await win.locator('.settings-cat', { hasText: 'Font' }).click()
    await expect(win.locator('.settings-detail .appearance-row', { hasText: 'Interface font' })).toBeVisible()
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('Settings: hovering a theme row previews it; leaving the list reverts', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-appear-hover-'))
  let app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    let win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    await openSettings(win, 'Appearance')
    const committed = await win.evaluate(() => document.body.dataset.theme)

    await win.locator('.appearance-theme', { hasText: 'Monokai' }).hover()
    await expect.poll(() => win.evaluate(() => document.body.dataset.theme), { timeout: 3000 }).toBe('monokai')

    // the active-row highlight stays on the COMMITTED theme while previewing another
    await expect(win.locator('.appearance-theme.active')).not.toContainText('Monokai')

    // moving off the theme grid reverts
    await win.locator('#settings .accent-head h3').hover()
    await expect.poll(() => win.evaluate(() => document.body.dataset.theme), { timeout: 3000 }).toBe(committed)

    // this session previewed Monokai and committed nothing — relaunch against the same
    // profile and confirm the committed theme is still what it was. A leaked preview
    // write would show up as 'monokai' here, since nothing in this session overwrites it
    // (unlike the Escape/commit test below, whose later Nord commit would mask a leak).
    await win.keyboard.press('Escape')
    await app.close()

    app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
    win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    await expect.poll(() => win.evaluate(() => document.body.dataset.theme), { timeout: 5000 }).toBe(committed)
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('Settings: Escape mid-preview reverts; a click commits and survives relaunch', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-appear-commit-'))
  let app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    let win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    await openSettings(win, 'Appearance')
    const committed = await win.evaluate(() => document.body.dataset.theme)

    // preview, then close with Escape while the pointer is still on the row —
    // no mouseleave fires, so close() is the only thing that can revert it
    await win.locator('.appearance-theme', { hasText: 'Dracula' }).hover()
    await expect.poll(() => win.evaluate(() => document.body.dataset.theme), { timeout: 3000 }).toBe('dracula')
    await win.keyboard.press('Escape')
    await expect(win.locator('#settings')).toBeHidden()
    await expect.poll(() => win.evaluate(() => document.body.dataset.theme), { timeout: 3000 }).toBe(committed)

    // a click DOES commit, and the preview never wrote anything
    await openSettings(win, 'Appearance')
    await win.locator('.appearance-theme', { hasText: 'Nord' }).click()
    await expect.poll(() => win.evaluate(() => document.body.dataset.theme), { timeout: 3000 }).toBe('nord')
    await win.keyboard.press('Escape')
    await app.close()

    app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
    win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    await expect.poll(() => win.evaluate(() => document.body.dataset.theme), { timeout: 5000 }).toBe('nord')
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('Settings: every theme row shows four palette swatches', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-appear-sw-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    await openSettings(win, 'Appearance')

    await expect(win.locator('#settings .appearance-theme')).toHaveCount(14)
    await expect(win.locator('#settings .appearance-theme .theme-dots')).toHaveCount(14)
    await expect(win.locator('#settings .appearance-theme .theme-dot')).toHaveCount(56)

    // Monokai's dots are Monokai's own palette: editorbg / bar / bartext / accent
    const colours = await win.locator('.appearance-theme', { hasText: 'Monokai' })
      .locator('.theme-dot')
      .evaluateAll(els => els.map(e => (e as HTMLElement).style.background))
    expect(colours).toEqual([
      'rgb(39, 40, 34)',    // #272822 editor bg
      'rgb(30, 31, 28)',    // #1e1f1c bar
      'rgb(248, 248, 242)', // #f8f8f2 bar text
      'rgb(249, 38, 114)'   // #f92672 accent
    ])
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

// The old #appearance overlay is gone (Task 3), and the header's ◐ theme button is gone too
// — it opened Settings on Appearance, which is exactly what the toolbar gear already does.
// The two remaining deep-links, the palette's "Appearance…" command and the View ▸
// Appearance… menu item, both go through the same `openAppearance` alias; these two tests
// are what keep that alias from silently breaking now that no button exercises it.

test('Settings: palette "Appearance…" command opens Settings on the Appearance category', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-settings-palette-appear-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    await win.keyboard.press('Control+Shift+P')
    await win.locator('#palette input').fill('Appearance')
    await win.keyboard.press('Enter')
    await expect(win.locator('#settings')).toBeVisible()
    await expect(win.locator('.settings-cat.active')).toContainText('Appearance')
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('Settings: View ▸ Appearance… menu item opens Settings on the Appearance category', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-settings-menu-appear-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    // Real menu click, invoked from the main process the same way clean-quit.spec.ts and
    // overwrite-warning.spec.ts trigger File ▸ Exit / File ▸ Save — MenuItem.click() runs
    // the actual registered handler, not a synthetic IPC send.
    await app.evaluate(({ Menu }) => {
      const menu = Menu.getApplicationMenu()!
      const view = menu.items.find(i => i.label === 'View')!
      const appearance = view.submenu!.items.find(i => i.label === 'Appearance…')!
      appearance.click()
    })
    await expect(win.locator('#settings')).toBeVisible()
    await expect(win.locator('.settings-cat.active')).toContainText('Appearance')
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('Settings: Integration category holds the "Open with" toggle', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-settings-integration-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    await openSettings(win, 'Integration')

    // Present and reflecting the stored setting (default false). NEVER click it —
    // toggling would write to the developer's real HKCU shell-integration key.
    const cb = win.locator('.appearance-row', { hasText: 'Open with' }).locator('input[type=checkbox]')
    await expect(cb).toBeVisible()
    await expect(cb).not.toBeChecked()
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('Settings: gear button and Ctrl+, both open the panel', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-settings-doors-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()

    await win.locator('.tb-btn[title="Settings"]').click()
    await expect(win.locator('#settings')).toBeVisible()
    await win.keyboard.press('Escape')
    await expect(win.locator('#settings')).toBeHidden()

    await win.keyboard.press('Control+Comma')
    await expect(win.locator('#settings')).toBeVisible()
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('Settings: File ▸ Preferences… menu item opens the Settings panel', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-settings-menu-prefs-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    // Real menu click — same technique as the View ▸ Appearance… menu test above.
    await app.evaluate(({ Menu }) => {
      const menu = Menu.getApplicationMenu()!
      const file = menu.items.find(i => i.label === 'File')!
      const prefs = file.submenu!.items.find(i => i.label === 'Preferences…')!
      prefs.click()
    })
    await expect(win.locator('#settings')).toBeVisible()
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('Settings: Integration checkbox reflects a stored true value', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-settings-integration-true-'))
  // Seed the setting directly rather than clicking the checkbox — clicking would fire the
  // real registry write and mutate the developer's own HKCU shell-integration key. This is
  // registry-safe: the startup re-apply (src/main/index.ts:170) is gated on app.isPackaged,
  // and smoke tests launch the unpackaged app, so seeding settings.json here never touches
  // HKCU. This only proves the checkbox reads the stored `true` value (the sibling test
  // above only proves the default-`false` case, which can't distinguish "reflects the
  // stored setting" from "always renders unchecked").
  writeFileSync(join(userDataDir, 'settings.json'), JSON.stringify({ contextMenuEnabled: true }))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    await openSettings(win, 'Integration')

    const cb = win.locator('.appearance-row', { hasText: 'Open with' }).locator('input[type=checkbox]')
    await expect(cb).toBeVisible()
    await expect(cb).toBeChecked()
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('Settings: launch-on-login toggle persists across relaunch', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-settings-login-'))
  let app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    let win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    await openSettings(win, 'Startup')

    const cb = win.locator('.appearance-row', { hasText: 'Launch when Windows starts' }).locator('input[type=checkbox]')
    await expect(cb).not.toBeChecked()
    // Safe to click: the main-side OS write is gated on app.isPackaged, and smoke runs
    // unpackaged — so this exercises the persist path without touching HKCU.
    await cb.click()
    await expect(cb).toBeChecked()

    await win.keyboard.press('Escape')
    await app.close()

    app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
    win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    await openSettings(win, 'Startup')
    await expect(win.locator('.appearance-row', { hasText: 'Launch when Windows starts' })
      .locator('input[type=checkbox]')).toBeChecked()
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('Settings: recording a hotkey updates the chips and persists', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-settings-hotkey-'))
  let app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    let win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    await openSettings(win, 'Startup')

    await expect(win.locator('.hk-chip')).toHaveText(['Ctrl', 'Shift', 'Space'])

    await win.locator('.hk-record').click()
    await expect(win.locator('.hk-record')).toHaveText('Press keys…')
    await win.keyboard.press('Control+Alt+J')
    await expect(win.locator('.hk-chip')).toHaveText(['Ctrl', 'Alt', 'J'])

    await win.keyboard.press('Escape')     // closes the panel (not recording any more)
    await app.close()

    app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
    win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    await openSettings(win, 'Startup')
    await expect(win.locator('.hk-chip')).toHaveText(['Ctrl', 'Alt', 'J'])
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('Settings: Escape cancels recording without closing the panel', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-settings-hkesc-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    await openSettings(win, 'Startup')

    await win.locator('.hk-record').click()
    await expect(win.locator('.hk-record')).toHaveText('Press keys…')

    // First Escape cancels the recording — the panel MUST stay open.
    await win.keyboard.press('Escape')
    await expect(win.locator('#settings')).toBeVisible()
    await expect(win.locator('.hk-record')).toHaveText('Record')
    await expect(win.locator('.hk-chip')).toHaveText(['Ctrl', 'Shift', 'Space'])

    // Second Escape closes the panel, as normal.
    await win.keyboard.press('Escape')
    await expect(win.locator('#settings')).toBeHidden()
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('Settings: switching category mid-recording tears down the listener (typing elsewhere still works)', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-settings-hknav-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    await openSettings(win, 'Startup')

    await win.locator('.hk-record').click()
    await expect(win.locator('.hk-record')).toHaveText('Press keys…')

    // Switch away before finishing the combo — the widget that could cancel it is gone,
    // but the recorder's capture-phase keydown listener must not still be on `window`.
    await win.locator('.settings-cat', { hasText: 'Font' }).click()
    await expect(win.locator('.settings-cat.active')).toContainText('Font')
    await expect(win.locator('.hk-record')).toHaveCount(0)

    // Real signal: a plain (non-modifier) keydown must reach an ordinary control's default
    // action. If the leftover listener were still attached it would preventDefault/
    // stopPropagation on every keydown (accelFromEvent never resolves a bare Space), so the
    // checkbox would silently fail to toggle — an internal-state check on `recording` would
    // not have caught that, only a real keydown reaching a real element does.
    const lig = win.locator('.appearance-row', { hasText: 'Ligatures' }).locator('input[type=checkbox]')
    await expect(lig).toBeChecked() // fontLigatures defaults to true
    await lig.focus()               // focus only — a click would toggle it via the mouse path, not keydown
    await win.keyboard.press('Space')
    await expect(lig).not.toBeChecked()

    // And the abandoned recording didn't silently rebind the hotkey from the Font tab either.
    await win.locator('.settings-cat', { hasText: 'Startup' }).click()
    await expect(win.locator('.hk-chip')).toHaveText(['Ctrl', 'Shift', 'Space'])
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('Settings: Clear mid-recording tears down the listener too (typing elsewhere still works)', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-settings-hkclearmid-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    await openSettings(win, 'Startup')

    await win.locator('.hk-record').click()
    await expect(win.locator('.hk-record')).toHaveText('Press keys…')

    // Clear supersedes the in-flight recording without finishing the combo.
    await win.locator('.hk-clear').click()
    await expect(win.locator('.hk-none')).toBeVisible()
    await expect(win.locator('.hk-record')).toHaveText('Record')

    // Same real signal as the category-switch case, but proven without ever leaving the
    // Startup tab, so this isolates the Clear path from the nav-switch fix: a plain Space
    // keydown on the login checkbox must still reach its default action.
    const loginBox = win.locator('.appearance-row', { hasText: 'Launch when Windows starts' }).locator('input[type=checkbox]')
    await expect(loginBox).not.toBeChecked()
    await loginBox.focus()
    await win.keyboard.press('Space')
    await expect(loginBox).toBeChecked()
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('Settings: hiding and reshowing the window mid-recording tears down the listener (typing elsewhere still works)', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-settings-hkhide-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    await openSettings(win, 'Startup')

    await win.locator('.hk-record').click()
    await expect(win.locator('.hk-record')).toHaveText('Press keys…')

    // This is the actual leak: neither Escape nor Clear nor a category switch runs — the
    // window itself goes away, which is exactly what hide-to-tray (the X button) and the OS
    // summon hotkey do (globalShortcut fires in the main process; this renderer's
    // preventDefault() can't intercept it). Drive that directly rather than faking a DOM
    // event, the same way startup-window.spec.ts proves the real hide/show cycle.
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.hide())
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible()), { timeout: 5000 }).toBe(false)

    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.show())
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible()), { timeout: 5000 }).toBe(true)

    // The recorder cancelled itself and the hotkey was never rebound mid-flight.
    await expect(win.locator('.hk-record')).toHaveText('Record')
    await expect(win.locator('.hk-chip')).toHaveText(['Ctrl', 'Shift', 'Space'])

    // Real signal, staying on the Startup tab throughout (isolating this path from the
    // nav-switch fix, same reasoning as the Clear-mid-recording test above): a plain Space
    // keydown on the login checkbox must still reach its default action. If the leftover
    // capture-phase listener were still attached it would preventDefault/stopPropagation on
    // every keydown (accelFromEvent never resolves a bare Space), silently swallowing the
    // toggle — an internal `recording` check would not have caught that, only a real keydown
    // reaching a real element does.
    const loginBox = win.locator('.appearance-row', { hasText: 'Launch when Windows starts' }).locator('input[type=checkbox]')
    await expect(loginBox).not.toBeChecked()
    await loginBox.focus()
    await win.keyboard.press('Space')
    await expect(loginBox).toBeChecked()
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('Settings: Clear removes the hotkey entirely and it stays cleared', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-settings-hkclear-'))
  let app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    let win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    await openSettings(win, 'Startup')

    await win.locator('.hk-clear').click()
    await expect(win.locator('.hk-chip')).toHaveCount(0)
    await expect(win.locator('.hk-none')).toBeVisible()

    await win.keyboard.press('Escape')
    await app.close()

    // Guards the `??` fix from Task 10: a `||` fallback would silently re-bind the default.
    app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
    win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    await openSettings(win, 'Startup')
    await expect(win.locator('.hk-chip')).toHaveCount(0)
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('Settings: re-entrant open() does not leak an overlayManager registration (Escape keeps working afterwards)', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-settings-reentrant-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()

    // Put the editor into multi-cursor state first, and never click it again afterwards —
    // clicking would collapse the selection itself and destroy the very signal this test
    // reads. Ctrl+, (the panel's OTHER open door, alongside the gear button / palette
    // "Settings…" / File ▸ Preferences… / the Appearance… deep-link named in the finding)
    // is bound on `window` and never touches focus, so it can be pressed repeatedly without
    // disturbing the editor's own focus or selection.
    const editor = win.locator('#paneA .monaco-editor')
    await editor.click()
    await win.keyboard.type('foo foo foo')
    // First Ctrl+D only selects the word under the cursor (still one cursor); the second and
    // third each add one more match as a new selection.
    await win.keyboard.press('Control+D')
    await win.keyboard.press('Control+D')
    await win.keyboard.press('Control+D')
    await expect(win.locator('#paneA .cursor')).toHaveCount(3)

    // Re-entrant open(): Ctrl+, twice without ever closing in between.
    await win.keyboard.press('Control+Comma')
    await expect(win.locator('#settings')).toBeVisible()
    await win.keyboard.press('Control+Comma')
    await expect(win.locator('#settings')).toBeVisible()

    // One Escape closes the panel, same as ever.
    await win.keyboard.press('Escape')
    await expect(win.locator('#settings')).toBeHidden()

    // The real signal. Without the fix, the first open() pushed a close callback that the
    // second open() never unregistered — only the LATEST one gets popped when the panel
    // closes, so a dead entry is left on overlayManager's stack forever. overlayManager's
    // capture-phase listener can't distinguish a live overlay from a dead one: this next
    // Escape (no overlay visible anywhere) would be consumed by that stale entry —
    // preventDefault + stopPropagation — before it ever reaches Monaco's own Escape-cancels-
    // multi-selection handling, so the three cursors would still be three. With the fix, the
    // stack is fully empty once the panel is closed, so this Escape reaches Monaco and
    // collapses the selection down to its one primary cursor, same as it would with no
    // overlay ever having been opened.
    await win.keyboard.press('Escape')
    await expect(win.locator('#paneA .cursor')).toHaveCount(1)
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
