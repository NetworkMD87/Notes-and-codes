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
    await expect(header).toHaveText(basename(projectDir)) // CSS uppercases; DOM text is the basename
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
    rmSync(projectDir, { recursive: true, force: true })
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

test('the edge tab is hidden when no folder is open (default scratchpad)', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-smoke-')) // no settings.json → no folder restored
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
    const win = await app.firstWindow()
    await expect(win.locator('#tabbar')).toBeVisible()
    await expect(win.locator('#sidebar')).toBeHidden()
    // No folder → no sidebar to toggle → the edge tab must not float over the editor.
    await expect(win.locator('.sb-toggle')).toBeHidden()
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
