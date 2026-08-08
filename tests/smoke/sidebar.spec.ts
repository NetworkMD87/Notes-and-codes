import { test, expect } from './smokeTest'
import type { SmokeResources } from './smokeCleanup'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join, basename } from 'node:path'
import { openSettings } from './settingsHelper'

function seededFolder(smoke: SmokeResources) {
  const userDataDir = smoke.tempDir('notes-smoke-')
  const projectDir = smoke.tempDir('notes-proj-')
  mkdirSync(join(projectDir, 'src'))
  writeFileSync(join(projectDir, 'src', 'alpha.ts'), '// alpha')
  writeFileSync(join(projectDir, 'readme.md'), '# hi')
  writeFileSync(join(userDataDir, 'settings.json'), JSON.stringify({
    restoreFolderOnLaunch: true, lastFolder: projectDir, sidebarVisible: true,
  }))
  return { userDataDir, projectDir }
}

test('sidebar shows a header caption with the open folder name', async ({ smoke }) => {
  const { userDataDir, projectDir } = seededFolder(smoke)
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
    const win = await app.firstWindow()
    await expect(win.locator('#sidebar')).toBeVisible()
    const header = win.locator('#sidebar .sb-header')
    await expect(header).toBeVisible()
    await expect(header.locator('.sb-label')).toHaveText(basename(projectDir)) // CSS uppercases; DOM text is the basename
})

test('the sidebar header switches folders from the recent list', async ({ smoke }) => {
  const { userDataDir, projectDir } = seededFolder(smoke)
  const other = smoke.tempDir('notes-other-')
  writeFileSync(join(other, 'other.txt'), 'x')
  writeFileSync(join(userDataDir, 'recent-folders.json'), JSON.stringify([other, projectDir]))
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
    const win = await app.firstWindow()
    await expect(win.locator('#sidebar .sb-header .sb-label')).toHaveText(basename(projectDir))
    await win.locator('.sb-header-btn').click()
    const item = win.locator('.ctx-item', { hasText: basename(other) })
    await expect(item).toBeVisible()
    // The open folder is excluded from its own switcher.
    await expect(win.locator('.ctx-item', { hasText: basename(projectDir) })).toHaveCount(0)
    await item.click()
    await expect(win.locator('.sb-row', { hasText: 'other.txt' })).toBeVisible()
    await expect(win.locator('#sidebar .sb-header .sb-label')).toHaveText(basename(other))
})

test('the keyboard-owned folder switcher menu navigates and restores focus', async ({ smoke }) => {
  const { userDataDir } = seededFolder(smoke)
  let app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  let win = await app.firstWindow()
  // Concurrent Electron workers own separate visible BrowserWindows. Keep this renderer's
  // document focus emulated so another worker cannot invalidate its keyboard/focus contract.
  const cdp = await win.context().newCDPSession(win)
  await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true })
  await win.evaluate(() => {
    const addEventListener = window.addEventListener.bind(window)
    window.addEventListener = ((type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => {
      if (type !== 'blur') addEventListener(type, listener, options)
    }) as typeof window.addEventListener
  })
  const opener = win.getByRole('button', { name: /switch folder/i })
  const originalOpener = await opener.elementHandle()
  expect(originalOpener).not.toBeNull()
  const menu = win.getByRole('menu')
  const openMenuFromKeyboard = async () => {
    await expect.poll(async () => {
      if (await menu.isVisible().catch(() => false)) return true
      await opener.focus(); await opener.press('Enter')
      return menu.isVisible().catch(() => false)
    }).toBe(true)
  }
  await openMenuFromKeyboard()
  await expect(menu.getByRole('menuitem').first()).toBeFocused()
  await menu.getByRole('menuitem').first().press('ArrowDown')
  await expect(menu.getByRole('menuitem', { name: 'Close Folder' })).toBeFocused()
  await menu.getByRole('menuitem', { name: 'Close Folder' }).press('Home')
  await expect(menu.getByRole('menuitem').first()).toBeFocused()
  await menu.getByRole('menuitem').first().press('End')
  const closeItem = menu.getByRole('menuitem', { name: 'Close Folder' })
  await expect(closeItem).toBeFocused()
  expect(await originalOpener!.evaluate(element => element.isConnected)).toBe(true)
  await closeItem.press('Escape')
  await expect(opener).toBeFocused()
  await openMenuFromKeyboard()
  await win.getByRole('menu').getByRole('menuitem').first().press('End')
  await win.getByRole('menu').getByRole('menuitem', { name: 'Close Folder' }).press('Enter')
  await expect(win.getByRole('button', { name: /open folder/i })).toBeVisible()
})

