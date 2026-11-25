import { test, expect } from './smokeTest'
import type { Locator, Page } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

async function expectDialog(win: Page, name: string | RegExp, initial: Locator, last: Locator) {
  const dialog = win.getByRole('dialog', { name })
  await expect(dialog).toBeVisible(); await expect(initial).toBeFocused()
  await last.focus(); await win.keyboard.press('Tab'); await expect(initial).toBeFocused()
  await initial.focus(); await win.keyboard.press('Shift+Tab'); await expect(last).toBeFocused()
  return dialog
}

test('Quick Open, Find in Files, and Help are named modal dialogs with trapped focus', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-overlay-a11y-')
  const root = smoke.tempDir('notes-overlay-root-')
  writeFileSync(join(userDataDir, 'settings.json'), JSON.stringify({ lastFolder: root, restoreFolderOnLaunch: true }))
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  const win = await app.firstWindow(); await expect(win.locator('body')).toHaveAttribute('data-booted', 'true')

  await win.keyboard.press('Control+Shift+P')
  await expectDialog(win, 'Command Palette', win.getByRole('combobox', { name: 'Command Palette' }), win.getByRole('combobox', { name: 'Command Palette' }))
  await win.keyboard.press('Escape')

  await win.keyboard.press('Control+P')
  await expectDialog(win, 'Quick Open', win.getByRole('combobox', { name: 'Quick Open' }), win.getByRole('combobox', { name: 'Quick Open' }))
  await win.keyboard.press('Escape')

  await win.keyboard.press('Control+Shift+F')
  await expectDialog(win, 'Find in Files', win.getByRole('searchbox', { name: 'Find in Files' }), win.getByRole('button', { name: 'Search scope' }))
  await win.keyboard.press('Escape')

  await win.keyboard.press('Control+Shift+P'); await win.locator('#palette input').fill('Help: Shortcuts'); await win.keyboard.press('Enter')
  await expectDialog(win, 'Shortcuts & Commands', win.getByRole('searchbox', { name: 'Search commands' }), win.getByRole('button', { name: 'Close Shortcuts & Commands' }))
})

test('Quick Open exposes selection and no matches in the keyboard flow', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-quick-open-a11y-')
  const root = smoke.tempDir('notes-quick-open-root-')
  writeFileSync(join(userDataDir, 'settings.json'), JSON.stringify({ lastFolder: root, restoreFolderOnLaunch: true }))
  writeFileSync(join(root, 'note-a.txt'), 'first file')
  writeFileSync(join(root, 'note-b.txt'), 'second file')
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  const win = await app.firstWindow()
  await expect(win.locator('body')).toHaveAttribute('data-booted', 'true')

  await win.keyboard.press('Control+p')
  const dialog = win.getByRole('dialog', { name: 'Quick Open' })
  const input = dialog.getByRole('combobox', { name: 'Quick Open' })
  const list = dialog.getByRole('listbox')
  const first = list.getByRole('option', { name: /^note-a\.txt/ })
  const second = list.getByRole('option', { name: /^note-b\.txt/ })
  const selected = list.getByRole('option', { selected: true })
  await expect(first).toBeVisible()
  await expect(input).toHaveAttribute('aria-expanded', 'true')
  const firstId = await first.getAttribute('id')
  const secondId = await second.getAttribute('id')
  expect(firstId).toBeTruthy()
  expect(secondId).toBeTruthy()
  expect(secondId).not.toBe(firstId)
  await expect(selected).toHaveText(/^note-a\.txt/)
  await expect(input).toHaveAttribute('aria-activedescendant', firstId!)

  await input.press('ArrowDown')
  await expect(selected).toHaveText(/^note-b\.txt/)
  await expect(input).toHaveAttribute('aria-activedescendant', secondId!)
  await expect(input).toBeFocused()
  await input.press('ArrowUp')
  await expect(selected).toHaveText(/^note-a\.txt/)
  await expect(input).toHaveAttribute('aria-activedescendant', firstId!)

  await input.fill('zzzz')
  await expect(dialog.getByRole('status')).toHaveText('No matching files')
  await expect(dialog.getByRole('status')).toBeVisible()
  await expect(dialog.getByRole('option')).toHaveCount(0)
  await expect(input).toHaveAttribute('aria-expanded', 'false')
  await expect(input).not.toHaveAttribute('aria-activedescendant', /.+/)
  await input.press('ArrowDown')
  await input.press('Enter')
  await expect(dialog).toBeVisible()

  await input.fill('note')
  await expect(dialog.getByRole('status')).toBeEmpty()
  await expect(selected).toHaveText(/^note-a\.txt/)
  await input.press('ArrowDown')
  await input.press('Enter')
  await expect(dialog).toBeHidden()
  await expect(win.locator('.tab.active')).toContainText('note-b.txt')
})

