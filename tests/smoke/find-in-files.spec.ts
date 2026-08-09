import { test, expect } from './smokeTest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { SearchResponse } from '../../src/shared/types'

test('the search:files channel returns matches from the folder', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-search-')
  const folder = smoke.tempDir('notes-searchdir-')
  mkdirSync(join(folder, 'sub'))
  writeFileSync(join(folder, 'a.txt'), 'has a needle here')
  writeFileSync(join(folder, 'sub', 'b.txt'), 'needle again')
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    const res = await win.evaluate((root) => window.api.searchFiles({
      root, query: 'needle',
      opts: { caseSensitive: false, wholeWord: false },
      skipPaths: [], filter: { showAll: false, excludePatterns: [] },
      scope: { includePatterns: [], excludePatterns: [] }, searchId: 1,
    }), folder) as SearchResponse
    expect(res.totalMatches).toBe(2)
    expect(res.files).toHaveLength(2)
})

// The native folder dialog is not automatable, so the suite opens a folder by seeding
// settings.json with lastFolder + restoreFolderOnLaunch and letting startup restore it.
// This is exactly what sidebar.spec.ts does — reuse it, do not invent a test-only channel.
function seededFolder(smoke: import('./smokeCleanup').SmokeResources) {
  const userDataDir = smoke.tempDir('notes-searchui-')
  const projectDir = smoke.tempDir('notes-searchproj-')
  mkdirSync(join(projectDir, 'src'))
  writeFileSync(join(projectDir, 'src', 'target.txt'), 'line one\nline two has zorkmid\nline three')
  writeFileSync(join(userDataDir, 'settings.json'), JSON.stringify({
    restoreFolderOnLaunch: true, lastFolder: projectDir, sidebarVisible: true,
  }))
  return { userDataDir, projectDir }
}

test('Ctrl+Shift+F finds a match in the folder and jumps to it', async ({ smoke }) => {
  const { userDataDir, projectDir } = seededFolder(smoke)
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
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
    // openPath alone (no revealMatch) would leave the cursor at Ln 1 — the file's text renders
    // either way, so the assertion above passes even with revealMatch deleted. The match is on
    // line 2 of the fixture; only revealMatch moves the cursor there, and only revealMatch seeds
    // Monaco's find widget from the selection it makes.
    await expect(win.locator('#statusbar')).toContainText('Ln 2')
    await expect(win.locator('.find-widget.visible')).toBeVisible()
})

// This variant opens NO folder (the file arrives as a bare argv file arg), so runSearch() takes
// the early `!root` return and never reaches the skipPaths-guarded disk search at all — see the
// next test for that. What this one DOES prove is real: that a dirty buffer is searched from its
// current, live content rather than some stale snapshot cached at overlay-open time or at the
// first debounced search.
test('with no folder open, a dirty buffer is searched from its live content, not a stale snapshot', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-searchlive-')
  const folder = smoke.tempDir('notes-searchlivedir-')
  const file = join(folder, 'live.txt')
  writeFileSync(file, 'ondiskonly')
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, file] })
    const win = await app.firstWindow()
    await expect(win.locator('#paneA .view-lines')).toContainText('ondiskonly')
    await win.locator('#paneA .monaco-editor').click()
    await win.keyboard.press('Control+A')
    await win.keyboard.type('typedonly')   // buffer now differs from disk, unsaved

    await win.keyboard.press('Control+Shift+F')
    await win.locator('.fif-head input').fill('typedonly')
    await expect(win.locator('.fif-row')).toHaveCount(1)      // (a) live content IS searched

    await win.locator('.fif-head input').fill('ondiskonly')
    await expect(win.locator('.fif-row')).toHaveCount(0)      // (b) the old content is NOT (buffer-only guard)
})

