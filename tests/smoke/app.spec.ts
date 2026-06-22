import { test, expect, _electron as electron } from '@playwright/test'

test('launches, creates tabs, splits, toggles theme', async () => {
  const app = await electron.launch({ args: ['out/main/index.js'] })
  const win = await app.firstWindow()
  await expect(win.locator('#tabbar')).toBeVisible()

  // new tab via palette
  await expect(win.locator('.tab').first()).toBeVisible()
  const initialTabCount = await win.locator('.tab').count()
  await win.keyboard.press('Control+Shift+P')
  await win.locator('#palette input').fill('New Tab')
  await win.keyboard.press('Enter')
  await expect(win.locator('.tab')).toHaveCount(initialTabCount + 1)

  // toggle split
  await win.keyboard.press('Control+Shift+P')
  await win.locator('#palette input').fill('Toggle Split')
  await win.keyboard.press('Enter')
  await expect(win.locator('#paneB')).toBeVisible()

  // toggle theme
  await win.click('#theme-toggle')
  const theme = await win.evaluate(() => document.body.dataset.theme)
  expect(['light', 'dark']).toContain(theme)

  await app.close()
})
