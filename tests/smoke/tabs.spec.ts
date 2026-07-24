import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('a file tab shows its language badge; a scratch tab shows a badge too', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'notes-smoke-'))
  const projectDir = mkdtempSync(join(tmpdir(), 'notes-proj-'))
  mkdirSync(join(projectDir, 'src'))
  writeFileSync(join(projectDir, 'src', 'alpha.ts'), '// alpha')
  writeFileSync(join(userDataDir, 'settings.json'), JSON.stringify({
    restoreFolderOnLaunch: true, lastFolder: projectDir, sidebarVisible: true,
  }))
  const app = await electron.launch({ args: ['out/main/index.js', `--user-data-dir=${userDataDir}`] })
  try {
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
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
    rmSync(projectDir, { recursive: true, force: true })
  }
})