// THIS is the test that actually exercises skipPaths. A folder must be open AND the dirtied file
// must live inside it — only then does runSearch() have a non-null root() and reach the
// window.api.searchFiles() call skipPaths feeds into. Without a folder (the test above), that
// whole branch is skipped and the guard is untestable — a falsification of skipPaths there stays
// green no matter what, which is a hollow guard, not a working one. Falsified 2026-07-25: setting
// skipPaths to [] in findInFiles.ts made assertion (b) below go red (the stale on-disk copy
// resurfaced); reverting made it green again.
test('a dirty buffer for a file inside an open folder is searched live, not from its stale copy on disk', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-searchlivefolder-')
  const projectDir = smoke.tempDir('notes-searchlivefolderdir-')
  writeFileSync(join(projectDir, 'live.txt'), 'ondiskonly')
  writeFileSync(join(userDataDir, 'settings.json'), JSON.stringify({
    restoreFolderOnLaunch: true, lastFolder: projectDir, sidebarVisible: true,
  }))
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
    const win = await app.firstWindow()
    await expect(win.locator('#sidebar')).toBeVisible()   // the folder was restored
    await win.locator('.sb-row', { hasText: 'live.txt' }).click()   // open the in-folder file as a tab
    await expect(win.locator('#paneA .view-lines')).toContainText('ondiskonly')
    await win.locator('#paneA .monaco-editor').click()
    await win.keyboard.press('Control+A')
    await win.keyboard.type('typedonly')   // buffer now differs from disk, unsaved — but the file
                                            // is still inside the open folder root

    await win.keyboard.press('Control+Shift+F')
    await win.locator('.fif-head input').fill('typedonly')
    await expect(win.locator('.fif-row')).toHaveCount(1)      // (a) live content IS searched

    await win.locator('.fif-head input').fill('ondiskonly')
    // render() clears the list synchronously while `searching` is still true (findInFiles.ts
    // render()/runSearch()), so `.fif-row` reads 0 the instant the query changes too — before the
    // disk search has even been asked. Anchor on the completion-only `.fif-empty` state first so
    // the zero-count assertion below can't be satisfied by that transient empty list.
    await expect(win.locator('.fif-empty')).toBeVisible()   // search finished, zero results
    await expect(win.locator('.fif-row')).toHaveCount(0)      // (b) the stale on-disk copy is NOT — proves skipPaths
})

