import { test, expect } from './smokeTest'
import type { Page } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

async function chooseFileCommand(app: import('@playwright/test').ElectronApplication, label: string): Promise<void> {
  await app.evaluate(({ Menu }, commandLabel) => {
    const file = Menu.getApplicationMenu()!.items.find(item => item.label === 'File')!
    file.submenu!.items.find(item => item.label === commandLabel)!.click()
  }, label)
}

async function bindSharedFileToPaneB(win: Page, content = 'original on disk'): Promise<void> {
  await win.locator('.tb-btn[title="Toggle split pane"]').click()
  await expect(win.locator('#paneB')).toBeVisible()
  await win.locator('#paneB .monaco-editor').click()
  await win.getByRole('tab', { name: 'shared.txt' }).click()
  await expect(win.locator('#paneB .view-lines')).toContainText(content)
}

async function correctFirstMisspelling(win: Page, pane: '#paneA' | '#paneB'): Promise<void> {
  const underline = win.locator(`${pane} .spell-error`).first()
  await expect(underline).toBeVisible()
  try {
    await underline.click({ button: 'right', timeout: 1_000 })
  } catch {
    const box = await underline.boundingBox()
    if (!box) throw new Error('Spell-error underline has no pointer target')
    await win.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' })
  }
  const menu = win.locator('#ctx-menu')
  await expect(menu).toBeVisible()
  await menu.locator('.ctx-item', { hasText: /^spelling$/ }).click()
}

test('saving a buffer from pane B writes its latest edit when pane A shows the same buffer', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-split-buffer-save-')
  const filePath = join(userDataDir, 'shared.txt')
  writeFileSync(filePath, 'original on disk')
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, filePath] })
  const win = await app.firstWindow()
  await expect(win.locator('body[data-booted="true"]')).toBeVisible()
  await expect(win.locator('#paneA .view-lines')).toContainText('original on disk')

  await bindSharedFileToPaneB(win)

  await win.locator('#paneB .monaco-editor').click()
  await win.keyboard.press('Control+A')
  await win.keyboard.type('latest edit from pane B')
  await expect(win.locator('.sb-state')).toHaveText('● unsaved')

  await chooseFileCommand(app, 'Save')
  await expect.poll(() => readFileSync(filePath, 'utf8')).toBe('latest edit from pane B')

  await win.locator('#paneA .monaco-editor').click()
  await win.keyboard.press('Control+A')
  await win.keyboard.type('latest edit from pane A')
  await chooseFileCommand(app, 'Save')
  await expect.poll(() => readFileSync(filePath, 'utf8')).toBe('latest edit from pane A')
})

test('edits, undo, and redo stay synchronized when one buffer is shown in both panes', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-split-buffer-history-')
  const filePath = join(userDataDir, 'shared.txt')
  writeFileSync(filePath, 'original on disk')
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, filePath] })
  const win = await app.firstWindow()
  await expect(win.locator('body[data-booted="true"]')).toBeVisible()
  await bindSharedFileToPaneB(win)

  await win.locator('#paneB .monaco-editor').click()
  await win.keyboard.press('Control+A')
  await win.keyboard.insertText('paneBedit')
  await expect(win.locator('#paneA .view-lines')).toContainText('paneBedit')

  await win.locator('#paneA .monaco-editor').click()
  await win.keyboard.press('Control+Z')
  await expect(win.locator('#paneA .view-lines')).toContainText('original on disk')
  await expect(win.locator('#paneB .view-lines')).toContainText('original on disk')

  await win.locator('#paneB .monaco-editor').click()
  await win.keyboard.press('Control+Y')
  await expect(win.locator('#paneA .view-lines')).toContainText('paneBedit')
  await expect(win.locator('#paneB .view-lines')).toContainText('paneBedit')
})

test('reload refreshes a peer pane model cached while it showed another buffer', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-split-buffer-reload-')
  const filePath = join(userDataDir, 'shared.txt')
  writeFileSync(filePath, 'original on disk')
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, filePath] })
  const win = await app.firstWindow()
  await expect(win.locator('body[data-booted="true"]')).toBeVisible()
  await bindSharedFileToPaneB(win)

  await win.locator('.tab-add').click()
  await expect(win.locator('#paneB .view-lines')).toBeVisible()
  await win.locator('#paneA .monaco-editor').click()
  await win.keyboard.press('Control+A')
  await win.keyboard.type('unsaved local edit')
  writeFileSync(filePath, 'external disk update')

  await win.keyboard.press('Control+Shift+P')
  await win.locator('#palette input').fill('Revert File')
  await win.keyboard.press('Enter')
  await expect(win.locator('.input-overlay')).toBeVisible()
  await win.locator('.input-overlay button', { hasText: 'Revert' }).click()
  await expect(win.locator('#paneA .view-lines')).toContainText('external disk update')

  await win.locator('#paneB .monaco-editor').click()
  await win.getByRole('tab', { name: 'shared.txt' }).click()
  await expect(win.locator('#paneB .view-lines')).toContainText('external disk update')
})

