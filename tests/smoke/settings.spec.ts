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
    await expect(win.locator('.settings-nav .settings-cat')).toHaveCount(5)
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

// The old #appearance overlay is gone (Task 3) — the theme button, the palette's
// "Appearance…" command, and the View ▸ Appearance… menu item all now deep-link into
// #settings on the Appearance category via the same `openAppearance` alias. Nothing
// previously asserted the theme button opened anything at all (it used to open the
// now-deleted panel), so this closes that gap; the other two confirm the alias's other
// two entry points weren't silently broken by the rewire.

test('Settings: theme button opens Settings on the Appearance category', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-settings-themebtn-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    await win.locator('#theme-toggle').click()
    await expect(win.locator('#settings')).toBeVisible()
    await expect(win.locator('.settings-cat.active')).toContainText('Appearance')
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

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
