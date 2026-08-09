import { expect, type Page } from '@playwright/test'

// Plain .ts (NOT .spec.ts) on purpose: playwright.config.ts's default testMatch only
// collects *.spec.ts under testDir, so this helper is importable from multiple spec
// files without Playwright re-registering a second copy of settings.spec.ts's tests.

/** Open the Settings panel and switch to a category. Every settings smoke test
 *  goes through this — the detail pane only renders the ACTIVE category, so a
 *  control is not in the DOM until its category is selected. */
export async function openSettings(win: Page, category = 'Appearance') {
  await win.getByRole('button', { name: 'Settings' }).click()
  const dialog = win.getByRole('dialog', { name: 'Settings' })
  await expect(dialog).toBeVisible()
  if (category !== 'Appearance') await dialog.getByRole('tab', { name: category }).click()
  await expect(dialog.getByRole('tab', { name: category })).toHaveAttribute('aria-selected', 'true')
}
