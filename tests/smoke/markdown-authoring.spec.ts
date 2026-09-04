import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect } from './smokeTest'
import { waitForBoot } from './appReady'

test('Markdown authoring keeps marker carets, continues CRLF mid-items, and leaves modified chords alone', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-markdown-authoring-')
  const markdownPath = join(userDataDir, 'authoring.md')
  writeFileSync(markdownPath, 'note\r\ntrailing')
  const app = await smoke.launch({
    args: ['out/main/index.js', markdownPath, `--user-data-dir=${userDataDir}`],
  })
  const win = await app.firstWindow()
  await waitForBoot(win)

  const editor = win.locator('#paneA .monaco-editor')
  await editor.click()
  await win.keyboard.press('Control+Home')
  await win.getByRole('button', { name: 'Markdown tools' }).click()
  await win.getByRole('menuitem', { name: 'Heading' }).click()
  await win.keyboard.type('title')
  await expect(win.locator('#paneA .view-lines')).toContainText('# titlenote')

  await win.keyboard.press('Control+a')
  await win.keyboard.insertText('- abcdef\r\ntrailing')
  await win.keyboard.press('Control+Home')
  for (let index = 0; index < 5; index += 1) await win.keyboard.press('ArrowRight')
  await win.keyboard.press('Enter')
  await expect(win.locator('#paneA .view-lines')).toContainText('- abc')
  await expect(win.locator('#paneA .view-lines')).toContainText('- def')
  await win.getByRole('button', { name: 'Save' }).click()
  await expect.poll(() => readFileSync(markdownPath, 'utf8')).toBe('- abc\r\n- def\r\ntrailing')

  await win.keyboard.press('Control+End')
  await win.keyboard.press('Control+Enter')
  await win.keyboard.press('Control+Tab')
  await win.getByRole('button', { name: 'Save' }).click()
  await expect.poll(() => readFileSync(markdownPath, 'utf8')).toBe('- abc\r\n- def\r\ntrailing')
})
