import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { SearchResponse } from '../../src/shared/types'

test('the search:files channel returns matches from the folder', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-search-'))
  const folder = mkdtempSync(join(tmpdir(), 'notes-searchdir-'))
  mkdirSync(join(folder, 'sub'))
  writeFileSync(join(folder, 'a.txt'), 'has a needle here')
  writeFileSync(join(folder, 'sub', 'b.txt'), 'needle again')
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    const res = await win.evaluate((root) => window.api.searchFiles({
      root, query: 'needle',
      opts: { caseSensitive: false, wholeWord: false },
      skipPaths: [], showAll: false, searchId: 1,
    }), folder) as SearchResponse
    expect(res.totalMatches).toBe(2)
    expect(res.files).toHaveLength(2)
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
    rmSync(folder, { recursive: true, force: true })
  }
})

// The native folder dialog is not automatable, so the suite opens a folder by seeding
// settings.json with lastFolder + restoreFolderOnLaunch and letting startup restore it.
// This is exactly what sidebar.spec.ts does — reuse it, do not invent a test-only channel.
function seededFolder() {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-searchui-'))
  const projectDir = mkdtempSync(join(tmpdir(), 'notes-searchproj-'))
  mkdirSync(join(projectDir, 'src'))
  writeFileSync(join(projectDir, 'src', 'target.txt'), 'line one\nline two has zorkmid\nline three')
  writeFileSync(join(userDataDir, 'settings.json'), JSON.stringify({
    restoreFolderOnLaunch: true, lastFolder: projectDir, sidebarVisible: true,
  }))
  return { userDataDir, projectDir }
}

test('Ctrl+Shift+F finds a match in the folder and jumps to it', async () => {
  const { userDataDir, projectDir } = seededFolder()
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#sidebar')).toBeVisible()   // the folder was restored
    await win.keyboard.press('Control+Shift+F')
    await expect(win.locator('.fif-box')).toBeVisible()
    await win.locator('.fif-head input').fill('zorkmid')
    await expect(win.locator('.fif-row')).toHaveCount(1)
    await expect(win.locator('.fif-note')).toContainText('1 match in 1 file')
    await win.keyboard.press('Enter')
    await expect(win.locator('.fif-box')).toBeHidden()
    await expect(win.locator('#paneA .view-lines')).toContainText('zorkmid')
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
    rmSync(projectDir, { recursive: true, force: true })
  }
})

test('a dirty buffer is searched live, not from its stale copy on disk', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-searchlive-'))
  const folder = mkdtempSync(join(tmpdir(), 'notes-searchlivedir-'))
  const file = join(folder, 'live.txt')
  writeFileSync(file, 'ondiskonly')
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, file] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#paneA .view-lines')).toContainText('ondiskonly')
    await win.locator('#paneA .monaco-editor').click()
    await win.keyboard.press('Control+A')
    await win.keyboard.type('typedonly')   // buffer now differs from disk, unsaved

    await win.keyboard.press('Control+Shift+F')
    await win.locator('.fif-head input').fill('typedonly')
    await expect(win.locator('.fif-row')).toHaveCount(1)      // (a) live content IS searched

    await win.locator('.fif-head input').fill('ondiskonly')
    await expect(win.locator('.fif-row')).toHaveCount(0)      // (b) the stale disk copy is NOT
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
    rmSync(folder, { recursive: true, force: true })
  }
})

test('Escape closes the overlay', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-searchesc-'))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    await win.keyboard.press('Control+Shift+F')
    await expect(win.locator('.fif-box')).toBeVisible()
    await win.keyboard.press('Escape')
    await expect(win.locator('.fif-box')).toBeHidden()
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
