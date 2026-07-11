import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Audit Phase 2 — H4 (a malformed session must not brick startup) and
// H3 (opening a file from Explorer while hidden to tray must show the window).

test('a malformed session entry does not brick startup', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-badsession-'))
  mkdirSync(join(userDataDir, 'session'), { recursive: true })
  // A null entry used to make bufferManager.restore() throw inside the un-caught boot(),
  // leaving a blank window with no tabs until the user hand-deleted session.json.
  writeFileSync(join(userDataDir, 'session', 'session.json'), JSON.stringify({
    buffers: [
      null,
      { id: 'good', title: 'Recovered', filePath: null, content: 'still here', language: 'plaintext', eol: 'LF', encoding: 'utf8', dirty: false }
    ],
    activeId: 'good'
  }))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    // The app comes up with a working tab instead of a dead blank window.
    await expect(win.locator('.tab')).toHaveCount(1)
    await expect(win.locator('#paneA .view-lines')).toContainText('still here')
  } finally {
    await app.close(); rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('a file opened while hidden to tray shows the window', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-trayshow-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()

    // Resting state: X hides to tray (does not quit).
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].hide())
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible())).toBe(false)

    // A second instance ("Open with Notes & Codes") forwards its argv via second-instance.
    await app.evaluate(({ app: electronApp }) => { electronApp.emit('second-instance', {}, ['electron', '.']) })

    // The window must actually appear — restore()/focus() alone don't show a hidden window.
    await expect.poll(
      () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
      { timeout: 5000 }
    ).toBe(true)
  } finally {
    await app.close(); rmSync(userDataDir, { recursive: true, force: true })
  }
})
