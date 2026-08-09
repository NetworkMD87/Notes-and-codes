import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect } from './smokeTest'

test('overlapping session saves restore only the newest snapshot', async ({ smoke }) => {
  const userDataDir = smoke.tempDir('notes-sessionlatest-')
  const filePath = join(userDataDir, 'session-note.txt')
  writeFileSync(filePath, '')
  const env = { ...process.env, NC_TEST_SESSION_SAVE_DELAY_MS: '1000' }
  const app1 = await smoke.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`, filePath],
    env,
  })
  const win1 = await app1.firstWindow()
  await expect(win1.locator('body[data-booted="true"]')).toBeVisible()
  const editor = win1.locator('#paneA .monaco-editor')
  await editor.click()
  await win1.keyboard.type('old')
  await expect(win1.locator('body')).toHaveAttribute('data-session-write-state', 'active')
  await win1.keyboard.insertText('-newest')
  await expect(win1.locator('body')).toHaveAttribute('data-session-write-state', 'active-pending')
  const editRevision = Number(await win1.locator('body').getAttribute('data-session-write-revision'))
  await win1.keyboard.press('Control+Shift+P')
  await win1.locator('#palette input').fill('Save')
  await win1.keyboard.press('Enter')
  await expect.poll(() => readFileSync(filePath, 'utf8')).toBe('old-newest')
  await expect(win1.locator('.sb-state')).toHaveText('● saved')
  await expect.poll(async () => Number(await win1.locator('body').getAttribute('data-session-write-revision')))
    .toBeGreaterThan(editRevision)
  const closed = app1.waitForEvent('close')
  await app1.evaluate(({ Menu }) => {
    const file = Menu.getApplicationMenu()!.items.find(item => item.label === 'File')!
    file.submenu!.items.find(item => item.label === 'Exit')!.click()
  }).catch(() => {})
  await closed

  // Session restore uses the persisted snapshot rather than re-reading this path. Replacing
  // the file makes the assertion below discriminate session state from an ordinary disk open.
  writeFileSync(filePath, 'disk-decoy')
  const app2 = await smoke.launch({
    args: ['out/main/index.js', `--user-data-dir=${userDataDir}`],
  })
  const win2 = await app2.firstWindow()
  await expect(win2.locator('body[data-booted="true"]')).toBeVisible()
  await expect(win2.locator('#paneA .view-lines')).toContainText('old-newest')
})
