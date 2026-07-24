import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('an info toast renders with its glyph and severity class', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-smoke-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    // Toggle Word Wrap emits an info toast ("Word wrap: on/off").
    await win.keyboard.press('Control+Shift+P')
    await win.locator('#palette input').fill('Word Wrap')
    await win.keyboard.press('Enter')
    const toast = win.locator('.toast').first()
    await expect(toast).toBeVisible()
    await expect(toast).toHaveClass(/toast--info/)
    await expect(toast.locator('.toast-glyph svg')).toBeVisible()
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('a blocked action emits a warning-level toast', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-smoke-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    // With a single empty tab, "Compare / Diff…" cannot run and warns.
    await win.keyboard.press('Control+Shift+P')
    await win.locator('#palette input').fill('Diff')
    await win.keyboard.press('Enter')
    const toast = win.locator('.toast').first()
    await expect(toast).toBeVisible()
    await expect(toast).toHaveClass(/toast--warning/)
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
