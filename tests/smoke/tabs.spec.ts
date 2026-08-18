import { test, expect } from './smokeTest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { openSettings } from './settingsHelper'

async function expectBadgeColours(win: import('@playwright/test').Page): Promise<void> {
  await expect(win.getByRole('tab', { name: 'Untitled-1' }).locator('.badge'))
    .toHaveCSS('color', 'rgb(100, 116, 139)')
  await expect(win.getByRole('tab', { name: 'README.md' }).locator('.badge'))
    .toHaveCSS('color', 'rgb(101, 163, 13)')
}

test('TXT and Markdown tab badges retain their palette colours across themes', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-badge-colours-')
  mkdirSync(join(userDataDir, 'session'))
  writeFileSync(join(userDataDir, 'settings.json'), JSON.stringify({ themeId: 'dark' }))
  writeFileSync(join(userDataDir, 'session', 'session.json'), JSON.stringify({
    buffers: [
      { id: 'text', title: 'Untitled-1', filePath: null, content: '', language: 'plaintext', eol: 'LF', encoding: 'utf8', dirty: false },
      { id: 'markdown', title: 'README.md', filePath: null, content: '# Readme', language: 'markdown', eol: 'LF', encoding: 'utf8', dirty: false },
    ],
    activeId: 'text',
  }))

  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  const win = await app.firstWindow()
  await expect(win.locator('body')).toHaveAttribute('data-booted', 'true')
  await expect(win.locator('body')).toHaveAttribute('data-theme', 'dark')
  await expectBadgeColours(win)

  await openSettings(win, 'Appearance')
  await win.getByRole('radio', { name: 'Light', exact: true }).click()
  await win.keyboard.press('Escape')
  await expect(win.locator('body')).toHaveAttribute('data-theme', 'light')
  await expectBadgeColours(win)

  await openSettings(win, 'Appearance')
  await win.getByRole('radio', { name: 'High Contrast', exact: true }).click()
  await win.keyboard.press('Escape')
  await expect(win.locator('body')).toHaveAttribute('data-theme', 'high-contrast')
  await expectBadgeColours(win)
})

test('a file tab shows its language badge; a scratch tab shows a badge too', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-smoke-')
  const projectDir = smoke.tempDir('notes-proj-')
  mkdirSync(join(projectDir, 'src'))
  writeFileSync(join(projectDir, 'src', 'alpha.ts'), '// alpha')
  writeFileSync(join(userDataDir, 'settings.json'), JSON.stringify({
    restoreFolderOnLaunch: true, lastFolder: projectDir, sidebarVisible: true,
  }))
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
    const win = await app.firstWindow()
    // the initial scratch tab carries a (muted plaintext) badge
    await expect(win.locator('.tab').first().locator('.badge')).toBeVisible()
    // open alpha.ts from the sidebar → its tab shows a 'ts' badge
    await win.locator('#sidebar').waitFor()
    // 'src' is collapsed by default — expand it so its child 'alpha.ts' row renders (mirrors
    // the "nested sidebar rows" pattern in sidebar.spec.ts).
    await win.locator('.sb-row', { hasText: 'src' }).click()
    await win.locator('.sb-row', { hasText: 'alpha.ts' }).click()
    const tab = win.locator('.tab', { hasText: 'alpha.ts' })
    await expect(tab.locator('.badge')).toHaveText('ts')
})

test('semantic tabs support keyboard roving, closing, and app-wide cycling in split view', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-keyboard-tabs-')
  mkdirSync(join(userDataDir, 'session'))
  writeFileSync(join(userDataDir, 'session', 'session.json'), JSON.stringify({
    buffers: [
      { id: 'a', title: 'a.txt', filePath: null, content: 'tab a content', language: 'plaintext', eol: 'LF', encoding: 'utf8', dirty: false },
      { id: 'b', title: 'b.txt', filePath: null, content: 'tab b content', language: 'plaintext', eol: 'LF', encoding: 'utf8', dirty: false },
      { id: 'c', title: 'c.txt', filePath: null, content: 'tab c content', language: 'plaintext', eol: 'LF', encoding: 'utf8', dirty: false },
    ], activeId: 'a',
  }))
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  const win = await app.firstWindow()
  const tablist = win.getByRole('tablist', { name: 'Open files' })
  const first = tablist.getByRole('tab').nth(0)

  await first.focus(); await win.keyboard.press('ArrowLeft')
  await expect(tablist.getByRole('tab').nth(2)).toBeFocused()
  await expect(tablist.getByRole('tab').nth(2)).toHaveAttribute('aria-selected', 'true')
  await win.keyboard.press('Home'); await expect(tablist.getByRole('tab').nth(0)).toBeFocused()
  await win.keyboard.press('Tab'); await expect(tablist.getByRole('button', { name: 'Close a.txt' })).toBeFocused()

  const paneATextarea = win.locator('#paneA textarea.inputarea')
  await paneATextarea.focus(); await win.keyboard.press('Control+PageDown')
  await expect(tablist.getByRole('tab').nth(1)).toHaveAttribute('aria-selected', 'true')
  await expect(paneATextarea).toBeFocused()
  await expect(win.locator('#paneA .view-lines')).toContainText('tab b content')

  await win.locator('.tb-btn[title="Toggle split pane"]').click()
  await expect(win.locator('#paneB')).toBeVisible()
  await win.locator('#paneB textarea.inputarea').focus()
  await tablist.getByRole('tab', { name: 'c.txt' }).click()
  await expect(win.locator('#paneB .view-lines')).toContainText('tab c content')
  await paneATextarea.focus(); await win.keyboard.press('Control+PageDown')
  await expect(tablist.getByRole('tab', { name: 'a.txt' })).toHaveAttribute('aria-selected', 'true')
  await expect(win.locator('#paneA .view-lines')).toContainText('tab a content')
  await expect(win.locator('#paneB .view-lines')).toContainText('tab c content')

  const closeA = tablist.getByRole('button', { name: 'Close a.txt' })
  await closeA.focus(); await win.keyboard.press('Enter')
  await expect(tablist.getByRole('tab', { name: 'b.txt' })).toBeFocused()
  await expect(tablist.getByRole('tab', { name: 'b.txt' })).toHaveAttribute('aria-selected', 'true')
})
