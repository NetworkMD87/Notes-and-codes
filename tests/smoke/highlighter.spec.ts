import type { Page } from '@playwright/test'
import { test, expect } from './smokeTest'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const TEXT = 'hello world foo bar baz'

async function runCmd(win: Page, label: string) {
  await win.keyboard.press('Control+Shift+P')
  await win.locator('#palette input').fill(label)
  await win.keyboard.press('Enter')
}

async function dragPaint(win: Page) {
  const line = win.locator('#paneA .view-lines')
  const box = await line.boundingBox()
  if (!box) throw new Error('no editor box')
  const y = box.y + 8
  await win.mouse.move(box.x + 4, y)
  await win.mouse.down()
  await win.mouse.move(box.x + 70, y, { steps: 8 })
  await win.mouse.up()
}

test('highlighter paints a decoration and Clear removes it', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-hl-')
  const filePath = join(userDataDir, 'note.txt')
  writeFileSync(filePath, TEXT)
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, filePath] })
    const win = await app.firstWindow()
    await expect(win.locator('#paneA .view-lines')).toContainText('hello')
    await runCmd(win, 'Toggle Highlighter')
    await dragPaint(win)
    await expect(win.locator('#paneA .hl-yellow').first()).toBeVisible()
    await runCmd(win, 'Clear Highlights')
    await expect(win.locator('#paneA .hl-yellow')).toHaveCount(0)
})

test('highlights persist across a relaunch', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-hl2-')
  const filePath = join(userDataDir, 'note.txt')
  writeFileSync(filePath, TEXT)

  const app1 = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, filePath] })
    const win1 = await app1.firstWindow()
    await expect(win1.locator('#paneA .view-lines')).toContainText('hello')
    await runCmd(win1, 'Toggle Highlighter')
    await dragPaint(win1)
    await expect(win1.locator('#paneA .hl-yellow').first()).toBeVisible()
    await win1.waitForTimeout(800) // let the ~600ms debounced save flush
    await app1.close()

  const app2 = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, filePath] })
    const win2 = await app2.firstWindow()
    await expect(win2.locator('#paneA .hl-yellow').first()).toBeVisible()
})

test('highlight colour popup shows 18 swatches (3x6)', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-hl18-')
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    await win.locator('.tb-caret').click()
    await expect(win.locator('.tb-hl-pop')).toBeVisible()
    await expect(win.locator('.tb-hl-pop .tb-swatch')).toHaveCount(18)
})

test('highlight mode uses the pen cursor and updates with the colour', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-hlcur-')
  const filePath = join(userDataDir, 'note.txt')
  writeFileSync(filePath, TEXT)
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, filePath] })
    const win = await app.firstWindow()
    await expect(win.locator('#paneA .view-lines')).toContainText('hello')
    await runCmd(win, 'Toggle Highlighter')

    const cursorOf = () => win.locator('#paneA .view-lines').evaluate(el => getComputedStyle(el).cursor)
    const yellow = await cursorOf()
    expect(yellow).toContain('data:image/svg+xml')

    // pick Blue from the toolbar popup (swatch order = HIGHLIGHT_COLOURS)
    await win.locator('.tb-caret').click()
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
    win.on('console', (m) => { if (/Content.Security.Policy/i.test(m.text())) violations.push(m.text()) })
    await expect(win.locator('#paneA .view-lines')).toContainText('hello')
    await runCmd(win, 'Toggle Highlighter')
    await dragPaint(win)
    await expect(win.locator('#paneA .hl-yellow').first()).toBeVisible()
    expect(violations).toEqual([])
})
