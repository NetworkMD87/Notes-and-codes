import { test, expect } from './smokeTest'

// Regression: a second instance that can't register the global hotkey (because the
// first instance — or any other app — already holds it) must NOT freeze on a blocking
// modal. It must load, stay responsive, and surface the conflict via a non-blocking toast.
// (Before the fix, dialog.showErrorBox blocked startup → 30s timeouts across the suite.)
test('hotkey conflict does not freeze a second instance', async ({ smoke }) => {
  test.setTimeout(90000)
  // Strip NC_HEADLESS (set globally in playwright.config) so this spec exercises the
  // real global-hotkey path that other smoke tests deliberately skip.
  const { NC_HEADLESS: _omit, ...liveEnv } = process.env
  const dirA = smoke.tempDir('notes-hkA-')
  const appA = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${dirA}`], env: liveEnv as Record<string, string> })
  const dirB = smoke.tempDir('notes-hkB-')
  const winA = await appA.firstWindow()
  await winA.waitForSelector('body[data-booted="true"]')

  const appB = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${dirB}`], env: liveEnv as Record<string, string> })
  let bStderr = ''
  appB.process().stderr?.on('data', (d) => { bStderr += d.toString() })

  const winB = await appB.firstWindow()
  // Primary assertion (always holds): B is responsive, not frozen behind a modal.
  await winB.waitForSelector('body[data-booted="true"]', { timeout: 8000 })
  await winB.keyboard.press('Control+Shift+P')
  await expect(winB.locator('#palette .palette-box input')).toBeVisible({ timeout: 5000 })
  await winB.keyboard.press('Escape')

  // Secondary: when B's registration actually lost the race, it must toast (not modal).
  if (/global hotkey registration failed/.test(bStderr)) {
    await expect(winB.locator('.toast')).toContainText('unavailable', { timeout: 5000 })
  }
})