test('nested sidebar rows carry a --depth for indent guides', async ({ smoke }) => {
  const { userDataDir, projectDir } = seededFolder(smoke)
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
    const win = await app.firstWindow()
    await expect(win.locator('#sidebar')).toBeVisible()
    // top-level 'src' dir is depth 0; expand it so its child 'alpha.ts' renders at depth 1.
    await win.locator('.sb-row', { hasText: 'src' }).click()
    const child = win.locator('.sb-row', { hasText: 'alpha.ts' })
    await expect(child).toBeVisible()
    const depth = await child.evaluate((el) => (el as HTMLElement).style.getPropertyValue('--depth'))
    expect(Number(depth)).toBeGreaterThanOrEqual(1)
})

test('workspace exclusions persist and refresh the folder tree and Quick Open immediately', async ({ smoke }) => {
  const { userDataDir, projectDir } = seededFolder(smoke)
  mkdirSync(join(projectDir, 'dist'))
  writeFileSync(join(projectDir, 'dist', 'hidden.ts'), '// hidden')
  let app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  let win = await app.firstWindow()
  await expect(win.locator('.sb-row', { hasText: 'src' })).toBeVisible()
  await expect(win.locator('.sb-row', { hasText: 'dist' })).toHaveCount(0)

  await openSettings(win, 'Folder')
  const editor = win.getByLabel('Exclude from workspace')
  await expect(editor).toHaveAttribute('aria-describedby', 'workspace-excludes-help')
  await expect(editor).toHaveValue('**/.git/**\n**/node_modules/**\n**/dist/**\n**/out/**\n**/build/**\n**/coverage/**')
  await editor.fill('**/src/**')
  await editor.press('Tab')
  await expect(win.getByRole('button', { name: 'Restore defaults' })).toBeFocused()
  await expect(win.locator('.sb-row', { hasText: 'dist' })).toBeVisible()
  await expect(win.locator('.sb-row', { hasText: 'src' })).toHaveCount(0)

  const showAll = win.getByLabel('Show all files (incl. node_modules / .git)')
  await showAll.check()
  await expect(win.locator('.sb-row', { hasText: 'src' })).toBeVisible()
  await expect(editor).toHaveValue('**/src/**')
  await showAll.uncheck()
  await expect(win.locator('.sb-row', { hasText: 'src' })).toHaveCount(0)

  await win.getByRole('button', { name: 'Close Settings' }).click()
  await win.keyboard.press('Control+p')
  const quick = win.getByRole('combobox', { name: 'Quick Open' })
  await quick.fill('hidden')
  await expect(win.locator('.qo-row', { hasText: 'hidden.ts' })).toBeVisible()
  await quick.press('Escape')

  await app.close()
  app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  win = await app.firstWindow()
  await expect(win.locator('.sb-row', { hasText: 'dist' })).toBeVisible()
  await expect(win.locator('.sb-row', { hasText: 'src' })).toHaveCount(0)

  await openSettings(win, 'Folder')
  await expect(win.getByLabel('Exclude from workspace')).toHaveValue('**/src/**')
  const restore = win.getByRole('button', { name: 'Restore defaults' })
  await restore.click()
  await expect(restore).toBeFocused()
  await expect(win.locator('.sb-row', { hasText: 'src' })).toBeVisible()
  await expect(win.locator('.sb-row', { hasText: 'dist' })).toHaveCount(0)
})