test('remaining modal pickers, managers, history, and dictionary are named dialogs with trapped focus', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-remaining-overlay-a11y-')
  writeFileSync(join(userDataDir, 'clipboard-history.json'), JSON.stringify(['keyboard paste payload']))
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  const win = await app.firstWindow(); await expect(win.locator('body')).toHaveAttribute('data-booted', 'true')

  const openCommand = async (query: string) => {
    await win.keyboard.press('Control+Shift+P')
    await win.locator('#palette input').fill(query)
    await win.keyboard.press('Enter')
  }

  await openCommand('Paste from History')
  const pasteRow = win.getByRole('button', { name: 'Paste keyboard paste payload' })
  await expectDialog(win, 'Paste from History', pasteRow, win.getByRole('button', { name: 'Close Paste from History' }))
  await win.keyboard.press('Enter')
  await expect(win.getByRole('dialog', { name: 'Paste from History' })).toBeHidden()

  await openCommand('Insert Snippet')
  await expectDialog(win, 'Insert Snippet', win.getByRole('button', { name: 'Close Insert Snippet' }), win.getByRole('button', { name: 'Close Insert Snippet' }))
  await win.keyboard.press('Escape')

  await openCommand('Manage Snippets')
  await expectDialog(win, 'Snippets', win.getByRole('button', { name: 'Add snippet' }), win.getByRole('button', { name: 'Close Snippets' }))
  await win.keyboard.press('Escape')

  await openCommand('File History')
  await expectDialog(win, 'File History', win.getByRole('button', { name: 'Close File History' }), win.getByRole('button', { name: 'Close File History' }))
  await win.keyboard.press('Escape')

  await openCommand('New Tab')
  await openCommand('Start Diff (tab vs tab)')
  await expectDialog(win, 'Compare tabs', win.getByLabel('Left'), win.getByRole('button', { name: 'Cancel' }))
  await win.keyboard.press('Escape')

  await openCommand('Settings')
  await win.getByRole('tab', { name: 'Editor' }).click()
  await win.getByRole('button', { name: 'Personal dictionary…' }).click()
  await expectDialog(win, 'Personal dictionary', win.getByRole('button', { name: 'Close Personal dictionary' }), win.getByRole('button', { name: 'Close Personal dictionary' }))
  await win.keyboard.press('Escape')
  await expect(win.getByRole('dialog', { name: 'Personal dictionary' })).toBeHidden()
  await expect(win.getByRole('dialog', { name: 'Settings' })).toBeVisible()
  await win.keyboard.press('Escape')
})

test('dirty-tab discard confirmation is a named modal dialog that restores its opener', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-confirm-a11y-')
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  const win = await app.firstWindow(); await expect(win.locator('body')).toHaveAttribute('data-booted', 'true')

  await win.locator('#paneA .monaco-editor').click()
  await win.keyboard.type('unsaved scratch notes')
  const opener = win.locator('.tab-close').first()
  await opener.click()

  const message = /has unsaved changes\. Discard and close\?$/
  await expectDialog(win, message, win.getByRole('button', { name: 'Discard' }), win.getByRole('button', { name: 'Cancel' }))
  await win.keyboard.press('Escape')
  await expect(win.getByRole('dialog', { name: message })).toBeHidden()
  await expect(opener).toBeAttached()
  await expect(opener).toBeFocused()
})
