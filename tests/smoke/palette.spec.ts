import { test, expect } from './smokeTest'

test('palette shortcut hints render as one kbd chip per key', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-smoke-')
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    await win.keyboard.press('Control+Shift+P')
    await win.locator('#palette input').fill('Save All') // hint 'Ctrl+Shift+S'
    const chips = win.locator('.palette-row', { hasText: 'Save All' }).locator('.kbd')
    await expect(chips).toHaveCount(3)
    await expect(chips.nth(0)).toHaveText('Ctrl')
    await expect(chips.nth(2)).toHaveText('S')
})
