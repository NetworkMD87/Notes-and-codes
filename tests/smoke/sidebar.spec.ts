import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, basename } from 'node:path'

function seededFolder() {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-smoke-'))
  const projectDir = mkdtempSync(join(tmpdir(), 'notes-proj-'))
  mkdirSync(join(projectDir, 'src'))
  writeFileSync(join(projectDir, 'src', 'alpha.ts'), '// alpha')
  writeFileSync(join(projectDir, 'readme.md'), '# hi')
  writeFileSync(join(userDataDir, 'settings.json'), JSON.stringify({
    restoreFolderOnLaunch: true, lastFolder: projectDir, sidebarVisible: true,
  }))
  return { userDataDir, projectDir }
}

test('sidebar shows a header caption with the open folder name', async () => {
  const { userDataDir, projectDir } = seededFolder()
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#sidebar')).toBeVisible()
    const header = win.locator('#sidebar .sb-header')
    await expect(header).toBeVisible()
    await expect(header.locator('.sb-label')).toHaveText(basename(projectDir)) // CSS uppercases; DOM text is the basename
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
    rmSync(projectDir, { recursive: true, force: true })
  }
})

test('the sidebar header switches folders from the recent list', async () => {
  const { userDataDir, projectDir } = seededFolder()
  const other = mkdtempSync(join(tmpdir(), 'notes-other-'))
  writeFileSync(join(other, 'other.txt'), 'x')
  writeFileSync(join(userDataDir, 'recent-folders.json'), JSON.stringify([other, projectDir]))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
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
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
    rmSync(projectDir, { recursive: true, force: true })
    rmSync(other, { recursive: true, force: true })
  }
})

test('nested sidebar rows carry a --depth for indent guides', async () => {
  const { userDataDir, projectDir } = seededFolder()
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#sidebar')).toBeVisible()
    // top-level 'src' dir is depth 0; expand it so its child 'alpha.ts' renders at depth 1.
    await win.locator('.sb-row', { hasText: 'src' }).click()
    const child = win.locator('.sb-row', { hasText: 'alpha.ts' })
    await expect(child).toBeVisible()
    const depth = await child.evaluate((el) => (el as HTMLElement).style.getPropertyValue('--depth'))
    expect(Number(depth)).toBeGreaterThanOrEqual(1)
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
    rmSync(projectDir, { recursive: true, force: true })
  }
})

test('sidebar file rows show a tinted extension badge; dirs show a folder glyph', async () => {
  const { userDataDir, projectDir } = seededFolder()
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#sidebar')).toBeVisible()
    // top-level 'readme.md' → badge 'md'
    const mdRow = win.locator('.sb-row', { hasText: 'readme.md' })
    await expect(mdRow.locator('.sb-badge')).toHaveText('md')
    // the 'src' directory row → folder glyph
    await expect(win.locator('.sb-row', { hasText: 'src' }).locator('.sb-folder svg')).toBeVisible()
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
    rmSync(projectDir, { recursive: true, force: true })
  }
})

test('the edge tab toggles the sidebar and flips its chevron', async () => {
  const { userDataDir, projectDir } = seededFolder()
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
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
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
    rmSync(projectDir, { recursive: true, force: true })
  }
})

test('the edge tab is always available and opens the folder panel with no folder', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-smoke-')) // no settings.json → no folder restored
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
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
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

/** A user-data dir with a seeded recent-folders list and NO settings.json, so the app starts
 *  with no folder open and the panel is what renders. */
function seededRecents(paths: string[]): string {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-smoke-'))
  writeFileSync(join(userDataDir, 'recent-folders.json'), JSON.stringify(paths))
  return userDataDir
}

test('the folder panel lists recent folders and opening one shows its tree', async () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'notes-proj-'))
  writeFileSync(join(projectDir, 'readme.md'), '# hi')
  const userDataDir = seededRecents([projectDir])
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await win.locator('.sb-toggle').click()
    const row = win.locator('.sb-recent-row', { hasText: basename(projectDir) })
    await expect(row).toBeVisible()
    await row.click()
    // The tree replacing the panel is the completion signal — assert on a real file row.
    await expect(win.locator('.sb-row', { hasText: 'readme.md' })).toBeVisible()
    await expect(win.locator('.sb-panel')).toHaveCount(0)
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
    rmSync(projectDir, { recursive: true, force: true })
  }
})

test('clicking a recent folder that no longer exists prunes it from the list', async () => {
  const gone = join(tmpdir(), 'notes-proj-deleted-2f9c1a')  // never created
  const userDataDir = seededRecents([gone])
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await win.locator('.sb-toggle').click()
    await expect(win.locator('.sb-recent-row')).toHaveCount(1)
    await win.locator('.sb-recent-row').click()
    await expect(win.locator('.sb-recent-row')).toHaveCount(0)  // pruned
    await expect(win.locator('.sb-panel')).toBeVisible()        // no folder was opened
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('opening a folder records it in the recent list', async () => {
  const projectDir = mkdtempSync(join(tmpdir(), 'notes-proj-'))
  writeFileSync(join(projectDir, 'readme.md'), '# hi')
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-smoke-'))
  writeFileSync(join(userDataDir, 'settings.json'), JSON.stringify({
    restoreFolderOnLaunch: true, lastFolder: projectDir, sidebarVisible: true,
  }))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#sidebar .sb-row', { hasText: 'readme.md' })).toBeVisible()
    await win.keyboard.press('Control+Shift+P')
    await win.locator('.palette-row', { hasText: 'Close Folder' }).first().click()
    await win.locator('.sb-toggle').click()
    // Restore-on-launch went through openFolder(), so the visit must have been recorded.
    await expect(win.locator('.sb-recent-row', { hasText: basename(projectDir) })).toBeVisible()
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
    rmSync(projectDir, { recursive: true, force: true })
  }
})

test('opening a file highlights (marks active) its row in the sidebar', async () => {
  const { userDataDir, projectDir } = seededFolder()
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#sidebar')).toBeVisible()
    const row = win.locator('.sb-row', { hasText: 'readme.md' })
    await expect(row).not.toHaveClass(/(^|\s)active(\s|$)/) // nothing selected on launch
    await row.click()                                       // open the file
    await expect(row).toHaveClass(/(^|\s)active(\s|$)/)      // its row is now marked active
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
    rmSync(projectDir, { recursive: true, force: true })
  }
})
