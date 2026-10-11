import { test, expect } from './smokeTest'
import type { ElectronApplication } from '@playwright/test'
import { writeFileSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { SessionData } from '../../src/shared/types'

// Phase 1 fast-follow — the on-save overwrite guard's headline gap: the app is closed, the file
// changes on disk, and boot() restores the buffer from session *without* re-reading disk, so no
// watcher event ever announces the change. Saving must warn instead of silently clobbering.

// Ctrl+S is a native menu accelerator and can't be driven from the page, so click File ▸ Save in
// the main process (same pattern as clean-quit.spec.ts's File ▸ Exit).
async function saveViaMenu(app: ElectronApplication) {
  await app.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu()!
    const file = menu.items.find(i => i.label === 'File')!
    const save = file.submenu!.items.find(i => i.label === 'Save')!
    save.click()
  })
}

async function quitViaMenu(app: ElectronApplication) {
  const child = app.process()
  const closed = app.waitForEvent('close', { timeout: 10_000 })
  await Promise.all([
    closed,
    app.evaluate(({ Menu }) => {
      const file = Menu.getApplicationMenu()!.items.find(item => item.label === 'File')!
      file.submenu!.items.find(item => item.label === 'Exit')!.click()
    }).catch(async () => {
      // Ignore a torn-down evaluation context only if the app really closes.
      await closed
    }),
  ])
  await expect.poll(() => child.exitCode, { timeout: 10_000 }).toBe(0)
}

test('saving a file that changed on disk while the app was closed warns first', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-overwrite-')
  const filePath = join(userDataDir, 'note.txt')
  writeFileSync(filePath, 'original')
  const originalMtime = statSync(filePath).mtimeMs

  // 1. Open the file and quit clean. Session persists the buffer *and* its diskMtime baseline.
  const app1 = await smoke.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, filePath],
    env: { ...process.env, NC_HEADLESS: '1', NC_TEST_SESSION_SAVE_DELAY_MS: '1000' },
  })
  // The fixture owns bounded fallback cleanup for both apps if any step fails.
  const win1 = await app1.firstWindow()
  await expect(win1.locator('body[data-booted="true"]')).toBeVisible()
  await expect(win1.locator('#paneA .view-lines')).toContainText('original')
  await expect(win1.locator('.sb-state')).toHaveText('● saved')
  // app.close() skips the renderer's session flush; use the real quit path.
  await test.step('First app exits normally through File → Exit', () => quitViaMenu(app1))

  // Verify the restart precondition independently of the restored tab's appearance.
  const session = JSON.parse(readFileSync(join(userDataDir, 'session', 'session.json'), 'utf8')) as SessionData
  expect(session.buffers).toHaveLength(1)
  expect(session.activeId).toBe(session.buffers[0].id)
  expect(session.buffers[0]).toMatchObject({
    filePath, title: 'note.txt', content: 'original', dirty: false, diskMtime: originalMtime,
  })

  // 2. Someone else changes the file while we are not running. Nothing is watching.
  writeFileSync(filePath, 'theirs')
  expect(statSync(filePath).mtimeMs).not.toBe(originalMtime)

  // 3. Relaunch on the same profile with NO file arg, so the buffer comes back from session
  //    (stale content + stale diskMtime) instead of being re-read fresh from disk.
  const app2 = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  const win2 = await app2.firstWindow()
  await expect(win2.locator('body[data-booted="true"]')).toBeVisible()
  await expect(win2.locator('.tab', { hasText: 'note.txt' })).toBeVisible()
  await expect(win2.locator('#paneA .view-lines')).toContainText('original')

  // Dirty the restored buffer, then save → the guard must catch the stale baseline.
  await win2.locator('#paneA .monaco-editor').click()
  await win2.keyboard.type(' MINE')
  await expect(win2.locator('.sb-state')).toHaveText('● unsaved')
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
  await expect(win2.locator('body')).toHaveAttribute('data-save-write-completion-count', '1')
  await expect(win2.locator('body')).toHaveAttribute('data-save-write-last-completion-dirty', 'false')
  await expect(win2.locator('.sb-state')).toHaveText('● saved')
  expect(readFileSync(filePath, 'utf8')).toContain('MINE')
  await test.step('Second app exits normally through File → Exit', () => quitViaMenu(app2))
})
