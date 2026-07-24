import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('palette shortcut hints render as one kbd chip per key', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-smoke-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    await win.keyboard.press('Control+Shift+P')
    await win.locator('#palette input').fill('Save All') // hint 'Ctrl+Shift+S'
    const chips = win.locator('.palette-row', { hasText: 'Save All' }).locator('.kbd')
    await expect(chips).toHaveCount(3)
    await expect(chips.nth(0)).toHaveText('Ctrl')
    await expect(chips.nth(2)).toHaveText('S')
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
