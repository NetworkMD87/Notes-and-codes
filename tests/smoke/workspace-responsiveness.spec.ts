import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect } from './smokeTest'
import { openSettings } from './settingsHelper'
import { createLargeWorkspace } from '../helpers/largeWorkspace'

function seedFolder(
  userDataDir: string,
  projectDir: string,
  extra: Record<string, unknown> = {},
): void {
  writeFileSync(join(userDataDir, 'settings.json'), JSON.stringify({
    restoreFolderOnLaunch: true,
    lastFolder: projectDir,
    sidebarVisible: true,
    showAllFiles: false,
    workspaceExcludes: ['**/dist/**'],
    ...extra,
  }))
}

test('workspace exclusions refresh the tree/index and Show All bypasses the saved list', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-excludes-profile-')
  const projectDir = smoke.tempDir('notes-excludes-project-')
  mkdirSync(join(projectDir, 'src'))
  mkdirSync(join(projectDir, 'dist'))
  writeFileSync(join(projectDir, 'src', 'keep.ts'), '')
  writeFileSync(join(projectDir, 'dist', 'excluded-target.ts'), '')
  seedFolder(userDataDir, projectDir)

  let app = await smoke.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`],
  })
  let win = await app.firstWindow()
  // data-booted is set only after folder.restore() and its initial tree/index refresh settle.
  await expect(win.locator('body')).toHaveAttribute('data-booted', 'true')
  await expect(win.locator('.sb-row', { hasText: 'src' })).toBeVisible()
  await expect(win.locator('.sb-row', { hasText: 'dist' })).toHaveCount(0)
  await win.keyboard.press('Control+p')
  let quick = win.getByRole('combobox', { name: 'Quick Open' })
  await quick.fill('excluded-target')
  await expect(win.locator('.qo-row')).toHaveCount(0)
  await quick.press('Escape')

  await openSettings(win, 'Folder')
  let editor = win.getByLabel('Exclude from workspace')
  await expect(editor).toHaveAttribute('aria-describedby', 'workspace-excludes-help')
  await editor.fill('**/src/**')
  await editor.press('Tab')
  await expect(win.getByRole('button', { name: 'Restore defaults' })).toBeFocused()
  // The sidebar changes only when runRefresh has published both tree children and candidates.
  await expect(win.locator('.sb-row', { hasText: 'dist' })).toBeVisible()
  await expect(win.locator('.sb-row', { hasText: 'src' })).toHaveCount(0)
  await win.getByRole('button', { name: 'Close Settings' }).click()
  await win.keyboard.press('Control+p')
  quick = win.getByRole('combobox', { name: 'Quick Open' })
  await quick.fill('excluded-target')
  await expect(win.locator('.qo-row').first()).toContainText('excluded-target.ts')
  await quick.fill('keep')
  await expect(win.locator('.qo-row')).toHaveCount(0)
  await quick.press('Escape')

  await openSettings(win, 'Folder')
  editor = win.getByLabel('Exclude from workspace')
  const showAll = win.getByLabel('Show all files (incl. node_modules / .git)')
  await showAll.check()
  // Seeing src anchors completion of the Show All refresh before the index is queried.
  await expect.soft(win.locator('.sb-row', { hasText: 'src' })).toBeVisible()
  await expect(editor).toHaveValue('**/src/**')
  await win.getByRole('button', { name: 'Close Settings' }).click()
  await win.keyboard.press('Control+p')
  quick = win.getByRole('combobox', { name: 'Quick Open' })
  await quick.fill('keep')
  await expect.soft(win.locator('.qo-row').first()).toContainText('keep.ts')
  await quick.press('Escape')

  // Return to exclusions-on before relaunch so the persisted list has an observable effect.
  await openSettings(win, 'Folder')
  editor = win.getByLabel('Exclude from workspace')
  await showAll.uncheck()
  await expect(win.locator('.sb-row', { hasText: 'src' })).toHaveCount(0)
  await expect(editor).toHaveValue('**/src/**')
  await win.getByRole('button', { name: 'Close Settings' }).click()
  await app.close()

  app = await smoke.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`],
  })
  win = await app.firstWindow()
  await expect(win.locator('body')).toHaveAttribute('data-booted', 'true')
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

test('Quick Open returns the deterministic bounded result in a 20,000-file workspace', async ({ smoke }) => {
  test.setTimeout(60_000)
  const userDataDir = smoke.tempDir('notes-large-profile-')
  const projectDir = smoke.tempDir('notes-large-project-')
  createLargeWorkspace(projectDir)
  seedFolder(userDataDir, projectDir)

  const app = await smoke.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`],
  })
  const win = await app.firstWindow()
  // Boot completion includes the full 20,000-file folder walk and candidate publication.
  await expect(win.locator('body')).toHaveAttribute('data-booted', 'true')
  await win.keyboard.press('Control+p')
  const quick = win.getByRole('combobox', { name: 'Quick Open' })
  await quick.fill('workspace-target')
  await expect(win.locator('.qo-name')).toHaveText(['workspace-target.ts'])

  await quick.fill('file')
  await expect(win.locator('.qo-row')).toHaveCount(50)
  await expect(win.locator('.qo-name')).toHaveText([
    'file-00000.ts', 'file-00001.ts', 'file-00002.ts', 'file-00003.ts', 'file-00004.ts',
    'file-00005.ts', 'file-00006.ts', 'file-00007.ts', 'file-00008.ts', 'file-00009.ts',
    'file-00010.ts', 'file-00011.ts', 'file-00012.ts', 'file-00013.ts', 'file-00014.ts',
    'file-00015.ts', 'file-00016.ts', 'file-00017.ts', 'file-00018.ts', 'file-00019.ts',
    'file-00020.ts', 'file-00021.ts', 'file-00022.ts', 'file-00023.ts', 'file-00024.ts',
    'file-00025.ts', 'file-00026.ts', 'file-00027.ts', 'file-00028.ts', 'file-00029.ts',
    'file-00030.ts', 'file-00031.ts', 'file-00032.ts', 'file-00033.ts', 'file-00034.ts',
    'file-00035.ts', 'file-00036.ts', 'file-00037.ts', 'file-00038.ts', 'file-00039.ts',
    'file-00040.ts', 'file-00041.ts', 'file-00042.ts', 'file-00043.ts', 'file-00044.ts',
    'file-00045.ts', 'file-00046.ts', 'file-00047.ts', 'file-00048.ts', 'file-00049.ts',
  ])
})
