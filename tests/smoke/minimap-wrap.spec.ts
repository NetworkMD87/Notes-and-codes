import { test, expect } from './smokeTest'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { openSettings } from './settingsHelper'

const LONG_LINE = [
  'Minimap wrapping regression:',
  ...Array.from({ length: 24 }, (_, index) => `segment-${String(index).padStart(2, '0')}`),
  'WRAP_SENTINEL',
  'tail text remains visible after wrapping.',
].join(' ')

interface WrapGeometry {
  wrappedRows: number
  minimapLeft: number
  overlap: { character: string; left: number; right: number } | null
}

async function wrapGeometry(win: import('@playwright/test').Page): Promise<WrapGeometry> {
  return win.locator('#paneA .monaco-editor').evaluate((editor) => {
    const minimap = editor.querySelector<HTMLElement>('.minimap')
    const viewLines = editor.querySelector<HTMLElement>('.view-lines')
    if (!minimap || !viewLines) throw new Error('Monaco layout is incomplete')

    const minimapLeft = minimap.getBoundingClientRect().left
    const walker = document.createTreeWalker(viewLines, NodeFilter.SHOW_TEXT)
    const range = document.createRange()
    let overlap: WrapGeometry['overlap'] = null

    while (!overlap && walker.nextNode()) {
      const node = walker.currentNode as Text
      for (let offset = 0; offset < node.data.length; offset++) {
        range.setStart(node, offset)
        range.setEnd(node, offset + 1)
        const rect = range.getBoundingClientRect()
        if (rect.width > 0 && rect.right > minimapLeft + 0.5) {
          overlap = {
            character: node.data[offset],
            left: rect.left,
            right: rect.right,
          }
          break
        }
      }
    }

    return {
      wrappedRows: viewLines.querySelectorAll('.view-line').length,
      minimapLeft,
      overlap,
    }
  })
}

test('word-wrapped text stops before the minimap', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-minimap-wrap-user-')
  const fixtureDir = smoke.tempDir('notes-minimap-wrap-file-')
  const fixturePath = join(fixtureDir, 'minimap-wrap.txt')
  writeFileSync(join(userDataDir, 'settings.json'), JSON.stringify({
    fontFamily: 'Fira Code',
    fontSize: 20,
    showMinimap: true,
    windowBounds: { x: 0, y: 0, width: 1920, height: 1080 },
  }))
  writeFileSync(fixturePath, LONG_LINE)

  const app = await smoke.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, fixturePath],
  })
  const win = await app.firstWindow()
  await expect(win.locator('body')).toHaveAttribute('data-booted', 'true')
  await expect(win.locator('#paneA .minimap')).toBeVisible()
  await expect.poll(() => win.evaluate(() => document.fonts.status)).toBe('loaded')
  await expect.poll(async () => (await wrapGeometry(win)).wrappedRows).toBeGreaterThan(1)

  expect(await wrapGeometry(win)).toMatchObject({ overlap: null })
})

test('Show minimap defaults off and persists both states', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-minimap-setting-user-')
  const fixtureDir = smoke.tempDir('notes-minimap-setting-file-')
  const fixturePath = join(fixtureDir, 'minimap-setting.txt')
  writeFileSync(fixturePath, LONG_LINE)

  let app = await smoke.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, fixturePath],
  })
  let win = await app.firstWindow()
  await expect(win.locator('body')).toHaveAttribute('data-booted', 'true')
  await expect(win.locator('#paneA .minimap')).toBeHidden()

  await openSettings(win, 'Editor')
  const checkbox = win.getByLabel('Show minimap')
  await expect(checkbox).not.toBeChecked()
  await checkbox.click()
  await expect(checkbox).toBeChecked()
  await expect(win.locator('#paneA .minimap')).toBeVisible()
  await expect.poll(() => JSON.parse(readFileSync(join(userDataDir, 'settings.json'), 'utf8')).showMinimap)
    .toBe(true)

  await checkbox.click()
  await expect(win.locator('#paneA .minimap')).toBeHidden()
  await expect.poll(() => JSON.parse(readFileSync(join(userDataDir, 'settings.json'), 'utf8')).showMinimap)
    .toBe(false)
  await app.close()

  app = await smoke.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, fixturePath],
  })
  win = await app.firstWindow()
  await expect(win.locator('body')).toHaveAttribute('data-booted', 'true')
  await expect(win.locator('#paneA .minimap')).toBeHidden()
  await openSettings(win, 'Editor')
  await expect(win.getByLabel('Show minimap')).not.toBeChecked()
  await win.getByLabel('Show minimap').click()
  await expect.poll(() => JSON.parse(readFileSync(join(userDataDir, 'settings.json'), 'utf8')).showMinimap)
    .toBe(true)
  await app.close()

  app = await smoke.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, fixturePath],
  })
  win = await app.firstWindow()
  await expect(win.locator('body')).toHaveAttribute('data-booted', 'true')
  await expect(win.locator('#paneA .minimap')).toBeVisible()
  await openSettings(win, 'Editor')
  await expect(win.getByLabel('Show minimap')).toBeChecked()
})
