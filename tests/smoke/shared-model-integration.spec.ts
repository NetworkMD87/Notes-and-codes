import type { ElectronApplication, Page } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect } from './smokeTest'

async function fileCommand(app: ElectronApplication, label: string): Promise<void> {
  await app.evaluate(({ Menu }, name) => {
    const menu = Menu.getApplicationMenu()!.items.find(item => item.label === 'File')!
    menu.submenu!.items.find(item => item.label === name)!.click()
  }, label)
}

async function share(win: Page): Promise<void> {
  await win.locator('.tb-btn[title="Toggle split pane"]').click()
  await win.locator('#paneB .monaco-editor').click()
  await win.getByRole('tab', { name: 'shared.txt', exact: true }).click()
  await expect(win.locator('#paneB .view-lines')).toContainText('current note')
}

test('history restore replaces both shared views and preserves highlights through the next edit', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-shared-history-')
  const filePath = join(userDataDir, 'shared.txt')
  writeFileSync(filePath, 'current note')
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  const win = await app.firstWindow()
  await expect(win.locator('body[data-booted="true"]')).toBeVisible()
  await win.evaluate(async path => {
    await window.api.saveHighlights(path, [{ start: 0, end: 7, colour: 'yellow' }])
    await window.api.snapshotHistory(path, 'earlier note', 'LF', 'utf8')
  }, filePath)
  await app.evaluate(({ BrowserWindow }, path) => {
    BrowserWindow.getAllWindows()[0].webContents.send('open-file', path)
  }, filePath)
  await expect(win.locator('#paneA .hl-yellow')).toHaveText('current')
  await share(win)
  await expect(win.locator('#paneB .hl-yellow')).toHaveText('current')

  await win.locator('.tb-btn[title="File History"]').click()
  await expect(win.locator('#file-history .fh-row')).toHaveCount(1)
  await win.locator('#file-history .fh-row button', { hasText: 'Restore' }).click()
  for (const pane of ['A', 'B']) {
    await expect(win.locator(`#pane${pane} .view-lines`)).toContainText('earlier note')
    await expect(win.locator(`#pane${pane} .hl-yellow`)).toHaveText('earlier')
  }
  await expect(win.locator('.sb-state')).toHaveText('● unsaved')
  await win.locator('#paneB .monaco-editor').click()
  await win.keyboard.press('Control+Home')
  await win.keyboard.insertText('X ')
  await fileCommand(app, 'Save')
  await expect.poll(() => readFileSync(filePath, 'utf8')).toBe('X earlier note')
  await expect.poll(() => win.evaluate(path => window.api.loadHighlights(path), filePath))
    .toEqual([{ start: 2, end: 9, colour: 'yellow' }])
  await expect(win.locator('#paneA .hl-yellow')).toHaveText('earlier')
  await expect(win.locator('#paneB .hl-yellow')).toHaveText('earlier')
})

test('Save As changes a shared model language without losing its edits or undo history', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-shared-save-as-')
  const filePath = join(userDataDir, 'shared.txt')
  const targetPath = join(userDataDir, 'shared.md')
  writeFileSync(filePath, 'current note')
  const app = await smoke.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, filePath],
    env: { ...process.env, NC_TEST_SAVE_AS_PATHS: JSON.stringify([targetPath]) },
  })
  const win = await app.firstWindow()
  await expect(win.locator('body[data-booted="true"]')).toBeVisible()
  await share(win)
  await win.locator('#paneB .monaco-editor').click()
  await win.keyboard.press('Control+A')
  await win.keyboard.insertText('latestNote')
  await fileCommand(app, 'Save As…')
  await expect(win.getByRole('tab', { name: 'shared.md', exact: true })).toBeVisible()
  expect(readFileSync(targetPath, 'utf8')).toBe('latestNote')
  await expect(win.locator('.sb-state')).toHaveText('● saved')
  await win.locator('#paneA .monaco-editor').click()
  await win.keyboard.press('Control+Z')
  for (const pane of ['A', 'B']) {
    await expect(win.locator(`#pane${pane} .view-lines`)).toContainText('current note')
  }
  await expect(win.locator('.sb-state')).toHaveText('● unsaved')
  // Markdown list continuation in the peer verifies that syntax services changed there too.
  await win.locator('#paneB .monaco-editor').click()
  await win.keyboard.press('Control+A')
  await win.keyboard.insertText('- item\r\ntrailing')
  await win.keyboard.press('Control+Home')
  await win.keyboard.press('End')
  await win.keyboard.press('Enter')
  await win.keyboard.type('next')
  await fileCommand(app, 'Save')
  await expect.poll(() => readFileSync(targetPath, 'utf8')).toBe('- item\n- next\ntrailing')
})
