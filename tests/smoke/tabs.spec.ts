import { test, expect } from './smokeTest'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

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