test('sidebar file rows show a tinted extension badge; dirs show a folder glyph', async ({ smoke }) => {
  const { userDataDir, projectDir } = seededFolder(smoke)
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
    const win = await app.firstWindow()
    await expect(win.locator('#sidebar')).toBeVisible()
    // top-level 'readme.md' → badge 'md'
    const mdRow = win.locator('.sb-row', { hasText: 'readme.md' })
    await expect(mdRow.locator('.sb-badge')).toHaveText('md')
    // the 'src' directory row → folder glyph
    await expect(win.locator('.sb-row', { hasText: 'src' }).locator('.sb-folder svg')).toBeVisible()
})

test('the edge tab toggles the sidebar and flips its chevron', async ({ smoke }) => {
  const { userDataDir, projectDir } = seededFolder(smoke)
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
    const win = await app.firstWindow()
    const tab = win.locator('.sb-toggle')
    await expect(win.locator('#sidebar')).toBeVisible()
    await expect(tab).toBeVisible()
    await expect(tab).toHaveText('‹')            // ‹ = open
    await tab.click()
    await expect(win.locator('#sidebar')).toBeHidden()
    await expect(tab).toHaveText('›')            // › = collapsed
    await tab.click()
    await expect(win.locator('#sidebar')).toBeVisible()
    await expect(tab).toHaveText('‹')
})

test('the edge tab is always available and opens the folder panel with no folder', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-smoke-') // no settings.json → no folder restored
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    await expect(win.locator('#sidebar')).toBeHidden()
    // No folder open is exactly when the tab is most useful: it is the shortcut to opening one.
    const tab = win.locator('.sb-toggle')
    await expect(tab).toBeVisible()
    await expect(tab).toHaveText('›')
    await tab.click()
    await expect(win.locator('#sidebar')).toBeVisible()
    await expect(win.locator('.sb-panel')).toBeVisible()
    // The button is asserted present, not clicked: it opens a native OS dialog, which Playwright
    // cannot drive. This is coverage of the wiring up to the dialog, and no further.
    await expect(win.locator('.sb-open-btn')).toHaveText('Open Folder…')
})

test('right-clicking the blank area below the folder panel does nothing (no tree, no crash)', async ({ smoke }) => {
  // The folder panel (.sb-panel) does not fill #sidebar's full height, so with no folder open
  // there is a blank region below it that IS #sidebar itself. Sidebar's host contextmenu handler
  // used to assume a root always existed there (`this.model.root!`), which was true before this
  // branch made the no-folder sidebar visible at all. Guard: src/renderer/folderMode.ts
  // contextMenu() early-returns when there is neither an entry nor a root.
  const userDataDir = smoke.tempDir('notes-smoke-') // no settings.json → no folder restored
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  const pageErrors: string[] = []
    const win = await app.firstWindow()
    win.on('pageerror', (e) => pageErrors.push(String(e)))
    await win.locator('.sb-toggle').click()
    await expect(win.locator('.sb-panel')).toBeVisible()
    const box = await win.locator('#sidebar').boundingBox()
    if (!box) throw new Error('#sidebar has no bounding box')
    // Right-click near the bottom of #sidebar — below the panel's own (much shorter) content box.
    await win.mouse.click(box.x + box.width / 2, box.y + box.height - 4, { button: 'right' })
    await expect(win.locator('#ctx-menu')).toHaveCount(0)
    await expect(win.locator('.ctx-item')).toHaveCount(0)
    expect(pageErrors).toEqual([])
})

/** A user-data dir with a seeded recent-folders list and NO settings.json, so the app starts
 *  with no folder open and the panel is what renders. */
function seededRecents(smoke: SmokeResources, paths: string[]): string {
  const userDataDir = smoke.tempDir('notes-smoke-')
  writeFileSync(join(userDataDir, 'recent-folders.json'), JSON.stringify(paths))
  return userDataDir
}

