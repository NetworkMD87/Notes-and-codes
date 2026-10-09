import { test, expect } from './smokeTest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { openSettings } from './settingsHelper'

test('Libron is bundled for editor and interface fonts and survives restart', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-libron-')
  const launch = () => smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  const app = await launch()
  const win = await app.firstWindow()
  await expect(win.locator('body')).toHaveAttribute('data-booted', 'true')
  await openSettings(win, 'Font')
  await win.getByLabel('Editor font', { exact: true }).selectOption('Libron')
  await win.getByLabel('Interface font', { exact: true }).selectOption('Libron')
  await win.getByRole('button', { name: 'Close Settings' }).click()
  await win.locator('.tb-btn[title="Toggle split pane"]').click()

  async function checkFonts(page: typeof win): Promise<void> {
    const faces = await page.evaluate(async () => {
      const results = await Promise.all(['16px Libron', 'italic 16px Libron', 'bold 16px Libron', 'italic bold 16px Libron']
        .map(spec => document.fonts.load(spec)))
      return results.map(fonts => fonts.map(font => ({ family: font.family, status: font.status })))
    })
    for (const result of faces) expect(result).toEqual([{ family: 'Libron', status: 'loaded' }])
    for (const pane of ['#paneA', '#paneB']) {
      await expect(page.locator(`${pane} .view-lines`)).toHaveCSS('font-family', /Libron/)
    }
    await expect(page.getByRole('button', { name: 'Settings' })).toHaveCSS('font-family', /Libron/)
    await expect(page.locator('body')).toHaveCSS('--hint-font', "'Libron', serif")
    await expect(page.locator('body')).toHaveCSS('--content-font', "'Libron', serif")
  }

  await checkFonts(win)
  await expect.poll(() => JSON.parse(readFileSync(join(userDataDir, 'settings.json'), 'utf8'))).toMatchObject({
    fontFamily: 'Libron', uiFontFamily: 'Libron',
  })
  await app.close()
  const restarted = await launch()
  const restored = await restarted.firstWindow()
  await expect(restored.locator('body')).toHaveAttribute('data-booted', 'true')
  await checkFonts(restored)
  await openSettings(restored, 'Font')
  await expect(restored.getByLabel('Editor font', { exact: true })).toHaveValue('Libron')
  await expect(restored.getByLabel('Interface font', { exact: true })).toHaveValue('Libron')
})
