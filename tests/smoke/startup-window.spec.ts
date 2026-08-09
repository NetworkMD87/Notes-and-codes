import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import electronPath from 'electron'
import { test, expect } from './smokeTest'

// Audit Phase 2 — H4 (a malformed session must not brick startup) and
// H3 (opening a file from Explorer while hidden to tray must show the window).

test('a malformed session entry does not brick startup', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-badsession-')
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
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  const win = await app.firstWindow()
  await expect(win.locator('#tabbar')).toBeVisible()
  // The app comes up with a working tab instead of a dead blank window.
  await expect(win.locator('.tab')).toHaveCount(1)
  await expect(win.locator('#paneA .view-lines')).toContainText('still here')
})

test('one rejected startup read preserves other state and reaches booted', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-startup-partial-')
  mkdirSync(join(userDataDir, 'session'), { recursive: true })
  writeFileSync(join(userDataDir, 'settings.json'), JSON.stringify({ themeId: 'light' }))
  writeFileSync(join(userDataDir, 'clipboard-history.json'), JSON.stringify(['preserved clip']))
  writeFileSync(join(userDataDir, 'session', 'session.json'), JSON.stringify({
    buffers: [{
      id: 'kept',
      title: 'Recovered',
      filePath: null,
      content: 'other reads survived',
      language: 'plaintext',
      eol: 'LF',
      encoding: 'utf8',
      dirty: false,
    }],
    activeId: 'kept',
  }))

  const app = await smoke.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`],
    env: { ...process.env, NC_TEST_FAIL_STARTUP_READ: 'snippets' },
  })
  const win = await app.firstWindow()

  await expect(win.locator('body[data-booted="true"]')).toBeVisible()
  await expect(win.locator('body')).toHaveAttribute('data-theme', 'light')
  await expect(win.locator('#paneA .view-lines')).toContainText('other reads survived')
  const startupWarnings = win.locator('.toast--warning')
  await expect(startupWarnings).toHaveCount(1)
  await expect(startupWarnings).toHaveText('Some saved state could not be loaded. Defaults were used.')

  await win.keyboard.press('Control+Shift+P')
  await win.locator('#palette input').fill('Paste from History')
  await win.keyboard.press('Enter')
  await expect(win.locator('.ph-picker')).toContainText('preserved clip')
})

test('a real second process forwards its file arg and shows the hidden window', async ({ smoke }) => {
  // The previous version of this test faked the handoff with
  // `app.emit('second-instance', {}, ['electron', '.'])`, which reached exactly one line of
  // production code (showWindow()). This spawns a genuine second OS process against the SAME
  // --user-data-dir, so Electron's real single-instance lock, the real forwarded argv,
  // pickFileArg, and the open-file IPC all have to work for it to pass.
  // Falsified: stubbing out the handler's `send('open-file', f)` in src/main/index.ts turns this
  // red on the tab-count assertion (2 -> 1, all retries) while the visibility poll still passes.
  test.setTimeout(90000)
  const userDataDir = smoke.tempDir('notes-2proc-')
  const notePath = join(userDataDir, 'note.txt')
  const payload = 'delivered by the second instance'
  writeFileSync(notePath, payload, 'utf8')

  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
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
  const second = smoke.trackChild(
    spawn(
      electronPath as unknown as string,
      ['out/main/index.js', `--user-data-dir=${userDataDir}`, notePath],
      { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] },
    ),
    'second-instance',
  )
  // Without this, a non-zero exit or a 30s hang reports a bare number and nothing else.
  // hotkey-conflict.spec.ts does the same for its second instance.
  let secondOut = ''
  second.stdout?.on('data', (d) => { secondOut += d.toString() })
  second.stderr?.on('data', (d) => { secondOut += d.toString() })

  // B must lose the lock and quit cleanly rather than opening a rival window.
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`second instance did not exit within 30s. Output:\n${secondOut}`)), 30000)
    second.on('exit', (code) => { clearTimeout(timer); resolve(code) })
    second.on('error', (err) => { clearTimeout(timer); reject(err) })
  })
  expect(exitCode, `second instance output:\n${secondOut}`).toBe(0)

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
})

test('--hidden starts the window parked in the tray, and it can still be shown', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-hidden-')
  const app = await smoke.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, '--hidden'],
  })
  const win = await app.firstWindow()
  // The window exists and the renderer loads (that's what makes the summon instant) —
  // it is simply not shown. Poll: BrowserWindow visibility settles after the load.
  await expect
    .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible()), { timeout: 5000 })
    .toBe(false)

  // The app is alive behind the hidden window, and showing it works — this is the
  // path the tray click and the summon hotkey both take (showWindow()).
  await expect(win.locator('#tabbar')).toBeAttached()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.show())
  await expect
    .poll(() => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible()), { timeout: 5000 })
    .toBe(true)
})