test('the folder panel lists recent folders and opening one shows its tree', async ({ smoke }) => {
  const projectDir = smoke.tempDir('notes-proj-')
  writeFileSync(join(projectDir, 'readme.md'), '# hi')
  const userDataDir = seededRecents(smoke, [projectDir])
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
    const win = await app.firstWindow()
    await win.locator('.sb-toggle').click()
    const row = win.locator('.sb-recent-row', { hasText: basename(projectDir) })
    await expect(row).toBeVisible()
    await row.click()
    // The tree replacing the panel is the completion signal — assert on a real file row.
    await expect(win.locator('.sb-row', { hasText: 'readme.md' })).toBeVisible()
    await expect(win.locator('.sb-panel')).toHaveCount(0)
})

test('clicking a recent folder that no longer exists prunes it from the list', async ({ smoke }) => {
  const gone = join(smoke.tempDir('notes-proj-deleted-'), 'missing')  // never created
  const userDataDir = seededRecents(smoke, [gone])
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
    const win = await app.firstWindow()
    await win.locator('.sb-toggle').click()
    await expect(win.locator('.sb-recent-row')).toHaveCount(1)
    await win.locator('.sb-recent-row').click()
    // Anchored on a positive stamp of the resolved row count, not on the raw row count: render()
    // clears and re-mounts the panel shell *before* awaiting the recents store, so a bare
    // `.sb-recent-row` count of 0 would also pass transiently mid-render (before rows are
    // re-appended), and even `[data-rendered] .sb-recent-row` count of 0 is equally satisfied by
    // the marked panel simply not being in the DOM during that whole window. data-recents="0" is
    // set only once the await resolves and can only be true once the round-trip is complete AND
    // resolved zero rows — a count of 1 here cannot be satisfied by absence.
    await expect(win.locator('.sb-panel[data-recents="0"]')).toHaveCount(1)  // pruned
    await expect(win.locator('.sb-panel')).toBeVisible()        // no folder was opened
})

test('opening a folder records it in the recent list', async ({ smoke }) => {
  const projectDir = smoke.tempDir('notes-proj-')
  writeFileSync(join(projectDir, 'readme.md'), '# hi')
  const userDataDir = smoke.tempDir('notes-smoke-')
  writeFileSync(join(userDataDir, 'settings.json'), JSON.stringify({
    restoreFolderOnLaunch: true, lastFolder: projectDir, sidebarVisible: true,
  }))
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
    const win = await app.firstWindow()
    await expect(win.locator('#sidebar .sb-row', { hasText: 'readme.md' })).toBeVisible()
    await win.keyboard.press('Control+Shift+P')
    await win.locator('.palette-row', { hasText: 'Close Folder' }).first().click()
    // Close Folder keeps the sidebar open and swaps the tree for the panel in place (spec:
    // "Close Folder returns the panel; the tab stays") — no extra .sb-toggle click needed to
    // reach it, unlike before this fix wave when Close Folder collapsed the sidebar.
    await expect(win.locator('#sidebar')).toBeVisible()
    await expect(win.locator('.sb-panel')).toBeVisible()
    // Restore-on-launch went through openFolder(), so the visit must have been recorded.
    await expect(win.locator('.sb-recent-row', { hasText: basename(projectDir) })).toBeVisible()
})

test('opening a file highlights (marks active) its row in the sidebar', async ({ smoke }) => {
  const { userDataDir, projectDir } = seededFolder(smoke)
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
    const win = await app.firstWindow()
    await expect(win.locator('#sidebar')).toBeVisible()
    const row = win.locator('.sb-row', { hasText: 'readme.md' })
    await expect(row).not.toHaveClass(/(^|\s)active(\s|$)/) // nothing selected on launch
    await row.click()                                       // open the file
    await expect(row).toHaveClass(/(^|\s)active(\s|$)/)      // its row is now marked active
})
