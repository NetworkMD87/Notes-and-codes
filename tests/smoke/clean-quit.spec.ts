import type { ElectronApplication } from '@playwright/test'
import { test, expect } from './smokeTest'

// Audit Phase 1 — R1 (v1.7 I8 residual): a *clean* quit (no unsaved tabs) must still
// flush the renderer's debounced clipboard/session writes before exiting, instead of
// app.quit()-ing straight past them and losing the last ~500ms of state.

// Trigger the app's own clean-quit path (File ▸ Exit → requestQuit) from the main process.
async function cleanQuitViaMenu(app: ElectronApplication) {
  await app.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu()!
    const file = menu.items.find(i => i.label === 'File')!
    const exit = file.submenu!.items.find(i => i.label === 'Exit')!
    exit.click()
  }).catch(() => {})   // the context may tear down as the app exits
}

test('clean quit flushes a pending debounced session save', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-cleanquit-')
  const app1 = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
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
  const app2 = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  const win2 = await app2.firstWindow()
  await expect(win2.locator('#tabbar')).toBeVisible()
  await expect(win2.locator('.tab')).toHaveCount(2)
})

test('clean quit watchdog allows two maximum delayed session writes to settle', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-cleanquit-maxdelay-')
  const env = { ...process.env, NC_TEST_SESSION_SAVE_DELAY_MS: '1000' }
  const app1 = await smoke.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`],
    env,
  })
  const win = await app1.firstWindow()
  await expect(win.locator('body[data-booted="true"]')).toBeVisible()

  await win.keyboard.press('Control+Shift+P')
  await win.locator('#palette input').fill('New Tab')
  await win.keyboard.press('Enter')
  await expect(win.locator('body')).toHaveAttribute('data-session-write-state', 'active')

  await win.keyboard.press('Control+Shift+P')
  await win.locator('#palette input').fill('New Tab')
  await win.keyboard.press('Enter')
  await expect(win.locator('body')).toHaveAttribute('data-session-write-state', 'active-pending')

  const closed = app1.waitForEvent('close')
  await cleanQuitViaMenu(app1)
  await closed

  const app2 = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  const win2 = await app2.firstWindow()
  await expect(win2.locator('body[data-booted="true"]')).toBeVisible()
  await expect(win2.locator('.tab')).toHaveCount(3)
})
