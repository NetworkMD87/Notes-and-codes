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
