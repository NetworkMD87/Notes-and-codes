import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('launches, creates tabs, splits, toggles theme', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-smoke-'))
  const app = await electron.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`]
  })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    // clean start = exactly one auto-created tab
    await expect(win.locator('.tab')).toHaveCount(1)

    // New Tab via palette -> two tabs
    await win.keyboard.press('Control+Shift+P')
    await win.locator('#palette input').fill('New Tab')
    await win.keyboard.press('Enter')
    await expect(win.locator('.tab')).toHaveCount(2)

    // Toggle Split -> paneB visible
    await win.keyboard.press('Control+Shift+P')
    await win.locator('#palette input').fill('Toggle Split')
    await win.keyboard.press('Enter')
    await expect(win.locator('#paneB')).toBeVisible()

    // Theme toggle sets body dataset
    await win.click('#theme-toggle')
    const theme = await win.evaluate(() => document.body.dataset.theme)
    expect(['light', 'dark']).toContain(theme)
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('markdown preview toggles and paste-history picker opens', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-smoke-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()

    // Toggle Markdown Preview -> panel visible
    await win.keyboard.press('Control+Shift+P')
    await win.locator('#palette input').fill('Toggle Markdown Preview')
    await win.keyboard.press('Enter')
    await expect(win.locator('#mdpreview')).toBeVisible()

    // Paste from History -> picker overlay appears
    await win.keyboard.press('Control+Shift+P')
    await win.locator('#palette input').fill('Paste from History')
    await win.keyboard.press('Enter')
    await expect(win.locator('.ph-picker')).toBeVisible()
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
