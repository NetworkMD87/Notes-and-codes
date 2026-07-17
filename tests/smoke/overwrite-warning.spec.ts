import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Phase 1 fast-follow — the on-save overwrite guard's headline gap: the app is closed, the file
// changes on disk, and boot() restores the buffer from session *without* re-reading disk, so no
// watcher event ever announces the change. Saving must warn instead of silently clobbering.

// Ctrl+S is a native menu accelerator and can't be driven from the page, so click File ▸ Save in
// the main process (same pattern as clean-quit.spec.ts's File ▸ Exit).
async function saveViaMenu(app: Awaited<ReturnType<typeof electron.launch>>) {
  await app.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu()!
    const file = menu.items.find(i => i.label === 'File')!
    const save = file.submenu!.items.find(i => i.label === 'Save')!
    save.click()
  })
}

test('saving a file that changed on disk while the app was closed warns first', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-overwrite-'))
  const filePath = join(userDataDir, 'note.txt')
  writeFileSync(filePath, 'original')

  // 1. Open the file and quit clean. Session persists the buffer *and* its diskMtime baseline.
  const app1 = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, filePath] })
  try {
    const win1 = await app1.firstWindow()
    await expect(win1.locator('#paneA .view-lines')).toContainText('original')
    await win1.waitForTimeout(800) // let the 500ms debounced session save flush
  } finally {
    await app1.close()
  }

  // 2. Someone else changes the file while we are not running. Nothing is watching.
  writeFileSync(filePath, 'theirs')

  // 3. Relaunch on the same profile with NO file arg, so the buffer comes back from session
  //    (stale content + stale diskMtime) instead of being re-read fresh from disk.
  const app2 = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win2 = await app2.firstWindow()
    await expect(win2.locator('.tab', { hasText: 'note.txt' })).toBeVisible()

    // Dirty the restored buffer, then save → the guard must catch the stale baseline.
    await win2.locator('#paneA .monaco-editor').click()
    await win2.keyboard.type(' MINE')
    await saveViaMenu(app2)

    const dialog = win2.locator('.input-overlay')
    await expect(dialog).toBeVisible({ timeout: 8000 })
    await expect(win2.locator('.input-title')).toContainText('changed on disk')

    // Cancel → their bytes survive, and the change bar is there to Reload from.
    await dialog.locator('button', { hasText: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
    expect(readFileSync(filePath, 'utf8')).toBe('theirs')
    await expect(win2.locator('#change-bar')).toBeVisible()

    // Save again and confirm → our content lands and the bar clears.
    await saveViaMenu(app2)
    await expect(win2.locator('.input-overlay')).toBeVisible({ timeout: 8000 })
    await win2.locator('.input-overlay button', { hasText: 'Overwrite' }).click()
    await expect(win2.locator('.input-overlay')).toBeHidden()
    await expect(win2.locator('#change-bar')).toBeHidden()
    expect(readFileSync(filePath, 'utf8')).toContain('MINE')
  } finally {
    // If an assertion above failed the buffer is still dirty, and quitting would raise the native
    // "Save changes?" box — which would hang app.close() and the whole run. Neutralize it first
    // ("Don't Save" is button index 1).
    await app2.evaluate(({ dialog }) => { (dialog as any).showMessageBoxSync = () => 1 }).catch(() => {})
    await app2.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
