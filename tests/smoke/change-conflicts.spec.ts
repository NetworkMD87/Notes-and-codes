import { test, expect } from './smokeTest'
import { statSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Audit Phase 4 — M7: two files changing on disk while dirty must both stay resolvable.
// Before, the second conflict's bar replaced the first with no way back to it.

test('two on-disk conflicts queue in the change bar, one resolvable at a time', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-conflict-')
  const fileA = join(userDataDir, 'a.txt'); writeFileSync(fileA, 'alpha')
  const fileB = join(userDataDir, 'b.txt'); writeFileSync(fileB, 'beta')
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
    const win = await app.firstWindow()
    await expect(win.locator('body[data-booted="true"]')).toBeVisible()

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
    await expect(bar.locator('.toast-glyph svg')).toBeVisible() // warning glyph renders on the banner
    await expect(bar).toContainText('1 more', { timeout: 8000 }) // one shown, one queued

    // Resolve the first (Keep mine) → the second surfaces, and it's the last one.
    await bar.locator('button', { hasText: 'Keep mine' }).click()
    await expect(bar).toBeVisible()
    await expect(bar).not.toContainText('more')

    // Resolve the second → the bar hides.
    await bar.locator('button', { hasText: 'Keep mine' }).click()
    await expect(bar).toBeHidden()
})

test('Keep mine ignores only the acknowledged disk version', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-conflict-version-')
  const filePath = join(userDataDir, 'versioned.txt')
  writeFileSync(filePath, 'disk-original')
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, filePath] })
  const win = await app.firstWindow()
  await expect(win.locator('body[data-booted="true"]')).toBeVisible()
  await expect(win.locator('.tab', { hasText: 'versioned.txt' })).toBeVisible()

  await win.locator('#paneA .monaco-editor').click()
  await win.keyboard.type(' MY-EDIT')
  // Disable the real watcher so each notification below has one deterministic source.
  await win.evaluate(() => window.api.watchPaths([]))

  const sendFileChanged = async () => {
    const before = Number(await win.locator('body').getAttribute('data-file-change-receipt') ?? 0)
    await app.evaluate(({ BrowserWindow }, path) =>
      BrowserWindow.getAllWindows()[0].webContents.send('file:changed', path), filePath)
    await expect.poll(async () => Number(
      await win.locator('body').getAttribute('data-file-change-receipt') ?? 0
    )).toBeGreaterThan(before)
  }

  writeFileSync(filePath, 'disk-version-one')
  await sendFileChanged()
  const bar = win.locator('#change-bar')
  await expect(bar).toBeVisible()

  await bar.locator('button', { hasText: 'Keep mine' }).click()
  await expect(bar).toBeHidden()
  const acknowledgedTime = statSync(filePath).mtime

  // A delayed duplicate watcher event for the exact acknowledged bytes stays ignored.
  await sendFileChanged()
  await expect(bar).toBeHidden()

  // Content that changes while preserving the acknowledged timestamp is still a new version.
  writeFileSync(filePath, 'disk-version-two')
  utimesSync(filePath, acknowledgedTime, acknowledgedTime)
  await sendFileChanged()
  await expect(bar).toBeVisible()
})
