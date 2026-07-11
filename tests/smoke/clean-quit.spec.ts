import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Audit Phase 1 — R1 (v1.7 I8 residual): a *clean* quit (no unsaved tabs) must still
// flush the renderer's debounced clipboard/session writes before exiting, instead of
// app.quit()-ing straight past them and losing the last ~500ms of state.

// Trigger the app's own clean-quit path (File ▸ Exit → requestQuit) from the main process.
async function cleanQuitViaMenu(app: Awaited<ReturnType<typeof electron.launch>>) {
  await app.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu()!
    const file = menu.items.find(i => i.label === 'File')!
    const exit = file.submenu!.items.find(i => i.label === 'Exit')!
    exit.click()
  }).catch(() => {})   // the context may tear down as the app exits
}

test('clean quit flushes a pending debounced session save', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-cleanquit-'))
  try {
    const app1 = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
    const win = await app1.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    await expect(win.locator('.tab')).toHaveCount(1)

    // Add a second (empty, non-dirty) tab: this schedules the 500ms session-save
    // debounce but leaves unsavedCount at 0 → the quit takes the clean path.
    await win.keyboard.press('Control+Shift+P')
    await win.locator('#palette input').fill('New Tab')
    await win.keyboard.press('Enter')
    await expect(win.locator('.tab')).toHaveCount(2)

    // Quit immediately, before the 500ms debounce fires.
    const closed = app1.waitForEvent('close')
    await cleanQuitViaMenu(app1)
    await closed

    // Relaunch the same profile: the second tab must have been flushed to session.
    const app2 = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
    try {
      const win2 = await app2.firstWindow()
      await expect(win2.locator('#tabbar')).toBeVisible()
      await expect(win2.locator('.tab')).toHaveCount(2)
    } finally {
      await app2.close()
    }
  } finally {
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
