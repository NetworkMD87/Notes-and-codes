import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import electronPath from 'electron'

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

test('a real second process forwards its file arg and shows the hidden window', async () => {
  // The previous version of this test faked the handoff with
  // `app.emit('second-instance', {}, ['electron', '.'])`, which reached exactly one line of
  // production code (showWindow()). This spawns a genuine second OS process against the SAME
  // --user-data-dir, so Electron's real single-instance lock, the real forwarded argv,
  // pickFileArg, and the open-file IPC all have to work for it to pass.
  test.setTimeout(90000)
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-2proc-'))
  const notePath = join(userDataDir, 'note.txt')
  const payload = 'delivered by the second instance'
  writeFileSync(notePath, payload, 'utf8')

  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  let second: ChildProcess | undefined
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    await expect(win.locator('.tab')).toHaveCount(1)

    // Resting state: X hides to tray (does not quit). This is the load-bearing part —
    // restore()/focus() alone do not show a hidden window, which was the H3 bug.
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].hide())
    await expect.poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible())).toBe(false)

    // Spawn a REAL second instance the way "Open with Notes & Codes" does: same entry script,
    // same user-data-dir (so it hits the same single-instance lock), plus a file to open.
    // env: process.env carries NC_HEADLESS from playwright.config.ts, so B skips the global hotkey.
    second = spawn(electronPath as unknown as string,
      ['out/main/index.js', `--user-data-dir=${userDataDir}`, notePath],
      { env: process.env, stdio: 'ignore' })

    // B must lose the lock and quit cleanly rather than opening a rival window.
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('second instance did not exit within 30s')), 30000)
      second!.on('exit', (code) => { clearTimeout(timer); resolve(code) })
      second!.on('error', (err) => { clearTimeout(timer); reject(err) })
    })
    expect(exitCode).toBe(0)

    // A's second-instance handler must call showWindow() — not just restore()/focus().
    await expect.poll(
      () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()),
      { timeout: 10000 }
    ).toBe(true)

    // ...and the forwarded argv must have survived pickFileArg and the open-file IPC.
    // Count is 2: the startup Untitled-1 plus the opened file (BufferManager.open() only
    // reuses a buffer whose filePath already matches; it never recycles an empty untitled).
    await expect(win.locator('.tab')).toHaveCount(2, { timeout: 10000 })
    await expect(win.locator('.tab')).toContainText(['Untitled-1', 'note.txt'])
    await expect(win.locator('#paneA .view-lines')).toContainText(payload)
  } finally {
    if (second && second.exitCode === null && !second.killed) second.kill()
    await app.close(); rmSync(userDataDir, { recursive: true, force: true })
  }
})
