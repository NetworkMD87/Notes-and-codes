import { test, expect } from './smokeTest'
import { waitForBoot } from './appReady'

test('the app window denies popups and top-level navigation', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-security-boundaries-')
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  const win = await app.firstWindow()
  await waitForBoot(win)

  const popupWasCreated = await win.evaluate(() => window.open('data:text/html,popup') !== null)
  expect(popupWasCreated).toBe(false)

  const navigationWasPrevented = await app.evaluate(async ({ BrowserWindow }) => {
    const contents = BrowserWindow.getAllWindows()[0]?.webContents
    if (!contents) return false

    const prevented = new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => resolve(false), 5_000)
      contents.once('will-navigate', (event) => {
        clearTimeout(timeout)
        resolve(event.defaultPrevented)
      })
    })

    await contents.executeJavaScript("window.location.href = 'https://example.invalid/navigation'")
    return prevented
  })
  expect(navigationWasPrevented).toBe(true)
})
