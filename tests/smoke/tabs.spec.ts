import { test, expect } from './smokeTest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { openSettings } from './settingsHelper'

test('narrow windows keep the selected tab and primary controls reachable', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-narrow-tabs-')
  const folder = smoke.tempDir('notes-narrow-tabs-folder-')
  mkdirSync(join(userDataDir, 'session'))
  writeFileSync(join(userDataDir, 'settings.json'), JSON.stringify({
    restoreFolderOnLaunch: true, lastFolder: folder, sidebarVisible: true,
  }))
  const buffers = Array.from({ length: 10 }, (_, index) => ({
    id: `file-${index}`, title: `file-${index}.txt`, filePath: null, content: `note ${index}`,
    language: 'plaintext', eol: 'LF', encoding: 'utf8', dirty: false,
  }))
  writeFileSync(join(userDataDir, 'session', 'session.json'), JSON.stringify({ buffers, activeId: 'file-9' }))

  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  const win = await app.firstWindow()
  const sidebar = win.locator('#sidebar')
  const tablist = win.getByRole('tablist', { name: 'Open files' })
  const newTab = win.getByRole('button', { name: 'New Tab', exact: true })
  const settings = win.getByRole('button', { name: 'Settings', exact: true })
  const more = win.getByRole('button', { name: 'More actions', exact: true })
  await expect(win.locator('body')).toHaveAttribute('data-booted', 'true')
  await expect(sidebar).toBeVisible()

  for (const sidebarOpen of [true, false]) {
    for (const width of [480, 620]) {
      await test.step(`${width}px with sidebar ${sidebarOpen ? 'open' : 'closed'}`, async () => {
        await app.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0]?.setContentSize(width, 600), width)
        await expect.poll(() => win.evaluate(() => window.innerWidth)).toBe(width)
        // DOM visibility alone passes for controls clipped by the scroll strip or window edge.
        await expect.poll(() => win.evaluate(() => {
          const strip = document.querySelector('#tabbar')!.getBoundingClientRect()
          const selected = document.querySelector('.tab.active')!.getBoundingClientRect()
          const onscreen = (el: Element | null) => {
            const rect = el?.getBoundingClientRect()
            return !!rect && rect.width > 0 && rect.x >= 0 && rect.right <= window.innerWidth + 1
          }
          return {
            activeTab: selected.width >= 84 && selected.left >= strip.left - 1 && selected.right <= strip.right + 1,
            newTab: onscreen(document.querySelector('.tab-add')),
            settings: onscreen(document.querySelector('[title="Settings"]')),
          }
        })).toEqual({ activeTab: true, newTab: true, settings: true })

        if (sidebarOpen || width === 480) await expect(more).toBeVisible()
        else await expect(more).toBeHidden()
      })
    }
    if (sidebarOpen) {
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setContentSize(1100, 600))
      await expect.poll(() => win.evaluate(() => window.innerWidth)).toBe(1100)
      const divider = await win.locator('#app > .gutter').boundingBox()
      expect(divider).toBeTruthy()
      await win.mouse.move(divider!.x + divider!.width / 2, 150)
      await win.mouse.down()
      await win.mouse.move(810, 150, { steps: 8 })
      await win.mouse.up()
      await expect.poll(() => sidebar.evaluate(el => el.getBoundingClientRect().width)).toBeGreaterThan(700)
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setContentSize(480, 600))
      await expect.poll(() => win.evaluate(() => window.innerWidth)).toBe(480)
      await expect.poll(() => tablist.evaluate(strip => {
        const clip = strip.getBoundingClientRect()
        const active = strip.querySelector('.tab.active')!.getBoundingClientRect()
        return active.width >= 84 && active.left >= clip.left - 1 && active.right <= clip.right + 1
      })).toBe(true)
      await win.getByRole('button', { name: 'Hide sidebar', exact: true }).click()
      await expect(sidebar).toBeHidden()
    }
  }

  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setContentSize(480, 600))
  await expect(more).toBeVisible()
  await tablist.getByRole('tab', { selected: true }).focus()
  await win.keyboard.press('Home')
  await expect(tablist.getByRole('tab', { name: 'file-0.txt' })).toBeFocused()
  await win.keyboard.press('Tab') // selected tab's close button
  await win.keyboard.press('Tab')
  await expect(newTab).toBeFocused()
  await win.keyboard.press('Enter')
  await expect(tablist.getByRole('tab')).toHaveCount(11)
  await expect(tablist.getByRole('tab', { selected: true })).toHaveText(/Untitled/)

  await more.click()
  await expect(more).toHaveAttribute('aria-expanded', 'true')
  await more.click()
  await expect(more).toHaveAttribute('aria-expanded', 'false')

  await more.focus()
  await win.keyboard.press('Enter')
  await expect(win.getByRole('menuitem', { name: 'Open file' })).toBeFocused()
  await win.keyboard.press('ArrowDown')
  await expect(win.getByRole('menuitem', { name: 'Save', exact: true })).toBeFocused()
  await win.keyboard.press('Escape')
  await expect(more).toBeFocused()
  await expect(more).toHaveAttribute('aria-expanded', 'false')
  await win.keyboard.press('Enter')
  for (let index = 0; index < 3; index++) await win.keyboard.press('ArrowDown')
  await expect(win.getByRole('menuitem', { name: 'Toggle split pane' })).toBeFocused()
  await win.keyboard.press('Enter')
  await expect(win.locator('#paneB')).toBeVisible()
  await more.focus()
  await win.keyboard.press('Enter')
  await win.keyboard.press('Tab')
  await expect(settings).toBeFocused()
  await expect(win.getByRole('menu')).toHaveCount(0)
  await win.keyboard.press('Enter')
  await expect(win.getByRole('dialog', { name: 'Settings' })).toBeVisible()
  await win.keyboard.press('Escape')

  await more.focus()
  await win.keyboard.press('Enter')
  await expect(win.getByRole('menuitem', { name: 'Open file' })).toBeFocused()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setContentSize(620, 600))
  await expect(more).toBeHidden()
  await expect(win.getByRole('menu')).toHaveCount(0)
  await expect(settings).toBeFocused()
})

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