test('scopes disk and live results with accessible session-local controls', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-searchscope-')
  const projectDir = smoke.tempDir('notes-searchscopeproj-')
  mkdirSync(join(projectDir, 'src'))
  mkdirSync(join(projectDir, 'docs'))
  writeFileSync(join(projectDir, 'src', 'dirty.ts'), 'stale disk text')
  writeFileSync(join(projectDir, 'src', 'clean.ts'), 'scoped needle')
  writeFileSync(join(projectDir, 'src', 'disk-only.ts'), 'scoped needle')
  writeFileSync(join(projectDir, 'src', 'drop.test.ts'), 'scoped needle')
  writeFileSync(join(projectDir, 'docs', 'drop.md'), 'scoped needle')
  writeFileSync(join(userDataDir, 'settings.json'), JSON.stringify({
    restoreFolderOnLaunch: true,
    lastFolder: projectDir,
    sidebarVisible: true,
  }))

  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  const win = await app.firstWindow()
  await expect(win.locator('body[data-booted="true"]')).toBeVisible()

  // The startup untitled buffer supplies the pathless/live category.
  await win.locator('#paneA .monaco-editor').click()
  await win.keyboard.type('scoped needle')

  await win.locator('.sb-row', { hasText: 'src' }).click()
  await win.locator('.sb-row', { hasText: 'dirty.ts' }).click()
  await expect(win.locator('#paneA .view-lines')).toContainText('stale disk text')
  await win.locator('#paneA .monaco-editor').click()
  await win.keyboard.press('Control+A')
  await win.keyboard.type('scoped needle')
  await win.locator('.sb-row', { hasText: 'clean.ts' }).click()
  await expect(win.locator('#paneA .view-lines')).toContainText('scoped needle')

  await win.keyboard.press('Control+Shift+F')
  const dialog = win.getByRole('dialog', { name: 'Find in Files' })
  await expect(dialog).toBeVisible()

  // The dirty live buffer shadows its stale disk copy before scope is applied.
  await win.getByRole('searchbox', { name: 'Find in Files' }).fill('stale disk text')
  await expect(win.locator('.fif-empty')).toContainText('No matches for')
  await expect(win.locator('.fif-file')).toHaveCount(0)

  const scopeButton = win.getByRole('button', { name: 'Search scope' })
  await expect(win.getByText('All files · excluding 6 workspace patterns')).toBeVisible()
  await expect(scopeButton).toHaveAttribute('aria-controls', 'find-in-files-scope')
  await expect(scopeButton).toHaveAttribute('aria-expanded', 'false')
  await scopeButton.click()
  await expect(scopeButton).toHaveAttribute('aria-expanded', 'true')
  await expect(win.getByRole('group', { name: 'Search scope filters' })).toBeVisible()
  await win.getByLabel('Files to include').fill('src/**/*.ts')
  await win.getByLabel('Files to exclude').fill('**/*.test.ts')
  await win.getByRole('searchbox', { name: 'Find in Files' }).fill('scoped needle')

  await expect(win.getByText('src/**/*.ts · excluding 6 workspace patterns + 1 search pattern')).toBeVisible()
  await expect(win.locator('.fif-file')).toHaveCount(3)
  await expect(win.locator('.fif-file')).toContainText(['src\\dirty.ts', 'src\\clean.ts', 'src\\disk-only.ts'])
  await expect(win.locator('.fif-file')).not.toContainText(['src\\drop.test.ts', 'docs\\drop.md', 'Untitled-1'])

  await win.getByLabel('Files to include').fill('')
  await expect(win.locator('.fif-file', { hasText: 'Untitled-1' })).toHaveCount(1)

  // Retained for this app session, but not persisted through Settings.
  await win.getByLabel('Files to include').fill('src/**/*.ts')
  await win.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await win.keyboard.press('Control+Shift+F')
  await expect(win.getByLabel('Files to include')).toHaveValue('src/**/*.ts')
  await expect(win.getByLabel('Files to exclude')).toHaveValue('**/*.test.ts')
})

test('Escape closes the overlay', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-searchesc-')
  const app = await smoke.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    await win.keyboard.press('Control+Shift+F')
    await expect(win.locator('.fif-box')).toBeVisible()
    await win.keyboard.press('Escape')
    await expect(win.locator('.fif-box')).toBeHidden()
})

test('closing Find in Files cancels main traversal and never repaints', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-searchcancel-')
  const projectDir = smoke.tempDir('notes-searchcancelproj-')
  for (let i = 0; i < 400; i++) {
    const nested = join(projectDir, `d${String(i).padStart(3, '0')}`)
    mkdirSync(nested)
    writeFileSync(join(nested, 'file.txt'), 'needle')
  }
  writeFileSync(join(userDataDir, 'settings.json'), JSON.stringify({
    restoreFolderOnLaunch: true,
    lastFolder: projectDir,
    sidebarVisible: true,
  }))

  const app = await smoke.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`],
    env: { ...process.env, NC_TEST_SLOW_SEARCH_MS: '5' },
  })
  const win = await app.firstWindow()
  await expect(win.locator('body[data-booted="true"]')).toBeVisible()
  await win.keyboard.press('Control+Shift+F')
  await win.locator('.fif-head input').fill('needle')
  await expect(win.locator('.fif-note')).toContainText('Searching')
  await win.keyboard.press('Escape')
  await expect(win.locator('.fif-box')).toBeHidden()
  await expect.poll(
    () => win.locator('#find-in-files').getAttribute('data-last-search-state'),
    { timeout: 1000 },
  ).toBe('cancelled')
  await win.waitForTimeout(250)
  await expect(win.locator('.fif-box')).toBeHidden()
  await expect(win.locator('.fif-row')).toHaveCount(0)
})
