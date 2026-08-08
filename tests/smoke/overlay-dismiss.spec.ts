import { test, expect } from './smokeTest'
import type { Page } from '@playwright/test'
import type { SmokeResources } from './smokeCleanup'
import { openSettings } from './settingsHelper'

async function launch(smoke: SmokeResources) {
  const userDataDir = smoke.tempDir('notes-esc-')
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  return { app }
}

type Win = Page

async function runCmd(win: Win, label: string) {
  await win.keyboard.press('Control+Shift+P')
  await win.locator('#palette input').fill(label)
  await win.keyboard.press('Enter')
}

test('Escape closes overlays that previously had no Esc handler', async ({ smoke }) => {
  const { app } = await launch(smoke)
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    // Settings panel — gained Esc-close this slice (ported from the old Appearance panel)
    await openSettings(win)
    await win.keyboard.press('Escape')
    await expect(win.locator('#settings')).toBeHidden()
})

test('Settings recorder consumes its first Escape, then closes and restores toolbar focus', async ({ smoke }) => {
  const { app } = await launch(smoke)
  const win = await app.firstWindow()
  await expect(win.locator('#tabbar')).toBeVisible()
  const opener = win.getByRole('button', { name: 'Settings' })
  await opener.focus()
  await openSettings(win, 'Startup')
  await win.locator('.hk-record').click()
  await expect(win.locator('.hk-record')).toHaveText(/^Press keys/)
  await win.keyboard.press('Escape')
  await expect(win.getByRole('dialog', { name: 'Settings' })).toBeVisible()
  await expect(win.locator('.hk-record')).toHaveText('Record')
  await win.keyboard.press('Escape')
  await expect(win.getByRole('dialog', { name: 'Settings' })).toBeHidden()
  await expect(opener).toBeFocused()
})

test('Escape closes the command palette from any focus', async ({ smoke }) => {
  const { app } = await launch(smoke)
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()   // renderer ready (keydown listener attached)
    await win.keyboard.press('Control+Shift+P')
    await expect(win.locator('#palette .palette-box')).toBeVisible()
    await win.keyboard.press('Escape')
    await expect(win.locator('#palette')).toBeHidden()
})

// Re-opening an already-open overlay used to push a SECOND close callback onto the overlay
// stack while the overlay kept only the newest — orphaning the first. Because the only thing
// that can splice an entry out is the unregister fn the re-entrant open() overwrote, that
// orphan could never be removed: it sat on top of the stack for the rest of the session, and
// handleEscape() preventDefault+stopPropagation's whatever it finds there. Every subsequent
// Escape was eaten before Monaco could see it.
test('a re-entrant overlay open leaves no ghost entry to swallow later Escapes', async ({ smoke }) => {
  const { app } = await launch(smoke)
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()

    // Run the same overlay command twice: the second lands while the overlay is already open
    // (what a user does with Ctrl+P twice, or by re-running a palette command).
    await runCmd(win, 'Help: Shortcuts & Commands')
    await expect(win.locator('.help-overlay')).toBeVisible()
    await runCmd(win, 'Help: Shortcuts & Commands')
    await expect(win.locator('.help-overlay')).toBeVisible()

    await win.keyboard.press('Escape')
    await expect(win.locator('.help-overlay')).toBeHidden()

    // Monaco's find widget is the observable victim: with a ghost on the stack its Escape
    // never arrives, so the widget stays open.
    await win.locator('.view-lines').first().click()
    await win.keyboard.press('Control+F')
    await expect(win.locator('.find-widget.visible')).toBeVisible()
    await win.keyboard.press('Escape')
    await expect(win.locator('.find-widget.visible')).toHaveCount(0)
})

test('Escape closes only the topmost of two stacked overlays', async ({ smoke }) => {
  const { app } = await launch(smoke)
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()   // renderer ready (keydown listener attached)
    await openSettings(win)
    await win.keyboard.press('Control+Shift+P')          // palette on top of settings
    await expect(win.locator('#palette .palette-box')).toBeVisible()
    await win.keyboard.press('Escape')                   // closes palette only
    await expect(win.locator('#palette')).toBeHidden()
    await expect(win.locator('#settings')).toBeVisible()
    await win.keyboard.press('Escape')                   // then settings
    await expect(win.locator('#settings')).toBeHidden()
})
