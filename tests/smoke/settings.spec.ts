import { test, expect, _electron as electron, type Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Open the Settings panel and switch to a category. Every settings smoke test
 *  goes through this — the detail pane only renders the ACTIVE category, so a
 *  control is not in the DOM until its category is selected. */
export async function openSettings(win: Page, category = 'Appearance') {
  await win.keyboard.press('Control+Shift+P')
  await win.locator('#palette input').fill('Settings')
  await win.keyboard.press('Enter')
  await expect(win.locator('#settings')).toBeVisible()
  await win.locator('.settings-cat', { hasText: category }).click()
  await expect(win.locator('.settings-cat.active')).toContainText(category)
}

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
