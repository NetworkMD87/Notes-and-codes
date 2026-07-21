import { expect, type Page } from '@playwright/test'

// Plain .ts (NOT .spec.ts) on purpose: playwright.config.ts's default testMatch only
// collects *.spec.ts under testDir, so this helper is importable from multiple spec
// files without Playwright re-registering a second copy of settings.spec.ts's tests.

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
