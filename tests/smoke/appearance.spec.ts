import { test, expect, _electron as electron, type Page } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function openAppearance(win: Page) {
  await win.keyboard.press('Control+Shift+P')
  await win.locator('#palette input').fill('Appearance')
  await win.keyboard.press('Enter')
  await expect(win.locator('#appearance')).toBeVisible()
}

test('Appearance: Interface font sets --ui-font; Editor font is relabeled', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-appear-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    await openAppearance(win)

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
