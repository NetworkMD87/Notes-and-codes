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

test('palette exposes ranked semantic options and preserves nested-dialog focus', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-palette-a11y-')
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  const win = await app.firstWindow()
  await expect(win.locator('#tabbar')).toBeVisible()

  await win.keyboard.press('Control+Shift+P')
  const palette = win.getByRole('dialog', { name: 'Command Palette' })
  const input = palette.getByRole('combobox', { name: 'Command Palette' })
  await expect(input).toHaveAttribute('aria-controls', 'palette-list')
  await input.fill('snip-manage')
  const activeId = await input.getAttribute('aria-activedescendant')
  await expect(win.locator(`#${activeId}`)).toHaveAttribute('role', 'option')
  await expect(win.locator(`#${activeId}`)).toHaveAttribute('aria-selected', 'true')
  await win.keyboard.press('Enter')
  const snippets = win.getByRole('dialog', { name: 'Snippets' })
  await expect(snippets).toBeVisible()
  await expect(snippets.getByRole('button', { name: 'Add snippet' })).toBeFocused()

  await win.keyboard.press('Escape')
  await win.keyboard.press('Control+Shift+P')
  const shortcutInput = win.getByRole('dialog', { name: 'Command Palette' }).getByRole('combobox', { name: 'Command Palette' })
  await shortcutInput.fill('Ctrl+Shift+F')
  await expect(shortcutInput).toHaveAttribute('aria-activedescendant', 'palette-option-find-in-files')
  await win.keyboard.press('Enter')
  const findInFiles = win.getByRole('dialog', { name: 'Find in Files' })
  await expect(findInFiles).toBeVisible()
  await expect(findInFiles.getByRole('searchbox', { name: 'Find in Files' })).toBeFocused()
})
