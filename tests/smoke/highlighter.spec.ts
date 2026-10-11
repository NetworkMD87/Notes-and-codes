import type { Page } from '@playwright/test'
import { test, expect } from './smokeTest'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { waitForBoot } from './appReady'
import { quitViaMenu, runPaletteCommand } from './appActions'

const TEXT = 'hello world foo bar baz'

async function waitForFile(win: Page, filePath: string) {
  await waitForBoot(win)
  await expect(win.getByRole('tab', { name: `note.txt, ${filePath}`, exact: true })).toBeVisible()
  await expect(win.locator('#paneA .view-line').filter({ hasText: TEXT })).toHaveText(TEXT)
}

async function enableHighlighter(win: Page) {
  await runPaletteCommand(win, 'Toggle Highlighter')
  await expect(win.locator('#paneA')).toHaveClass(/\bhl-mode\b/)
  await expect.poll(() => win.locator('#paneA .view-lines').evaluate(el => getComputedStyle(el).cursor))
    .toContain('data:image/svg+xml')
}

async function dragPaint(win: Page) {
  await expect(win.locator('#paneA')).toHaveClass(/\bhl-mode\b/)
  const line = win.locator('#paneA .view-line').filter({ hasText: TEXT })
  await expect(line).toHaveText(TEXT)
  // Target rendered glyphs rather than a fixed offset inside the viewport's padding.
  const box = await line.evaluate(el => {
    const range = document.createRange()
    range.selectNodeContents(el)
    const rect = range.getBoundingClientRect()
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  })
  expect(box.width).toBeGreaterThan(0)
  expect(box.height).toBeGreaterThan(0)
  const y = box.y + box.height / 2
  await win.mouse.move(box.x + 1, y)
  await win.mouse.down()
  await win.mouse.move(box.x + box.width / 2, y, { steps: 8 })
  await win.mouse.up()
  await expect(win.locator('#paneA .hl-yellow').first()).toBeVisible()
}

test('highlighter paints a decoration and Clear removes it', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-hl-')
  const filePath = join(userDataDir, 'note.txt')
  writeFileSync(filePath, TEXT)
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, filePath] })
  const win = await app.firstWindow()
  await waitForFile(win, filePath)
  await enableHighlighter(win)
  await dragPaint(win)
  await runPaletteCommand(win, 'Clear Highlights (current file)')
  await expect(win.locator('#paneA .hl-yellow')).toHaveCount(0)
})

test('highlights persist across a relaunch', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-hl2-')
  const filePath = join(userDataDir, 'note.txt')
  writeFileSync(filePath, TEXT)
  const app1 = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, filePath] })
  const win1 = await app1.firstWindow()
  await waitForFile(win1, filePath)
  await enableHighlighter(win1)
  await dragPaint(win1)
  const painted = await win1.locator('#paneA .hl-yellow').first().innerText()
  // A visible decoration is immediate; independently observe the debounced disk write.
  await expect.poll(() => {
    try {
      return JSON.parse(readFileSync(join(userDataDir, 'highlights.json'), 'utf8'))[filePath] ?? []
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
  }, { message: 'Painted range must be persisted before restart' })
    .toEqual([{ start: 0, end: painted.length, colour: 'yellow' }])
  await test.step('First highlighter app exits normally', () => quitViaMenu(app1))

  const app2 = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, filePath] })
  const win2 = await app2.firstWindow()
  await waitForFile(win2, filePath)
  await expect(win2.locator('#paneA .hl-yellow').first()).toHaveText(painted)
  await test.step('Restored highlighter app exits normally', () => quitViaMenu(app2))
})

test('the active highlighter colour persists across a relaunch', async ({ smoke }) => {
  test.slow()
  const userDataDir = smoke.tempDir('notes-hl-colour-')
  let selectedCursor = ''
  await test.step('select blue in the first launch', async () => {
    const app1 = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
    const win1 = await app1.firstWindow()
    await waitForBoot(win1)
    await win1.locator('.tb-btn[title="Highlight colour"]').click()
    await win1.locator('.tb-swatch[title="blue"]').click()
    await expect(win1.locator('.tb-btn[title^="Highlighter (blue)"]')).toBeVisible()
    selectedCursor = await win1.locator('body').evaluate(body => body.style.getPropertyValue('--hl-cursor'))
    await expect.poll(() => {
      try {
        return JSON.parse(readFileSync(join(userDataDir, 'settings.json'), 'utf8')).lastHighlightColour
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
        throw error
      }
    }, { message: 'Blue highlighter colour must be saved before closing' }).toBe('blue')
    await quitViaMenu(app1)
  })
  await test.step('restore blue in the second launch', async () => {
    const app2 = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
    const win2 = await app2.firstWindow()
    await waitForBoot(win2)
    await expect(win2.locator('.tb-btn[title^="Highlighter (blue)"]')).toBeVisible()
    await expect(win2.locator('#paneA')).not.toHaveClass(/\bhl-mode\b/)
    await expect.poll(() => win2.locator('body').evaluate(body => body.style.getPropertyValue('--hl-cursor')))
      .toBe(selectedCursor)
    await quitViaMenu(app2)
  })
})

test('highlight colour popup shows 18 swatches (3x6)', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-hl18-')
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  const win = await app.firstWindow()
  await waitForBoot(win)
  await win.locator('.tb-btn[title="Highlight colour"]').click()
  await expect(win.locator('.tb-hl-pop')).toBeVisible()
  await expect(win.locator('.tb-hl-pop .tb-swatch')).toHaveCount(18)
})

test('highlight mode uses the pen cursor and updates with the colour', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-hlcur-')
  const filePath = join(userDataDir, 'note.txt')
  writeFileSync(filePath, TEXT)
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, filePath] })
  const win = await app.firstWindow()
  await waitForFile(win, filePath)
  await enableHighlighter(win)
  const cursorOf = () => win.locator('#paneA .view-lines').evaluate(el => getComputedStyle(el).cursor)
  const yellow = await cursorOf()
  expect(yellow).toContain('data:image/svg+xml')
  await win.locator('.tb-btn[title="Highlight colour"]').click()
  await win.locator('.tb-hl-pop .tb-swatch').nth(7).click()
  await expect.poll(cursorOf).not.toBe(yellow)
})

test('the pen cursor image is not blocked by the CSP', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-hlcsp-')
  const filePath = join(userDataDir, 'note.txt')
  writeFileSync(filePath, TEXT)
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, filePath] })
  const win = await app.firstWindow()
  const violations: string[] = []
  win.on('console', m => { if (/Content.Security.Policy/i.test(m.text())) violations.push(m.text()) })
  await waitForFile(win, filePath)
  await enableHighlighter(win)
  await dragPaint(win)
  expect(violations).toEqual([])
})
