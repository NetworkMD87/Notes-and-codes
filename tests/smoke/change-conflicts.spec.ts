import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Audit Phase 4 — M7: two files changing on disk while dirty must both stay resolvable.
// Before, the second conflict's bar replaced the first with no way back to it.

test('two on-disk conflicts queue in the change bar, one resolvable at a time', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-conflict-'))
  const fileA = join(userDataDir, 'a.txt'); writeFileSync(fileA, 'alpha')
  const fileB = join(userDataDir, 'b.txt'); writeFileSync(fileB, 'beta')
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()

    const openFile = (p: string) => app.evaluate(({ BrowserWindow }, path) =>
      BrowserWindow.getAllWindows()[0].webContents.send('open-file', path), p)

    // Open both files and dirty each, so an on-disk change is a *conflict* (not an auto-reload).
    await openFile(fileA)
    await expect(win.locator('.tab', { hasText: 'a.txt' })).toBeVisible()
    await win.locator('#paneA .monaco-editor').click()
    await win.keyboard.type(' EDIT-A')

    await openFile(fileB)
    await expect(win.locator('.tab', { hasText: 'b.txt' })).toBeVisible()
    await win.locator('#paneA .monaco-editor').click()
    await win.keyboard.type(' EDIT-B')

    // Change both on disk externally (not a self-write) → two queued conflicts.
    writeFileSync(fileA, 'alpha-changed')
    writeFileSync(fileB, 'beta-changed')

    const bar = win.locator('#change-bar')
    await expect(bar).toBeVisible({ timeout: 8000 })
    await expect(bar).toContainText('1 more', { timeout: 8000 }) // one shown, one queued

    // Resolve the first (Keep mine) → the second surfaces, and it's the last one.
    await bar.locator('button', { hasText: 'Keep mine' }).click()
    await expect(bar).toBeVisible()
    await expect(bar).not.toContainText('more')

    // Resolve the second → the bar hides.
    await bar.locator('button', { hasText: 'Keep mine' }).click()
    await expect(bar).toBeHidden()
  } finally {
    await app.close(); rmSync(userDataDir, { recursive: true, force: true })
  }
})
