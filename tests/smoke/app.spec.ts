import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('launches, creates tabs, splits, toggles theme', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-smoke-'))
  // 'smoke-sentinel.noop' is appended so that fileArgFrom() in main/index.ts
  // (which walks argv in reverse for the last non-flag path-like token) finds
  // this non-existent path instead of 'out/main/index.js'.  readFile() fails
  // on it (no such file) and the catch branch is toast-only — no extra buffer
  // is created.  Without this sentinel the entry script itself is mis-identified
  // as a "file to open", producing a spurious third tab.
  const app = await electron.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, 'smoke-sentinel.noop']
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
