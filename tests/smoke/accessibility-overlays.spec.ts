import { test, expect } from './smokeTest'
import type { Locator, Page } from '@playwright/test'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

async function expectDialog(win: Page, name: string, initial: Locator, last: Locator) {
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

  await win.keyboard.press('Control+P')
  await expectDialog(win, 'Quick Open', win.getByRole('combobox', { name: 'Quick Open' }), win.getByRole('combobox', { name: 'Quick Open' }))
  await win.keyboard.press('Escape')

  await win.keyboard.press('Control+Shift+F')
  await expectDialog(win, 'Find in Files', win.getByRole('searchbox', { name: 'Find in Files' }), win.getByRole('button', { name: 'Whole word' }))
  await win.keyboard.press('Escape')

  await win.keyboard.press('Control+Shift+P'); await win.locator('#palette input').fill('Help: Shortcuts'); await win.keyboard.press('Enter')
  await expectDialog(win, 'Shortcuts & Commands', win.getByRole('searchbox', { name: 'Search commands' }), win.getByRole('button', { name: 'Close Shortcuts & Commands' }))
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