test('reload refreshes a peer pane that is still showing the same buffer', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-split-buffer-reload-visible-')
  const filePath = join(userDataDir, 'shared.txt')
  writeFileSync(filePath, 'original on disk')
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, filePath] })
  const win = await app.firstWindow()
  await expect(win.locator('body[data-booted="true"]')).toBeVisible()
  await bindSharedFileToPaneB(win)

  await win.locator('#paneB .monaco-editor').click()
  await win.keyboard.press('Control+A')
  await win.keyboard.insertText('unsaved local edit')
  writeFileSync(filePath, 'external disk update')

  await win.locator('#paneA .monaco-editor').click()
  await win.keyboard.press('Control+Shift+P')
  await win.locator('#palette input').fill('Revert File')
  await win.keyboard.press('Enter')
  await expect(win.locator('.input-overlay')).toBeVisible()
  await win.locator('.input-overlay button', { hasText: 'Revert' }).click()
  await expect(win.locator('#paneA .view-lines')).toContainText('external disk update')
  await expect(win.locator('#paneB .view-lines')).toContainText('external disk update')
})

test('closing a buffer shown in both panes leaves each editor usable', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-split-buffer-close-')
  const filePath = join(userDataDir, 'shared.txt')
  writeFileSync(filePath, 'original on disk')
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, filePath] })
  const win = await app.firstWindow()
  await expect(win.locator('body[data-booted="true"]')).toBeVisible()
  await bindSharedFileToPaneB(win)

  // Keep a replacement tab open so closing the shared buffer leaves the window visible.
  await win.locator('.tab-add').click()
  await win.locator('#paneB .monaco-editor').click()
  await win.keyboard.type('replacement buffer')
  await win.getByRole('tab', { name: 'shared.txt' }).click()

  const tablist = win.getByRole('tablist', { name: 'Open files' })
  await tablist.getByRole('button', { name: 'Close shared.txt' }).click()
  await expect(tablist.getByRole('tab')).toHaveCount(1)
  await expect(tablist.getByRole('tab').first()).toHaveText(/Untitled/)
  await expect(win.locator('#paneA .view-lines')).toContainText('replacement buffer')
  await expect(win.locator('#paneB .view-lines')).toContainText('replacement buffer')

  await win.locator('#paneA .monaco-editor').click()
  await win.keyboard.type('pane A remains usable')
  await expect(win.locator('#paneB .view-lines')).toContainText('pane A remains usable')

  await win.locator('#paneB .monaco-editor').click()
  await win.keyboard.press('Control+A')
  await win.keyboard.type('pane B remains usable')
  await expect(win.locator('#paneA .view-lines')).toContainText('pane B remains usable')
  await expect(win.locator('#paneB .view-lines')).toContainText('pane B remains usable')
})

test('spell correction works through pane B and remains actionable in pane A after collapse', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-split-buffer-spell-')
  const filePath = join(userDataDir, 'shared.txt')
  writeFileSync(filePath, 'speling and speling')
  const app = await smoke.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, filePath],
    env: { ...process.env, NC_HEADLESS: '1' } as Record<string, string>,
  })
  const win = await app.firstWindow()
  await expect(win.locator('body[data-booted="true"]')).toBeVisible()
  await bindSharedFileToPaneB(win, 'speling and speling')
  await expect(win.locator('#paneA .spell-error')).toHaveCount(2)
  await expect(win.locator('#paneB .spell-error')).toHaveCount(2)

  await correctFirstMisspelling(win, '#paneB')
  await expect(win.locator('#paneA .view-lines')).toContainText('spelling and speling')
  await expect(win.locator('#paneB .view-lines')).toContainText('spelling and speling')
  await expect(win.locator('#paneA .spell-error')).toHaveCount(1)
  await expect(win.locator('#paneB .spell-error')).toHaveCount(1)

  await win.locator('.tb-btn[title="Toggle split pane"]').click()
  await expect(win.locator('#paneB')).toBeHidden()
  await expect(win.locator('#paneA .view-lines')).toContainText('spelling and speling')
  await correctFirstMisspelling(win, '#paneA')
  await expect(win.locator('#paneA .view-lines')).toContainText('spelling and spelling')
  await expect(win.locator('#paneA .spell-error')).toHaveCount(0)
})
